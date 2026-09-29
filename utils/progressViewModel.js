const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function roundHours(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function inRange(value, start, end) {
  if (!value) return false;
  const date = new Date(value);
  return date >= start && date < end;
}

function subjectKey(value) {
  if (!value) return '';
  if (value._id) return String(value._id);
  return String(value);
}

function formatWeekLabel(weekStart, weekEnd) {
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  if (sameMonth) {
    return `${weekStart.getDate()}–${weekEnd.getDate()} ${weekEnd.toLocaleDateString('en-AU', { month: 'short' })}`;
  }
  return `${weekStart.getDate()} ${weekStart.toLocaleDateString('en-AU', { month: 'short' })}–${weekEnd.getDate()} ${weekEnd.toLocaleDateString('en-AU', { month: 'short' })}`;
}

/**
 * Build the data used by the Progress Stats page.
 *
 * "Hours studied" means completed study-plan blocks during the current
 * Monday-to-Sunday week. "Tasks this week" combines tasks completed during
 * the week with unfinished tasks whose deadline falls during the week.
 */
function buildProgressViewModel({ plan, subjects = [], tasks = [], today = new Date() }) {
  const weekStart = startOfWeek(today);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const weekEnd = new Date(nextWeekStart);
  weekEnd.setDate(weekEnd.getDate() - 1);

  const subjectStats = new Map();
  subjects.forEach((subject) => {
    const key = subjectKey(subject);
    subjectStats.set(key, {
      id: key,
      code: subject.code || subject.name || 'Subject',
      name: subject.name || subject.code || 'Subject',
      colour: subject.colour || '#E56B61',
      hoursStudied: 0,
      plannedHours: 0,
      tasksCompleted: 0,
    });
  });

  let totalHoursStudied = 0;
  let totalPlannedHours = 0;

  if (plan && Array.isArray(plan.blocks)) {
    plan.blocks.forEach((block) => {
      if (!inRange(block.date, weekStart, nextWeekStart)) return;

      const hours = Number(block.allocatedHours) || 0;
      totalPlannedHours += hours;

      const key = subjectKey(block.subject);
      if (!subjectStats.has(key)) {
        const subject = block.subject || {};
        subjectStats.set(key, {
          id: key,
          code: subject.code || subject.name || 'Subject',
          name: subject.name || subject.code || 'Subject',
          colour: subject.colour || '#E56B61',
          hoursStudied: 0,
          plannedHours: 0,
          tasksCompleted: 0,
        });
      }

      const stat = subjectStats.get(key);
      stat.plannedHours += hours;

      if (block.status === 'complete') {
        stat.hoursStudied += hours;
        totalHoursStudied += hours;
      }
    });
  }

  let tasksFinished = 0;
  let tasksRemaining = 0;

  tasks.forEach((task) => {
    const completedThisWeek = task.status === 'complete'
      && inRange(task.completedAt, weekStart, nextWeekStart);
    const dueThisWeekAndOpen = task.status !== 'complete'
      && inRange(task.deadline, weekStart, nextWeekStart);

    if (!completedThisWeek && !dueThisWeekAndOpen) return;

    const key = subjectKey(task.subject);
    if (!subjectStats.has(key)) {
      const subject = task.subject || {};
      subjectStats.set(key, {
        id: key,
        code: subject.code || subject.name || 'Subject',
        name: subject.name || subject.code || 'Subject',
        colour: subject.colour || '#E56B61',
        hoursStudied: 0,
        plannedHours: 0,
        tasksCompleted: 0,
      });
    }

    if (completedThisWeek) {
      tasksFinished += 1;
      subjectStats.get(key).tasksCompleted += 1;
    } else {
      tasksRemaining += 1;
    }
  });

  const totalTasksThisWeek = tasksFinished + tasksRemaining;
  const completionPercent = totalTasksThisWeek
    ? Math.round((tasksFinished / totalTasksThisWeek) * 100)
    : 0;
  const hoursPercent = totalPlannedHours
    ? Math.round((totalHoursStudied / totalPlannedHours) * 100)
    : 0;

  const rows = [...subjectStats.values()].map((item) => ({
    ...item,
    hoursStudied: roundHours(item.hoursStudied),
    plannedHours: roundHours(item.plannedHours),
  }));

  // Each subject bar represents that subject's own weekly study progress,
  // rather than being scaled against whichever subject has the most hours.
  // This keeps the visual consistent with the weekly planned-hours summary.
  rows.forEach((item) => {
    item.barPercent = item.plannedHours > 0
      ? Math.min(100, Math.round((item.hoursStudied / item.plannedHours) * 100))
      : 0;
  });

  return {
    weekStart,
    weekEnd,
    weekLabel: formatWeekLabel(weekStart, weekEnd),
    totalHoursStudied: roundHours(totalHoursStudied),
    totalPlannedHours: roundHours(totalPlannedHours),
    hoursPercent,
    tasksFinished,
    tasksRemaining,
    totalTasksThisWeek,
    completionPercent,
    subjectStats: rows,
  };
}

module.exports = { buildProgressViewModel, startOfWeek };
