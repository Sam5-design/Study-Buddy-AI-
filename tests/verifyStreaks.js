const assert = require('assert');
const { buildStreakViewModel } = require('../utils/streakViewModel');

function block(date, status = 'complete') {
  return { date: new Date(date + 'T12:00:00'), status };
}

const today = new Date('2026-09-30T12:00:00');

let result = buildStreakViewModel({
  today,
  plan: { blocks: [block('2026-09-30')] },
});
assert.equal(result.currentStreak, 1);
assert.equal(result.totalCompletedSessions, 1);
assert.equal(result.badges.find((b) => b.id === 'first-session').earned, true);

result = buildStreakViewModel({
  today,
  plan: {
    blocks: [
      block('2026-09-26'),
      block('2026-09-27'),
      block('2026-09-28'),
      block('2026-09-29'),
      block('2026-09-30'),
    ],
  },
});
assert.equal(result.currentStreak, 5);
assert.equal(result.longestStreak, 5);
assert.equal(result.badges.find((b) => b.id === 'five-day-streak').earned, true);

result = buildStreakViewModel({
  today,
  plan: {
    blocks: [
      block('2026-09-20'),
      block('2026-09-22'),
      block('2026-09-24'),
      block('2026-09-25'),
      block('2026-09-26'),
      block('2026-09-27'),
      block('2026-09-28'),
      block('2026-09-29'),
    ],
  },
});
assert.equal(result.currentStreak, 6);
assert.equal(result.uniqueStudyDays, 8);
assert.equal(result.badges.find((b) => b.id === 'consistent-learner').earned, true);

result = buildStreakViewModel({
  today,
  plan: { blocks: Array.from({ length: 10 }, (_, i) => block('2026-09-30')) },
});
assert.equal(result.totalCompletedSessions, 10);
assert.equal(result.badges.find((b) => b.id === 'ten-sessions').earned, true);

console.log('Study streak checks passed.');
