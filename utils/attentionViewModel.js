/**
 * "Needs attention" card for the plan page.
 *
 * Works out what the student should look at first:
 *   - overdue: tasks whose deadline has passed and are still pending
 *   - dueSoon: pending tasks due today or in the next 2 days
 *   - missed:  study sessions missed in the last 7 days
 *
 * It only reads data the app already has, so it needs no new database fields.
 */

const DUE_SOON_DAYS = 2;
const MISSED_LOOKBACK_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Whole days from one date to another (negative if "to" is earlier).
function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

function dueLabel(days) {
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

function overdueLabel(days) {
  return days === 1 ? '1 day overdue' : `${days} days overdue`;
}

function toLine(task, label, days) {
  const subject = task.subject || {};
  return {
    taskId: String(task._id),
    description: task.description,
    subjectCode: subject.code || subject.name || '',
    days,
    label,
  };
}

function buildAttention({ upcomingTasks = [], overdueTasks = [], planView = null, today = new Date() } = {}) {
  const dueSoon = upcomingTasks
    .map((task) => ({ task, days: daysBetween(today, task.deadline) }))
    .filter((item) => item.days >= 0 && item.days <= DUE_SOON_DAYS)
    .sort((a, b) => a.days - b.days)
    .map((item) => toLine(item.task, dueLabel(item.days), item.days));

  const overdue = overdueTasks
    .map((task) => ({ task, days: daysBetween(task.deadline, today) }))
    .filter((item) => item.days >= 1)
    .sort((a, b) => b.days - a.days)
    .map((item) => toLine(item.task, overdueLabel(item.days), item.days));

  // Missed sessions from the last few days only, so old ones don't stay here forever.
  let missedCount = 0;
  let missedHours = 0;
  const days = (planView && planView.days) || [];
  days.forEach((day) => {
    const ago = daysBetween(new Date(`${day.isoDate}T00:00:00`), today);
    if (ago < 1 || ago > MISSED_LOOKBACK_DAYS) return;
    day.blocks.forEach((block) => {
      if (block.status === 'missed') {
        missedCount += 1;
        missedHours += block.allocatedHours;
      }
    });
  });

  return {
    hasItems: overdue.length + dueSoon.length + missedCount > 0,
    overdue,
    dueSoon,
    missed: { count: missedCount, hours: missedHours },
  };
}

module.exports = { buildAttention };
