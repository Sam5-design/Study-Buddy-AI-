/**
 * Weighted scheduling algorithm (Komal's cards): deadline urgency,
 * remaining effort, available study time, and priority (FR-12).
 *
 * Same input/output contract as documented in index.js — nothing
 * outside this file needs to change.
 *
 * How urgency is scored:
 * "Slack" = (days until the deadline) minus (hours of work remaining
 * divided by hours available per day). It answers: after accounting for
 * how much work is left and how fast the student can work, how much
 * spare room does this task actually have before it's at risk of being
 * late? A task with less slack is scheduled first. Priority (high/
 * medium/low) is used only to break ties between similarly urgent tasks,
 * so an urgent low-priority task still isn't pushed behind a
 * comfortably-scheduled high-priority one.
 */

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function daysBetween(from, to) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

// Unavailable days (Sprint 2, Komal): a calendar day as 'YYYY-MM-DD' in
// local time, so a date and the same day's study blocks always match.
function dayId(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// How many blocked days fall between `from` (included) and `to` (not
// included). These days can't be used for study, so they are taken off
// the time a task has left before its deadline.
function blockedDaysBetween(from, to, blocked) {
  const firstDay = new Date(from);
  firstDay.setHours(0, 0, 0, 0);
  let count = 0;
  for (const id of blocked) {
    const [y, m, d] = id.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    if (day >= firstDay && day < to) count += 1;
  }
  return count;
}

async function generatePlan({
  tasks,
  availableStudyTimeHours,
  startDate,
  // Optional (added for adaptive regeneration). Leaving them out keeps the
  // original behaviour exactly, so existing callers and tests are unchanged.
  maxSessionHours,   // longest single study session, e.g. 1 -> 1-hour sessions
  firstDayHours,     // hours still free on the first day (e.g. some already studied)
  unavailableDates,  // days the student can't study (work shifts, holidays); nothing is scheduled on them
}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('At least one task is required to generate a plan.');
  }
  if (typeof availableStudyTimeHours !== 'number' || availableStudyTimeHours <= 0) {
    throw new Error('availableStudyTimeHours must be a positive number.');
  }


  // Every task needs a real deadline and a positive effort estimate.
  // Without these the slack becomes NaN ("not a number"), which silently
  // breaks the sort (a far-off task can jump ahead of an urgent one) or
  // drops the task from the plan. Reject clearly instead.
  for (const task of tasks) {
    if (!task.deadline || Number.isNaN(new Date(task.deadline).getTime())) {
      throw new Error(`Task ${task._id} is missing a valid deadline.`);
    }
    if (typeof task.estimatedEffortHours !== 'number' || !(task.estimatedEffortHours > 0)) {
      throw new Error(`Task ${task._id} must have a positive estimatedEffortHours.`);
    }
  }

  const start = new Date(startDate);
  const blocked = new Set((Array.isArray(unavailableDates) ? unavailableDates : [])
    .filter((d) => d && !Number.isNaN(new Date(d).getTime()))
    .map(dayId));

  const scored = tasks.map((task) => {
    const deadline = new Date(task.deadline);
    // Blocked days before the deadline can't be used, so they don't count as spare time.
    const daysUntilDeadline = daysBetween(start, deadline) - blockedDaysBetween(start, deadline, blocked);
    const daysNeeded = task.estimatedEffortHours / availableStudyTimeHours;
    const slack = daysUntilDeadline - daysNeeded;
    const priorityRank = PRIORITY_RANK[task.priority] ?? PRIORITY_RANK.medium;

    return { task, slack, priorityRank, deadline };
  });

  // Least slack first (most urgent); priority breaks ties; deadline breaks
  // any remaining ties.
  scored.sort((a, b) => {
    if (a.slack !== b.slack) return a.slack - b.slack;
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    return a.deadline - b.deadline;
  });

  let firstDay = typeof firstDayHours === 'number'
    ? Math.max(0, Math.min(firstDayHours, availableStudyTimeHours))
    : availableStudyTimeHours;
  if (blocked.has(dayId(start))) firstDay = 0; // no study on a blocked first day

  // Move to the next day the student is free (skips blocked days).
  const nextFreeDay = (date) => {
    const next = new Date(date);
    do {
      next.setDate(next.getDate() + 1);
    } while (blocked.has(dayId(next)));
    return next;
  };

  if (typeof maxSessionHours === 'number' && maxSessionHours > 0) {
    return { blocks: scheduleInSessions(scored, { availableStudyTimeHours, start, maxSessionHours, firstDay, nextFreeDay, blocked }) };
  }

  const blocks = [];
  let currentDate = new Date(start);
  let hoursLeftToday = firstDay;

  for (const { task } of scored) {
    let hoursRemaining = task.estimatedEffortHours;

    while (hoursRemaining > 0) {
      if (hoursLeftToday <= 0) {
        currentDate = nextFreeDay(currentDate);
        hoursLeftToday = availableStudyTimeHours;
      }

      const allocatedHours = Math.min(hoursRemaining, hoursLeftToday);

      blocks.push({
        date: new Date(currentDate),
        task: task._id,
        subject: task.subject,
        allocatedHours,
      });

      hoursRemaining -= allocatedHours;
      hoursLeftToday -= allocatedHours;
    }
  }

  return { blocks };
}

