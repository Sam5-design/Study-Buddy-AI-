/**
 * Builds the data the Study Plan dashboard renders from.
 *
 * Works on top of buildPlanViewModel (utils/planViewModel.js), which has
 * already grouped the plan's blocks by day. This file adds:
 *   - the Monday-to-Sunday week being shown, with clock times for each block
 *   - weekly progress (hours completed / hours planned this week)
 *   - the next deadline for each subject, with progress
 *
 * Clock times: the plan only stores hours per day, so each day's blocks are
 * laid out back to back from the student's usual start time
 * (User.studyStartTime, e.g. '18:00').
 */
const { toIsoDate } = require('./planViewModel');

const DAY_MS = 24 * 60 * 60 * 1000;

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || '18:00').split(':').map(Number);
  return h * 60 + m;
}

function formatClock(totalMinutes) {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// Turns 130 into '2h 10m', 45 into '45m', 0 into '0m'.
function formatMinutes(total) {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

function formatHourLabel(totalMinutes) {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12} ${suffix}`;
}

function startOfWeek(date) {
  // Monday 00:00 of the week containing `date`.
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * @param {object}  planView       output of buildPlanViewModel
 * @param {object}  options
 * @param {string}  options.studyStartTime  e.g. '18:00'
 * @param {number}  options.weekOffset      0 = this week, 1 = next week, -1 = last week
 * @param {Array}   options.upcomingTasks   unfinished Tasks (subject populated), soonest deadline first
 * @param {Date}    options.today
 */
function buildDashboardViewModel(planView, { studyStartTime, weekOffset = 0, upcomingTasks = [], today = new Date() }) {
  const startMinutes = timeToMinutes(studyStartTime);

  const dayMap = {};
  planView.days.forEach((day) => { dayMap[day.isoDate] = day; });

  // ---- The week being shown ----
  const weekStart = startOfWeek(today);
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);

  const todayIso = toIsoDate(today);
  let earliest = startMinutes;
  let latest = startMinutes + 4 * 60; // always show at least 4 hours
  let plannedHours = 0;
  let completedHours = 0;
  let studiedMinutes = 0;

  const weekDays = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const iso = toIsoDate(date);
    const planDay = dayMap[iso];

    // Lay this day's blocks out one after another from the start time.
    let cursor = startMinutes;
    const blocks = (planDay ? planDay.blocks : []).map((block) => {
      const start = cursor;
      const end = cursor + block.allocatedHours * 60;
      cursor = end;

      plannedHours += block.allocatedHours;
      studiedMinutes += block.actualMinutes || 0;
      if (block.status === 'complete') completedHours += block.allocatedHours;

      return {
        ...block,
        startMinutes: start,
        endMinutes: end,
        timeLabel: `${formatClock(start)} – ${formatClock(end)}`,
      };
    });

    if (cursor > latest) latest = cursor;

    weekDays.push({
      isoDate: iso,
      dayName: date.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase(),
      dayNumber: date.getDate(),
      isToday: iso === todayIso,
      isPast: iso < todayIso,
      blocks,
    });
  }

  // Grid runs on whole hours.
  const gridStart = Math.floor(earliest / 60) * 60;
  const gridEnd = Math.ceil(latest / 60) * 60;
  const hourLabels = [];
  for (let m = gridStart; m < gridEnd; m += 60) {
    hourLabels.push({ minutes: m, label: formatHourLabel(m) });
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const weekLabel = sameMonth
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('en-AU', { month: 'long' })}`
    : `${weekStart.getDate()} ${weekStart.toLocaleDateString('en-AU', { month: 'short' })} – ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('en-AU', { month: 'short' })}`;

  // ---- Upcoming deadlines ----
  // For each subject, its soonest unfinished task, with how much of that
  // task's scheduled study time is already done (for the progress ring).
  const startToday = new Date(today);
  startToday.setHours(0, 0, 0, 0);

  function describeTask(task) {
    const deadline = new Date(task.deadline);
    const daysLeft = Math.max(0, Math.ceil((deadline - startToday) / DAY_MS));

    let taskPlanned = 0;
    let taskDone = 0;
    planView.days.forEach((day) => day.blocks.forEach((block) => {
      if (block.taskId === String(task._id)) {
        taskPlanned += block.allocatedHours;
        if (block.status === 'complete') taskDone += block.allocatedHours;
      }
    }));

    const subject = task.subject || {};
    return {
      subjectCode: subject.code || subject.name || '',
      subjectName: subject.name || '',
      subjectColour: subject.colour || '#E56B61',
      description: task.description,
      dayLabel: deadline.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' }),
      shortDayLabel: deadline.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
      daysLeft,
      daysLeftLabel: daysLeft === 0 ? 'due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
      hoursDone: taskDone,
      hoursPlanned: taskPlanned,
      isScheduled: taskPlanned > 0,
      percentDone: taskPlanned ? Math.round((taskDone / taskPlanned) * 100) : 0,
    };
  }

  const seenSubjects = new Set();
  const subjectDeadlines = [];
  upcomingTasks.forEach((task) => {
    const key = String(task.subject && task.subject._id ? task.subject._id : task.subject);
    if (seenSubjects.has(key)) return; // tasks are sorted, so the first one per subject is the soonest
    seenSubjects.add(key);
    subjectDeadlines.push(describeTask(task));
  });

  const nextDeadline = subjectDeadlines[0] || null;

  return {
    weekOffset,
    weekLabel,
    weekDays,
    gridStart,
    gridEnd,
    hourLabels,
    plannedHours,
    completedHours,
    studiedLabel: formatMinutes(studiedMinutes),
    weeklyPercent: plannedHours ? Math.round((completedHours / plannedHours) * 100) : 0,
    nextDeadline,
    subjectDeadlines,
  };
}

module.exports = { buildDashboardViewModel, timeToMinutes, formatClock };
