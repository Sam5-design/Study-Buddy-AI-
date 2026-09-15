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

async function generatePlan({ tasks, availableStudyTimeHours, startDate }) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('At least one task is required to generate a plan.');
  }
  if (typeof availableStudyTimeHours !== 'number' || availableStudyTimeHours <= 0) {
    throw new Error('availableStudyTimeHours must be a positive number.');
  }

  const start = new Date(startDate);

  const scored = tasks.map((task) => {
    const deadline = new Date(task.deadline);
    const daysUntilDeadline = daysBetween(start, deadline);
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

  const blocks = [];
  let currentDate = new Date(start);
  let hoursLeftToday = availableStudyTimeHours;

  for (const { task } of scored) {
    let hoursRemaining = task.estimatedEffortHours;

    while (hoursRemaining > 0) {
      if (hoursLeftToday <= 0) {
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + 1);
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

module.exports = { generatePlan };