/**
 * Session-based scheduling (used when maxSessionHours is given).
 *
 * Instead of finishing one task before starting the next, the day is filled
 * one session at a time. Before every session the slack of each unfinished
 * task is worked out again from *that* day and the hours it still needs, and
 * the most urgent task gets the session. If the same task just had a session
 * today and another task is almost as urgent (within a day of slack), the
 * other task goes next, so subjects are mixed across the day instead of
 * back to back.
 */
function scheduleInSessions(scored, { availableStudyTimeHours, start, maxSessionHours, firstDay, nextFreeDay, blocked }) {
  const EPSILON = 1e-9;
  const pending = scored.map((item) => ({ ...item, remaining: item.task.estimatedEffortHours }));

  const blocks = [];
  let currentDate = new Date(start);
  let hoursLeftToday = firstDay;
  let lastTaskToday = null;

  const slackOn = (item, date) =>
    daysBetween(date, item.deadline) - blockedDaysBetween(date, item.deadline, blocked)
    - item.remaining / availableStudyTimeHours;

  const compare = (a, b) => {
    if (Math.abs(a.slack - b.slack) > EPSILON) return a.slack - b.slack;
    if (a.item.priorityRank !== b.item.priorityRank) return a.item.priorityRank - b.item.priorityRank;
    return a.item.deadline - b.item.deadline;
  };

  while (pending.some((item) => item.remaining > EPSILON)) {
    if (hoursLeftToday <= EPSILON) {
      currentDate = nextFreeDay(currentDate);
      hoursLeftToday = availableStudyTimeHours;
      lastTaskToday = null;
    }

    const ranked = pending
      .filter((item) => item.remaining > EPSILON)
      .map((item) => ({ item, slack: slackOn(item, currentDate) }))
      .sort(compare);

    let choice = ranked[0];
    if (choice.item === lastTaskToday && ranked.length > 1 && ranked[1].slack - choice.slack <= 1) {
      choice = ranked[1];
    }

    const allocatedHours = Math.min(choice.item.remaining, maxSessionHours, hoursLeftToday);
    const previous = blocks[blocks.length - 1];

    if (previous && previous.task === choice.item.task._id
        && previous.date.getTime() === currentDate.getTime()) {
      // Same task straight after itself on the same day: one longer session.
      previous.allocatedHours += allocatedHours;
    } else {
      blocks.push({
        date: new Date(currentDate),
        task: choice.item.task._id,
        subject: choice.item.task.subject,
        allocatedHours,
      });
    }

    choice.item.remaining -= allocatedHours;
    hoursLeftToday -= allocatedHours;
    lastTaskToday = choice.item;
  }

  return blocks;
}

module.exports = { generatePlan };
