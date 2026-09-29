/**
 * Automated test suite for the AI Scheduling Engine (FR-12).
 * Sprint 2 - Komal Singh (s226497726)
 *
 * Run with:  npm test
 *
 * Uses Node's built-in test runner (node:test), so no extra packages
 * are needed. No database is needed either - the tests use plain task
 * objects with the same shape as the Task model.
 *
 * Three groups of tests:
 *   1. Sprint 1 behaviour  - my two old verify scripts, moved into one suite
 *   2. Sprint 2 regression - checks the session-based scheduling added in
 *                            Sprint 2 did not break the slack rules
 *   3. Input validation    - bad task data must be rejected with a clear
 *                            error instead of silently giving a wrong plan
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { generatePlan } = require('../services/aiSchedulingEngine');

const START = new Date('2026-09-13T00:00:00.000Z');

// Small helper so each test can make a task in one line.
function makeTask(id, deadline, hours, priority = 'medium') {
  return { _id: id, subject: 'subject-' + id, deadline: new Date(deadline), estimatedEffortHours: hours, priority };
}

// The order tasks first appear in the plan, e.g. ['taskA', 'taskC', 'taskB'].
function taskOrder(blocks) {
  return [...new Set(blocks.map((b) => b.task))];
}

// Total hours given to all blocks.
function totalHours(blocks) {
  return blocks.reduce((sum, b) => sum + b.allocatedHours, 0);
}

// ------------------------------------------------------------------
// 1. Sprint 1 behaviour (from verifyWeightedSchedule.js and
//    verifySchedulingEdgeCases.js)
// ------------------------------------------------------------------
describe('Sprint 1: weighted scheduling rules', () => {
  test('the task with the least slack is scheduled first', async () => {
    // A: 12 days left, needs 20h at 2h/day = 10 days -> slack 2 days
    // B: 5 days left, needs 1h = 0.5 days          -> slack 4.5 days
    const a = makeTask('taskA', '2026-09-25', 20);
    const b = makeTask('taskB', '2026-09-18', 1);
    const { blocks } = await generatePlan({ tasks: [b, a], availableStudyTimeHours: 2, startDate: START });
    assert.equal(blocks[0].task, 'taskA');
  });

  test('priority breaks a tie between tasks with the same slack', async () => {
    const medium = makeTask('medium', '2026-09-18', 1, 'medium');
    const high = makeTask('high', '2026-09-18', 1, 'high');
    const { blocks } = await generatePlan({ tasks: [medium, high], availableStudyTimeHours: 2, startDate: START });
    assert.deepEqual(taskOrder(blocks), ['high', 'medium']);
  });

  test('rejects an empty task list', async () => {
    await assert.rejects(
      generatePlan({ tasks: [], availableStudyTimeHours: 2, startDate: START }),
      /At least one task/,
    );
  });

  test('rejects zero or negative study time', async () => {
    const task = makeTask('t1', '2026-09-20', 1);
    for (const hours of [0, -3]) {
      await assert.rejects(
        generatePlan({ tasks: [task], availableStudyTimeHours: hours, startDate: START }),
        /positive number/,
      );
    }
  });

  test('a single task gets all of its hours', async () => {
    const { blocks } = await generatePlan({ tasks: [makeTask('solo', '2026-09-20', 3)], availableStudyTimeHours: 2, startDate: START });
    assert.equal(totalHours(blocks), 3);
  });

  test('a task the student is already behind on (negative slack) still goes first', async () => {
    const behind = makeTask('behind', '2026-09-14', 20);
    const relaxed = makeTask('relaxed', '2026-10-13', 2);
    const { blocks } = await generatePlan({ tasks: [relaxed, behind], availableStudyTimeHours: 2, startDate: START });
    assert.equal(blocks[0].task, 'behind');
  });

  test('two identical tasks are both scheduled without crashing', async () => {
    const x = makeTask('x', '2026-09-20', 2);
    const y = makeTask('y', '2026-09-20', 2);
    const { blocks } = await generatePlan({ tasks: [x, y], availableStudyTimeHours: 2, startDate: START });
    assert.deepEqual(new Set(taskOrder(blocks)), new Set(['x', 'y']));
  });

  test('a task with no priority field is treated as medium', async () => {
    const noPriority = { _id: 'np', subject: 's', deadline: new Date('2026-09-25'), estimatedEffortHours: 1 };
    const { blocks } = await generatePlan({ tasks: [noPriority], availableStudyTimeHours: 2, startDate: START });
    assert.equal(totalHours(blocks), 1);
  });

  test('fractional hours (15 minutes) are allocated exactly', async () => {
    const { blocks } = await generatePlan({ tasks: [makeTask('tiny', '2026-09-20', 0.25)], availableStudyTimeHours: 2, startDate: START });
    assert.ok(Math.abs(totalHours(blocks) - 0.25) < 1e-9);
  });

  test('a big task is split across several days (2h + 2h + 1h)', async () => {
    const { blocks } = await generatePlan({ tasks: [makeTask('big', '2026-09-25', 5)], availableStudyTimeHours: 2, startDate: START });
    assert.deepEqual(blocks.map((b) => b.allocatedHours), [2, 2, 1]);
  });
});

// ------------------------------------------------------------------
// 2. Sprint 2 regression: session-based scheduling (maxSessionHours,
//    firstDayHours) must still follow the slack rules above.
// ------------------------------------------------------------------
describe('Sprint 2 regression: session-based scheduling', () => {
  test('a task the student is behind on still goes first in session mode', async () => {
    const behind = makeTask('behind', '2026-09-14', 20);
    const relaxed = makeTask('relaxed', '2026-10-13', 2);
    const { blocks } = await generatePlan({
      tasks: [relaxed, behind], availableStudyTimeHours: 2, startDate: START, maxSessionHours: 1,
    });
    assert.equal(blocks[0].task, 'behind');
  });

  test('priority still breaks ties in session mode', async () => {
    const low = makeTask('low', '2026-09-18', 1, 'low');
    const high = makeTask('high', '2026-09-18', 1, 'high');
    const { blocks } = await generatePlan({
      tasks: [low, high], availableStudyTimeHours: 2, startDate: START, maxSessionHours: 1,
    });
    assert.equal(blocks[0].task, 'high');
  });

  test('small session lengths do not lose or add time (no rounding drift)', async () => {
    const a = makeTask('a', '2026-09-20', 0.1);
    const b = makeTask('b', '2026-09-20', 0.2);
    const { blocks } = await generatePlan({
      tasks: [a, b], availableStudyTimeHours: 0.3, startDate: START, maxSessionHours: 0.1,
    });
    assert.ok(Math.abs(totalHours(blocks) - 0.3) < 1e-9);
  });

  test('firstDayHours larger than the daily limit is capped to the daily limit', async () => {
    const { blocks } = await generatePlan({
      tasks: [makeTask('t', '2026-09-25', 4)], availableStudyTimeHours: 2, startDate: START, firstDayHours: 10,
    });
    const firstDay = blocks.filter((b) => b.date.getTime() === START.getTime());
    assert.equal(totalHours(firstDay), 2);
  });

  test('negative firstDayHours is treated as zero (plan starts tomorrow)', async () => {
    const { blocks } = await generatePlan({
      tasks: [makeTask('t', '2026-09-25', 2)], availableStudyTimeHours: 2, startDate: START, maxSessionHours: 1, firstDayHours: -5,
    });
    assert.equal(blocks[0].date.toISOString().slice(0, 10), '2026-09-14');
  });
});

// ------------------------------------------------------------------
// 3. Input validation (new in Sprint 2). Before the fix, a task with a
//    missing deadline or effort made its slack "NaN" (not a number),
//    which broke the sort: a task due in 47 days was put before a task
//    due tomorrow, and a task with no effort silently vanished.
// ------------------------------------------------------------------
describe('Sprint 2: invalid task data is rejected', () => {
  test('rejects a task with no deadline', async () => {
    const bad = { _id: 'bad', subject: 's', estimatedEffortHours: 2, priority: 'high' };
    await assert.rejects(
      generatePlan({ tasks: [makeTask('ok', '2026-09-20', 2), bad], availableStudyTimeHours: 2, startDate: START }),
      /valid deadline/,
    );
  });

  test('rejects a task with no effort hours', async () => {
    const bad = { _id: 'bad', subject: 's', deadline: new Date('2026-09-20'), priority: 'high' };
    await assert.rejects(
      generatePlan({ tasks: [makeTask('ok', '2026-09-20', 2), bad], availableStudyTimeHours: 2, startDate: START }),
      /estimatedEffortHours/,
    );
  });

  test('rejects zero or negative effort hours', async () => {
    for (const hours of [0, -3]) {
      await assert.rejects(
        generatePlan({ tasks: [makeTask('bad', '2026-09-20', hours)], availableStudyTimeHours: 2, startDate: START }),
        /estimatedEffortHours/,
      );
    }
  });
});
// ------------------------------------------------------------------
// 4. Unavailable days (Sprint 2 feature). The student can block off days
//    (work shifts, holidays, appointments). No study block may land on a
//    blocked day, and the work is fitted into the other days instead.
//    Dates here are built in local time, the same way the app saves them.
// ------------------------------------------------------------------
describe('Sprint 2: unavailable days', () => {
  const day = (d) => new Date(2026, 9, d); // 9 = October (months start at 0)
  const MON = day(5);
  const localDay = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const task = (id, deadline, hours) => ({ _id: id, subject: 's', deadline, estimatedEffortHours: hours, priority: 'medium' });

  test('no study block lands on a blocked day (simple mode)', async () => {
    const { blocks } = await generatePlan({
      tasks: [task('t', day(20), 6)], availableStudyTimeHours: 2, startDate: MON,
      unavailableDates: [day(6), day(7)],
    });
    assert.deepEqual(blocks.map((b) => localDay(b.date)), ['2026-10-5', '2026-10-8', '2026-10-9']);
  });

  test('no study block lands on a blocked day (session mode)', async () => {
    const { blocks } = await generatePlan({
      tasks: [task('a', day(20), 4), task('b', day(22), 4)], availableStudyTimeHours: 2, startDate: MON,
      maxSessionHours: 1, unavailableDates: [day(6), day(8)],
    });
    const used = new Set(blocks.map((b) => localDay(b.date)));
    assert.ok(!used.has('2026-10-6') && !used.has('2026-10-8'));
  });

  test('all hours are still scheduled when days are blocked', async () => {
    const { blocks } = await generatePlan({
      tasks: [task('a', day(20), 5), task('b', day(22), 3)], availableStudyTimeHours: 2, startDate: MON,
      maxSessionHours: 1, unavailableDates: [day(5), day(6), day(9)],
    });
    assert.ok(Math.abs(totalHours(blocks) - 8) < 1e-9);
  });

  test('if the first day is blocked, the plan starts on the next free day', async () => {
    const { blocks } = await generatePlan({
      tasks: [task('t', day(20), 2)], availableStudyTimeHours: 2, startDate: MON,
      unavailableDates: [day(5), day(6)],
    });
    assert.equal(localDay(blocks[0].date), '2026-10-7');
  });

  test('blocked days before a deadline make that task more urgent', async () => {
    // A: due 12 Oct, 4h. B: due 8 Oct, 2h. Normally B has less slack and goes first.
    // Blocking 8-11 Oct takes 4 of A's days away (but none of B's), so A must go first.
    const tasks = [task('A', day(12), 4), task('B', day(8), 2)];
    const normal = await generatePlan({ tasks, availableStudyTimeHours: 2, startDate: MON });
    assert.equal(normal.blocks[0].task, 'B');
    const withBlocked = await generatePlan({
      tasks, availableStudyTimeHours: 2, startDate: MON,
      unavailableDates: [day(8), day(9), day(10), day(11)],
    });
    assert.equal(withBlocked.blocks[0].task, 'A');
  });

  test('empty or invalid blocked dates are ignored', async () => {
    const tasks = [task('t', day(20), 4)];
    const normal = await generatePlan({ tasks, availableStudyTimeHours: 2, startDate: MON });
    const withJunk = await generatePlan({ tasks, availableStudyTimeHours: 2, startDate: MON, unavailableDates: ['not a date', null] });
    assert.deepEqual(withJunk.blocks.map((b) => localDay(b.date)), normal.blocks.map((b) => localDay(b.date)));
  });
});

// Saving blocked days from the availability form (controller helper).
describe('Sprint 2: reading unavailable days from the form', () => {
  const { parseUnavailableDates } = require('../controllers/studyPlanController');
  const inDays = (n) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  test('accepts one date or a list, sorted, without duplicates', () => {
    assert.equal(parseUnavailableDates(inDays(3)).length, 1);
    const dates = parseUnavailableDates([inDays(5), inDays(2), inDays(5)]);
    assert.equal(dates.length, 2);
    assert.ok(dates[0] < dates[1]);
  });

  test('drops past dates and anything that is not a date', () => {
    assert.deepEqual(parseUnavailableDates([inDays(-2), 'hello', '', undefined]), []);
    assert.deepEqual(parseUnavailableDates(undefined), []);
  });
});
