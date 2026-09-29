/**
 * Study plan (re)generation — shared by:
 *   - the Generate / Regenerate button (POST /study-plan/generate)
 *   - automatic recalculation (US6 / FR-15) after the student marks a
 *     session done, adds / edits / deletes a task or subject, or changes
 *     their study time.
 *
 * Returns { status, body } so each caller decides how to respond.
 */
const Task = require('../models/Task');
const StudyPlan = require('../models/StudyPlan');
const aiSchedulingEngine = require('./aiSchedulingEngine');

function reply(status, body) {
  return { status, body };
}

async function regeneratePlan(user, { reason = null } = {}) {
  try {
    const userId = String(user._id);
    const availableStudyTimeHours = user.availableStudyTimeHours;
    const studyStartTime = user.studyStartTime || '18:00';
    const maxSessionHours = (user.sessionLengthMinutes || 60) / 60;

    if (!availableStudyTimeHours || availableStudyTimeHours <= 0) {
      return reply(400, {
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

      // Tasks that still exist (a task or subject may have just been deleted).
      const existingTaskIds = new Set(
        (await Task.find({ user: userId }, '_id')).map((t) => String(t._id))
      );

      oldPlan.blocks.forEach((original, index) => {
        const block = original;
        const taskId = String(block.task);
        if (!existingTaskIds.has(taskId)) return; // task was deleted: forget its sessions

        // A future session ticked early was really studied today.
        if (block.status === 'complete' && dayKey(block.date) > today.getTime()) {
          block.date = new Date(today);
        }
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

    if (tasksToPlan.length === 0 && !oldPlan) {
      return reply(400, {
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

    let result = { blocks: [] }; // nothing left to schedule (e.g. last task deleted or finished)
    try {
      if (tasksToPlan.length > 0) result = await aiSchedulingEngine.generatePlan({
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
        return reply(200, {
          message: 'Could not regenerate the plan just now, showing your last saved plan instead.',
          plan: oldPlan,
        });
      }
      return reply(502, {
        message: 'Could not generate a study plan right now. Please try again shortly.',
      });
    }

    // ---- Describe what changed (shown on the dashboard) ----
    const adjustments = [];
    if (!oldPlan) {
      adjustments.push({ trigger: 'initial', note: 'Initial plan generated.' });
    } else {
      if (reason) adjustments.push({ trigger: 'manual', note: reason });
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

      if (tasksToPlan.length === 0) {
        adjustments.push({ trigger: 'manual', note: 'There is nothing left to schedule. Add a new task to plan more.' });
      } else if (!reason && adjustments.length === 0) {
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

    return reply(201, { plan, changes: adjustments.map((a) => a.note) });
  } catch (error) {
    console.error('regeneratePlan error:', error);
    return reply(500, { message: 'Something went wrong generating the plan.' });
  }
}

/**
 * Automatic recalculation (US6). Only runs when the student already has a
 * plan and has set their study time, so it never creates a first plan by
 * surprise. Returns true if the plan was updated.
 */
async function recalculateIfPlanExists(user, reason) {
  if (!user || !user.availableStudyTimeHours) return false;
  const hasPlan = await StudyPlan.exists({ user: user._id, status: 'active' });
  if (!hasPlan) return false;
  const result = await regeneratePlan(user, { reason });
  return result.status === 201;
}

module.exports = { regeneratePlan, recalculateIfPlanExists };
