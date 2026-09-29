const assert = require('assert');
const { buildSessionReminder } = require('../utils/sessionReminder');

function makePlan(blocks) {
  return {
    days: [{
      isoDate: '2026-09-30',
      blocks,
    }],
  };
}

const scheduled = (hours, subjectCode, description, status = 'scheduled') => ({
  blockId: 'b1',
  allocatedHours: hours,
  status,
  subjectCode,
  subjectName: subjectCode,
  description,
});

let r = buildSessionReminder({
  planView: makePlan([scheduled(0.5, 'SIT789', 'Demo')]),
  studyStartTime: '18:00',
  now: new Date(2026, 8, 30, 17, 50, 0),
});
assert.equal(r.shouldShow, true);
assert.equal(r.minutesUntil, 10);
assert.equal(r.startTimeLabel, '6:00 PM');

r = buildSessionReminder({
  planView: makePlan([scheduled(0.5, 'SIT789', 'Demo')]),
  studyStartTime: '18:00',
  now: new Date(2026, 8, 30, 17, 44, 0),
});
assert.equal(r.shouldShow, false);

r = buildSessionReminder({
  planView: makePlan([
    scheduled(0.5, 'SIT725', 'First', 'complete'),
    scheduled(0.5, 'SIT789', 'Second'),
  ]),
  studyStartTime: '18:00',
  now: new Date(2026, 8, 30, 18, 20, 0),
});
assert.equal(r.shouldShow, true);
assert.equal(r.minutesUntil, 10);
assert.equal(r.subjectCode, 'SIT789');
assert.equal(r.taskDescription, 'Second');

r = buildSessionReminder({
  planView: makePlan([scheduled(0.5, 'SIT789', 'Demo', 'complete')]),
  studyStartTime: '18:00',
  now: new Date(2026, 8, 30, 17, 50, 0),
});
assert.equal(r.shouldShow, false);

console.log('Session reminder checks passed.');
