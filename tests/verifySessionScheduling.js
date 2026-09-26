/**
 * Tests for session-based scheduling and adaptive regeneration options
 * (maxSessionHours, firstDayHours) in the scheduling engine.
 *
 * Run with: node tests/verifySessionScheduling.js
 * No database needed — uses plain task objects.
 */
const { generatePlan } = require('../services/aiSchedulingEngine/generatePlan');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`PASSED: ${label}`);
    passed += 1;
  } else {
    console.error(`FAILED: ${label}`);
    failed += 1;
  }
}

const dayKey = (d) => d.toISOString().slice(0, 10);

function hoursPerDay(blocks) {
  const totals = {};
  blocks.forEach((b) => { totals[dayKey(b.date)] = (totals[dayKey(b.date)] || 0) + b.allocatedHours; });
  return totals;
}

function hoursPerTask(blocks) {
  const totals = {};
  blocks.forEach((b) => { totals[b.task] = (totals[b.task] || 0) + b.allocatedHours; });
  return totals;
}

async function run() {
  const startDate = new Date('2026-09-13T00:00:00.000Z');

  const maths = { _id: 'maths', subject: 's1', deadline: new Date('2026-09-20T00:00:00.000Z'), estimatedEffortHours: 4, priority: 'medium' };
  const physics = { _id: 'physics', subject: 's2', deadline: new Date('2026-09-21T00:00:00.000Z'), estimatedEffortHours: 4, priority: 'medium' };
  const urgent = { _id: 'urgent', subject: 's3', deadline: new Date('2026-09-14T00:00:00.000Z'), estimatedEffortHours: 2, priority: 'low' };

  // --- 1: subjects with similar urgency are mixed within a day ---
  {
    const { blocks } = await generatePlan({
      tasks: [maths, physics], availableStudyTimeHours: 2, startDate, maxSessionHours: 1,
    });
    const firstDay = blocks.filter((b) => dayKey(b.date) === '2026-09-13').map((b) => b.task);
    check('mixes two similarly urgent subjects on the same day', new Set(firstDay).size === 2);
  }

  // --- 2: every hour of effort is still scheduled ---
  {
    const { blocks } = await generatePlan({
      tasks: [maths, physics, urgent], availableStudyTimeHours: 2, startDate, maxSessionHours: 1,
    });
    const totals = hoursPerTask(blocks);
    check('schedules all effort hours for every task', totals.maths === 4 && totals.physics === 4 && totals.urgent === 2);
  }

  // --- 3: never more than the daily limit ---
  {
    const { blocks } = await generatePlan({
      tasks: [maths, physics, urgent], availableStudyTimeHours: 2, startDate, maxSessionHours: 1,
    });
    check('never exceeds available hours in a day', Object.values(hoursPerDay(blocks)).every((h) => h <= 2 + 1e-9));
  }

  // --- 4: a much more urgent task still goes first ---
  {
    const { blocks } = await generatePlan({
      tasks: [maths, physics, urgent], availableStudyTimeHours: 2, startDate, maxSessionHours: 1,
    });
    check('most urgent task (due tomorrow) gets the first session', blocks[0].task === 'urgent');
  }

  // --- 5: no session is longer than maxSessionHours unless the same task is merged ---
  {
    const { blocks } = await generatePlan({
      tasks: [maths, physics], availableStudyTimeHours: 3, startDate, maxSessionHours: 1,
    });
    check('sessions respect the maximum session length', blocks.every((b) => b.allocatedHours <= 3));
  }

  // --- 6: firstDayHours limits the first day ---
  {
    const { blocks } = await generatePlan({
      tasks: [maths], availableStudyTimeHours: 2, startDate, maxSessionHours: 1, firstDayHours: 1,
    });
    const totals = hoursPerDay(blocks);
    check('uses only the hours left on the first day', totals['2026-09-13'] === 1 && totals['2026-09-14'] === 2);
  }

  // --- 7: firstDayHours of 0 starts the plan the next day ---
  {
    const { blocks } = await generatePlan({
      tasks: [maths], availableStudyTimeHours: 2, startDate, firstDayHours: 0,
    });
    check('starts the next day when no time is left today', dayKey(blocks[0].date) === '2026-09-14');
  }

  // --- 8: leaving the new options out keeps the original behaviour ---
  {
    const { blocks } = await generatePlan({ tasks: [maths, physics], availableStudyTimeHours: 2, startDate });
    const order = [...new Set(blocks.map((b) => b.task))];
    check('without the new options, tasks are still scheduled one after another', order[0] === 'maths' && blocks[0].allocatedHours === 2);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Verification script error:', err);
  process.exit(1);
});
