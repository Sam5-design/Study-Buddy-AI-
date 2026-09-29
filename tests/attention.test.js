const test = require('node:test');
const assert = require('node:assert');
const { buildAttention } = require('../utils/attentionViewModel');

// A fixed "today" so the tests give the same result on any day.
const today = new Date(2026, 8, 29, 10, 0, 0); // 29 Sep 2026

function daysFromToday(n) {
  const d = new Date(2026, 8, 29 + n, 12, 0, 0);
  return d;
}

function task(id, description, deadlineOffset) {
  return {
    _id: id,
    description,
    deadline: daysFromToday(deadlineOffset),
    subject: { code: 'SIT725', name: 'Applied Software Engineering' },
  };
}

function planWith(blocks) {
  return { days: blocks.map((b) => ({ isoDate: b.isoDate, blocks: [b] })) };
}

test('nothing to show when there are no tasks or missed sessions', () => {
  const result = buildAttention({ today });
  assert.strictEqual(result.hasItems, false);
  assert.deepStrictEqual(result.dueSoon, []);
  assert.deepStrictEqual(result.overdue, []);
  assert.strictEqual(result.missed.count, 0);
});

test('tasks due today, tomorrow and in 2 days are "due soon", earliest first', () => {
  const result = buildAttention({
    today,
    upcomingTasks: [task('c', 'Third', 2), task('a', 'First', 0), task('b', 'Second', 1), task('z', 'Later', 5)],
  });
  assert.deepStrictEqual(result.dueSoon.map((t) => t.description), ['First', 'Second', 'Third']);
  assert.deepStrictEqual(result.dueSoon.map((t) => t.label), ['due today', 'due tomorrow', 'due in 2 days']);
  assert.strictEqual(result.hasItems, true);
});

test('overdue tasks show how many days late, most late first', () => {
  const result = buildAttention({
    today,
    overdueTasks: [task('a', 'One day late', -1), task('b', 'Three days late', -3)],
  });
  assert.deepStrictEqual(result.overdue.map((t) => t.label), ['3 days overdue', '1 day overdue']);
});

test('a task due today is not counted as overdue', () => {
  const result = buildAttention({ today, overdueTasks: [task('a', 'Due today', 0)] });
  assert.deepStrictEqual(result.overdue, []);
});

test('counts sessions missed in the last 7 days only', () => {
  const planView = planWith([
    { isoDate: '2026-09-28', status: 'missed', allocatedHours: 1.5 },   // yesterday: counts
    { isoDate: '2026-09-25', status: 'missed', allocatedHours: 1 },     // 4 days ago: counts
    { isoDate: '2026-09-10', status: 'missed', allocatedHours: 2 },     // too old: ignored
    { isoDate: '2026-09-27', status: 'complete', allocatedHours: 1 },   // done: ignored
    { isoDate: '2026-09-30', status: 'scheduled', allocatedHours: 1 },  // future: ignored
  ]);
  const result = buildAttention({ today, planView });
  assert.strictEqual(result.missed.count, 2);
  assert.strictEqual(result.missed.hours, 2.5);
  assert.strictEqual(result.hasItems, true);
});
