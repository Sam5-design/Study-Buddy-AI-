const Task = require('../models/Task');
const User = require('../models/User');
const Subject = require('../models/Subject');
const { buildDashboardViewModel } = require('../utils/dashboardViewModel');
const StudyPlan = require('../models/StudyPlan');
const { regeneratePlan, recalculateIfPlanExists } = require('../services/studyPlanService');
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
 * FR-12 / FR-15: generate or regenerate the plan. The logic lives in
 * services/studyPlanService.js so it can also run automatically.
 */
async function generateStudyPlan(req, res) {
  const { status, body } = await regeneratePlan(req.user);
  return res.status(status).json(body);
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

    const updatedUser = await User.findByIdAndUpdate(req.user.id, {
      availableStudyTimeHours: hours,
      studyStartTime: startTime,
      sessionLengthMinutes: sessionLength,
    }, { new: true });

    // US6: the plan follows the new settings straight away.
    const recalculated = await recalculateIfPlanExists(updatedUser, 'Your study settings were updated.');
    return res.redirect(recalculated ? '/study-plan?regenerated=1' : '/study-plan');
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

    // US6: recalculate the plan automatically so the change shows straight away.
    const reason = block.status === 'complete'
      ? 'You marked a session as done.'
      : 'You un-ticked a session, so its time was added back.';
    await recalculateIfPlanExists(req.user, reason);

    const back = new URL(req.get('Referer') || '/study-plan', 'http://localhost');
    back.searchParams.set('regenerated', '1');
    return res.redirect(back.pathname + back.search);
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