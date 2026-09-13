/**
 * TEMPORARY PLACEHOLDER.
 *
 * Komal owns the real algorithm here (her cards: deadline-urgency and
 * effort weighting, available-time and priority weighting). This is a
 * plain earliest-deadline-first scheduler with no weighting at all, it
 * exists only so the API route and StudyPlan persistence could be built
 * and tested without waiting on her cards to land.
 *
 * When her version is ready: replace the body of generatePlan() below.
 * Keep the input and output shape exactly as documented in index.js, so
 * nothing outside this file needs to change.
 */

async function generatePlan({ tasks, availableStudyTimeHours, startDate }) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('At least one task is required to generate a plan.');
  }
  if (typeof availableStudyTimeHours !== 'number' || availableStudyTimeHours <= 0) {
    throw new Error('availableStudyTimeHours must be a positive number.');
  }

  const blocks = [];
  const sortedByDeadline = [...tasks].sort((a, b) => a.deadline - b.deadline);

  let currentDate = new Date(startDate);
  let hoursLeftToday = availableStudyTimeHours;

  for (const task of sortedByDeadline) {
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