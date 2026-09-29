/**
 * Sprint 2: turns a study plan into an iCalendar (.ics) file that
 * Google Calendar and Outlook can import.
 *
 * The plan only stores hours per day, not clock times. The dashboard
 * lays each day's blocks out back to back from the student's
 * studyStartTime, so this does the same. That way the times in the
 * student's calendar match the times shown in the app.
 *
 * Times are written without a time zone ("floating" time), so the
 * calendar app shows them in the student's own local time.
 */
const { timeToMinutes } = require('./dashboardViewModel');

function pad(n) {
  return String(n).padStart(2, '0');
}

// Local time, e.g. 20261005T180000
function toLocalICS(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

// UTC time, e.g. 20261005T080000Z (only used for DTSTAMP)
function toUtcICS(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Commas, semicolons, backslashes and new lines have special meaning in .ics text.
function escapeText(text = '') {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * @param {object} planView        output of buildPlanViewModel(plan)
 * @param {string} studyStartTime  e.g. '18:00'
 * @returns {string} the .ics file content
 */
function buildICS(planView, studyStartTime) {
  const startMinutes = timeToMinutes(studyStartTime);
  const stamp = toUtcICS(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Study Buddy AI//Study Plan//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Study Buddy AI',
  ];

  for (const day of planView.days) {
    const [year, month, date] = day.isoDate.split('-').map(Number);
    let cursor = startMinutes;

    for (const block of day.blocks) {
      const blockStart = cursor;
      const blockEnd = cursor + block.allocatedHours * 60;
      // Move on for every block, including finished ones, so the
      // remaining blocks keep the same times as on the dashboard.
      cursor = blockEnd;

      // Only upcoming study goes into the calendar.
      if (block.status !== 'scheduled') continue;

      // new Date() rolls minutes past midnight into the next day for us.
      const start = new Date(year, month - 1, date, 0, blockStart);
      const end = new Date(year, month - 1, date, 0, blockEnd);
      const label = block.subjectCode || block.subjectName;

      lines.push(
        'BEGIN:VEVENT',
        `UID:${block.blockId}@studybuddy-ai`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${toLocalICS(start)}`,
        `DTEND:${toLocalICS(end)}`,
        `SUMMARY:${escapeText(`${label}: ${block.description}`)}`,
        `DESCRIPTION:${escapeText(`Study session for ${block.subjectName} (${block.allocatedHours}h)`)}`,
        'END:VEVENT'
      );
    }
  }

  lines.push('END:VCALENDAR');
  // The .ics standard requires CRLF line endings.
  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildICS };
