/**
 * Turns a populated StudyPlan document into the shape the Study Plan
 * screen renders from (FR-16).
 *
 * Both the list view and the calendar view read the same structure, so
 * neither component has to do its own date grouping or sorting.
 *
 * Output:
 *   {
 *     hasPlan: Boolean,
 *     generatedAt: Date | null,
 *     totalScheduledHours: Number,
 *     days: [
 *       {
 *         isoDate: 'YYYY-MM-DD',      // for calendar cell keys / data attributes
 *         label: 'Mon 14 Sep',         // for list view headings
 *         isToday: Boolean,
 *         totalHours: Number,
 *         blocks: [
 *           {
 *             blockId, taskId, description, subjectName, subjectColour,
 *             allocatedHours, status, deadline
 *           }
 *         ]
 *       }
 *     ]
 *   }
 *
 * A plan with no blocks still returns hasPlan: true with an empty days
 * array. That is different from having no plan at all, and the view
 * distinguishes the two.
 */

const DAY_LABEL_OPTIONS = { weekday: 'short', day: 'numeric', month: 'short' };

function toIsoDate(date) {
  // Local date parts, not toISOString(), which shifts across UTC midnight.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function buildPlanViewModel(plan) {
  if (!plan) {
    return { hasPlan: false, generatedAt: null, totalScheduledHours: 0, days: [] };
  }

  const today = new Date();
  const grouped = new Map();

  for (const block of plan.blocks) {
    const blockDate = new Date(block.date);
    const key = toIsoDate(blockDate);

    if (!grouped.has(key)) {
      grouped.set(key, {
        isoDate: key,
        label: blockDate.toLocaleDateString('en-AU', DAY_LABEL_OPTIONS),
        isToday: isSameLocalDay(blockDate, today),
        totalHours: 0,
        blocks: [],
      });
    }

    const day = grouped.get(key);

    // block.task and block.subject are populated documents when the
    // controller populates them, and bare ObjectIds when it doesn't.
    // Falling back keeps the view from breaking either way.
    const task = block.task || {};
    const subject = block.subject || {};

    day.blocks.push({
      blockId: block._id ? block._id.toString() : null,
      taskId: task._id ? task._id.toString() : String(block.task),
      description: task.description || 'Untitled task',
      subjectName: subject.name || 'Unknown subject',
      subjectColour: subject.colour || '#26a69a',
      allocatedHours: block.allocatedHours,
      status: block.status,
      deadline: task.deadline || null,
    });

    day.totalHours += block.allocatedHours;
  }

  const days = [...grouped.values()].sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  return {
    hasPlan: true,
    generatedAt: plan.generatedAt,
    totalScheduledHours: days.reduce((sum, day) => sum + day.totalHours, 0),
    days,
  };
}

module.exports = { buildPlanViewModel, toIsoDate };