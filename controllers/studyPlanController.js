const Task = require('../models/Task');
const User = require('../models/User');
const Subject = require('../models/Subject');
const { buildDashboardViewModel } = require('../utils/dashboardViewModel');
const StudyPlan = require('../models/StudyPlan');
const aiSchedulingEngine = require('../services/aiSchedulingEngine');
const { buildPlanViewModel } = require('../utils/planViewModel');

/**
 * GET /study-plan
 * The student's dashboard (FR-16): this week's plan as a calendar with
 * clock times, or the full plan as a list, plus weekly progress and the
 * next deadline.
 *
 * Only ever loads the student's own active plan, so a superseded plan or
 * another student's plan can't be rendered by guessing an id.
 */
async function showStudyPlan(req, res, next) {
  try {
    const userId = req.user.id;

    const plan = await StudyPlan.findOne({ user: userId, status: 'active' })
      .populate('blocks.task', 'description deadline status')
      .populate('blocks.subject', 'name code colour');

    const planView = buildPlanViewModel(plan);

    // 'calendar' (default) or 'list', chosen with the toggle on the page.
    const currentView = req.query.view === 'list' ? 'list' : 'calendar';

    // Which week the calendar shows: 0 = this week, 1 = next week, etc.
    const weekOffset = Math.max(-52, Math.min(52, parseInt(req.query.week, 10) || 0));

    const today = new Date();
    const startToday = new Date(today);
    startToday.setHours(0, 0, 0, 0);

    const [subjects, upcomingTasks] = await Promise.all([
      Subject.find({ user: userId }).sort({ createdAt: 1 }),
      // Every unfinished task that isn't overdue, soonest first.
      Task.find({ user: userId, status: 'pending', deadline: { $gte: startToday } })
        .sort({ deadline: 1 })
        .populate('subject', 'name code colour'),
    ]);

    const dashboard = buildDashboardViewModel(planView, {
      studyStartTime: req.user.studyStartTime,
      weekOffset,
      upcomingTasks,
      today,
    });

    // "What changed" notes from the latest regeneration (FR-15).
    const changes = plan && req.query.regenerated
      ? plan.adjustments.map((a) => a.note).filter(Boolean)
      : [];

    return res.render('studyPlan/index', {
      planView,
      changes,
      dashboard,
      subjects,
      currentView,
      user: req.user,
      todayLabel: today.toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /study-plan/generate
 * FR-12 / FR-15: generate the plan, or regenerate it so it adapts to what
 * has actually happened since the last plan:
 *   - hours already studied (ticked sessions) are taken off each task,
 *   - past sessions that were not done are marked missed and their hours
 *     are rescheduled,
 *   - if today's study time has already started or been used, today only
 *     gets the time that's left,
 *   - long tasks are split into sessions so subjects are mixed across days.
 * The old plan is kept as 'superseded' and a list of what changed is saved
 * on the new plan (adjustments), which the dashboard shows.
 */
async function generateStudyPlan(req, res) {
  try {
    const userId = req.user.id;
    const availableStudyTimeHours = req.user.availableStudyTimeHours;
    const studyStartTime = req.user.studyStartTime || '18:00';
    const maxSessionHours = (req.user.sessionLengthMinutes || 60) / 60;

    if (!availableStudyTimeHours || availableStudyTimeHours <= 0) {
      return res.status(400).json({
        message: 'Please set your available study time before generating a plan.',
      });
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dayKey = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

    const oldPlan = await StudyPlan.findOne({ user: userId, status: 'active' });

    // ---- What happened in the old plan ----
    const doneHoursByTask = {};
    const keptBlocks = [];      // history carried into the new plan
    let newlyDoneHours = 0;     // ticked since the last plan was made
    let newlyMissedHours = 0;   // became missed since the last plan was made
    let doneTodayHours = 0;

    if (oldPlan) {
      const carried = oldPlan.carriedBlockCount || 0;

      oldPlan.blocks.forEach((block, index) => {
        const taskId = String(block.task);
        const isHistory = index < carried;
        const isPast = dayKey(block.date) < today.getTime();
        const isToday = dayKey(block.date) === today.getTime();

        if (block.status === 'complete') {
          doneHoursByTask[taskId] = (doneHoursByTask[taskId] || 0) + block.allocatedHours;
          if (!isHistory) newlyDoneHours += block.allocatedHours;
          if (isToday) doneTodayHours += block.allocatedHours;
          if (isPast || isToday) keptBlocks.push({ ...block.toObject(), _id: undefined });
        } else if (isPast || block.status === 'missed') {
          // Not done and the day has gone: keep it as missed, reschedule its hours.
          if (!isHistory) newlyMissedHours += block.allocatedHours;
          keptBlocks.push({ ...block.toObject(), _id: undefined, status: 'missed' });
        }
      });
    }

    // ---- Work that is still left ----
    const pendingTasks = await Task.find({ user: userId, status: 'pending' }).sort({ deadline: 1 });
    const tasksToPlan = [];

    for (const task of pendingTasks) {
      const remaining = task.estimatedEffortHours - (doneHoursByTask[String(task._id)] || 0);
      if (remaining <= 0.01) {
        task.status = 'complete'; // all its hours are already studied
        await task.save();
      } else {
        tasksToPlan.push({
          _id: task._id,
          subject: task.subject,
          deadline: task.deadline,
          priority: task.priority,
          estimatedEffortHours: Math.round(remaining * 100) / 100,
        });
      }
    }

    if (tasksToPlan.length === 0) {
      return res.status(400).json({
        message: pendingTasks.length
          ? 'Everything is already studied. Add a new task to plan more.'
          : 'Add at least one subject and task before generating a plan.',
      });
    }

    // ---- How much time is left today ----
    const [startHour, startMinute] = studyStartTime.split(':').map(Number);
    const windowStart = new Date(today);
    windowStart.setHours(startHour, startMinute, 0, 0);
    const windowEnd = new Date(windowStart.getTime() + availableStudyTimeHours * 3600000);

    let firstDayHours = availableStudyTimeHours - doneTodayHours;
    let timeNote = null;
    if (now >= windowEnd) {
      firstDayHours = 0;
      timeNote = "Today's study time has passed, so new sessions start tomorrow.";
    } else if (now > windowStart) {
      // Part-way through today's study time: only what's left of it.
      const hoursLeftInWindow = (windowEnd - now) / 3600000;
      firstDayHours = Math.min(firstDayHours, Math.floor(hoursLeftInWindow * 2) / 2);
    }
    firstDayHours = Math.max(0, firstDayHours);

    let result;
    try {
      result = await aiSchedulingEngine.generatePlan({
        tasks: tasksToPlan,
        availableStudyTimeHours,
        startDate: today,
        maxSessionHours,
        firstDayHours,
      });
    } catch (serviceError) {
      console.error('Scheduling engine failed:', serviceError.message);

      // FR-17: a failed regeneration must not leave the student without a
      // plan at all, so fall back to whatever they had before.
      if (oldPlan) {
        return res.status(200).json({
          message: 'Could not regenerate the plan just now, showing your last saved plan instead.',
          plan: oldPlan,
        });
      }
      return res.status(502).json({
        message: 'Could not generate a study plan right now. Please try again shortly.',
      });
    }

    // ---- Describe what changed (shown on the dashboard) ----
    const adjustments = [];
    if (!oldPlan) {
      adjustments.push({ trigger: 'initial', note: 'Initial plan generated.' });
    } else {
      if (newlyDoneHours > 0) {
        adjustments.push({ trigger: 'task_completed', note: `${newlyDoneHours}h you studied since the last plan were taken off your remaining work.` });
      }
      if (newlyMissedHours > 0) {
        adjustments.push({ trigger: 'task_missed', note: `${newlyMissedHours}h of missed sessions were moved to upcoming days.` });
      }
      if (oldPlan.availableStudyTimeHours !== availableStudyTimeHours) {
        adjustments.push({
          trigger: 'manual',
          note: `Your study time changed from ${oldPlan.availableStudyTimeHours}h to ${availableStudyTimeHours}h a day.`,
        });
      }
      if (timeNote) adjustments.push({ trigger: 'manual', note: timeNote });

      // Per task: did its finishing day move?
      const lastDay = (blocks, taskId) => blocks
        .filter((b) => String(b.task) === taskId && dayKey(b.date) >= today.getTime())
        .reduce((max, b) => Math.max(max, dayKey(b.date)), 0);
      const fmt = (t) => new Date(t).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

      const names = {};
      (await Task.find({ _id: { $in: tasksToPlan.map((t) => t._id) } }, 'description')).forEach((t) => {
        names[String(t._id)] = t.description;
      });

      tasksToPlan.forEach((t) => {
        const id = String(t._id);
        const before = lastDay(oldPlan.blocks, id);
        const after = lastDay(result.blocks, id);
        if (!before) {
          adjustments.push({ trigger: 'manual', task: t._id, note: `"${names[id]}" was added to the plan (finishes ${fmt(after)}).` });
        } else if (before !== after) {
          adjustments.push({
            trigger: 'task_rescheduled',
            task: t._id,
            note: `"${names[id]}" now finishes ${fmt(after)} instead of ${fmt(before)}.`,
          });
        }
      });

      if (adjustments.length === 0) {
        adjustments.push({ trigger: 'manual', note: 'Nothing has changed since your last plan, so the schedule is the same.' });
      }
    }

    // Old active plan is marked superseded rather than deleted, so a crash
    // partway through never leaves the student with zero plans.
    await StudyPlan.updateMany({ user: userId, status: 'active' }, { status: 'superseded' });

    const plan = await StudyPlan.create({
      user: userId,
      startDate: today,
      availableStudyTimeHours,
      blocks: [...keptBlocks, ...result.blocks],
      carriedBlockCount: keptBlocks.length,
      adjustments: adjustments.map((a) => ({ ...a, note: String(a.note).slice(0, 300) })),
    });

    return res.status(201).json({ plan, changes: adjustments.map((a) => a.note) });
  } catch (error) {
    console.error('generateStudyPlan error:', error);
    return res.status(500).json({ message: 'Something went wrong generating the plan.' });
  }
}

/**
 * GET /study-plan/availability
 * FR-8: show the form where the student sets their daily study time.
 */
function showAvailability(req, res) {
  return res.render('studyPlan/availability', {
    hours: req.user.availableStudyTimeHours || '',
    startTime: req.user.studyStartTime || '18:00',
    sessionLength: req.user.sessionLengthMinutes || 60,
    error: null,
  });
}

/**
 * POST /study-plan/availability
 * FR-8: save how many hours a day the student can study and when they
 * usually start, then send them to the dashboard to generate their plan.
 */
async function saveAvailability(req, res, next) {
  try {
    const hours = Number(req.body.availableStudyTimeHours);
    const startTime = String(req.body.studyStartTime || '').trim();
    const sessionLength = Number(req.body.sessionLengthMinutes) || 60;

    let error = null;
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 16) {
      error = 'Please enter a number of hours between 0.5 and 16.';
    } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      error = 'Please choose a valid start time.';
    } else if (![30, 60, 90, 120].includes(sessionLength)) {
      error = 'Please choose a session length.';
    }

    if (error) {
      return res.status(400).render('studyPlan/availability', {
        hours: req.body.availableStudyTimeHours,
        startTime: startTime || '18:00',
        sessionLength,
        error,
      });
    }

    await User.findByIdAndUpdate(req.user.id, {
      availableStudyTimeHours: hours,
      studyStartTime: startTime,
      sessionLengthMinutes: sessionLength,
    });

    return res.redirect('/study-plan');
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /study-plan/blocks/:blockId/complete
 * FR-13: mark one study block as done, or undo it if it's already done.
 * When every block for a task is done, the task itself is marked complete,
 * so it isn't scheduled again next time the plan is regenerated.
 */
async function toggleBlockComplete(req, res, next) {
  try {
    const plan = await StudyPlan.findOne({ user: req.user.id, status: 'active' });
    const block = plan && plan.blocks.id(req.params.blockId);

    if (!block) {
      return res.status(404).send('That study session could not be found.');
    }

    block.status = block.status === 'complete' ? 'scheduled' : 'complete';
    await plan.save();

    // Keep the task in step with its study blocks.
    // Missed sessions were already moved to other days, so they don't count here.
    const taskBlocks = plan.blocks.filter((b) => String(b.task) === String(block.task) && b.status !== 'missed');
    const allDone = taskBlocks.every((b) => b.status === 'complete');
    const task = await Task.findOne({ _id: block.task, user: req.user.id });
    if (task) {
      task.status = allDone ? 'complete' : 'pending';
      await task.save();
    }

    return res.redirect(req.get('Referer') || '/study-plan');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  showStudyPlan,
  generateStudyPlan,
  showAvailability,
  saveAvailability,
  toggleBlockComplete,
};