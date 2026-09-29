function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIsoDate(value) {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

function buildSessionReminder({
  planView,
  studyStartTime,
  now = new Date(),
  windowMinutes = 15,
}) {
  if (!planView || !Array.isArray(planView.days)) return { shouldShow: false };

  const todayIso = toIsoDate(now);
  const todayPlan = planView.days.find((day) => day.isoDate === todayIso);
  if (!todayPlan || !todayPlan.blocks.length) return { shouldShow: false };

  const currentMinutes = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() / 60);
  let cursor = timeToMinutes(studyStartTime);

  for (const block of todayPlan.blocks) {
    const startMinutes = cursor;
    cursor += (Number(block.allocatedHours) || 0) * 60;

    // Only future/active scheduled sessions need a reminder.
    if (block.status !== 'scheduled') continue;

    const minutesUntilExact = startMinutes - currentMinutes;
    if (minutesUntilExact < 0 || minutesUntilExact > windowMinutes) continue;

    const minutesUntil = Math.max(0, Math.ceil(minutesUntilExact));

    return {
      shouldShow: true,
      startsNow: minutesUntil === 0,
      minutesUntil,
      startTimeLabel: formatClock(startMinutes),
      subjectCode: block.subjectCode || block.subjectName || 'Study session',
      subjectName: block.subjectName || '',
      taskDescription: block.description || 'Study session',
      blockId: block.blockId || '',
    };
  }

  return { shouldShow: false };
}

module.exports = { buildSessionReminder };
