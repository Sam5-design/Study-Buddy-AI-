/**
 * Edge-case tests for the weighted scheduling algorithm (Komal's card:
 * "Write unit tests for scheduling algorithm edge cases", 4 pts).
 *
 * Run with: node verifySchedulingEdgeCases.js
 * No database needed — uses plain task objects, same as
 * verifyWeightedSchedule.js.
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

async function run() {
  const startDate = new Date('2026-09-13T00:00:00.000Z');

  // --- Edge case 1: empty task list should be rejected ---
  try {
    await generatePlan({ tasks: [], availableStudyTimeHours: 2, startDate });
    check('rejects an empty task list', false);
  } catch (err) {
    check('rejects an empty task list', err.message.includes('At least one task'));
  }

  // --- Edge case 2: zero available study time should be rejected ---
  try {
    await generatePlan({
      tasks: [{ _id: 't1', subject: 's1', deadline: new Date('2026-09-20'), estimatedEffortHours: 1, priority: 'medium' }],
      availableStudyTimeHours: 0,
      startDate,
    });
    check('rejects zero available study time', false);
  } catch (err) {
    check('rejects zero available study time', err.message.includes('positive number'));
  }

  // --- Edge case 3: negative available study time should be rejected ---
  try {
    await generatePlan({
      tasks: [{ _id: 't1', subject: 's1', deadline: new Date('2026-09-20'), estimatedEffortHours: 1, priority: 'medium' }],
      availableStudyTimeHours: -3,
      startDate,
    });
    check('rejects negative available study time', false);
  } catch (err) {
    check('rejects negative available study time', err.message.includes('positive number'));
  }

  // --- Edge case 4: a single task should still produce a valid plan ---
  {
    const { blocks } = await generatePlan({
      tasks: [{ _id: 'solo', subject: 'subjectA', deadline: new Date('2026-09-20'), estimatedEffortHours: 3, priority: 'medium' }],
      availableStudyTimeHours: 2,
      startDate,
    });
    const totalHours = blocks.reduce((sum, b) => sum + b.allocatedHours, 0);
    check('a single task still produces blocks summing to its full effort', totalHours === 3);
  }

  // --- Edge case 5: an overdue-relative-to-effort task (negative slack)
  // should still be scheduled first, not crash or get skipped. This is
  // the "student is already behind" scenario. ---
  {
    const impossible = {
      _id: 'impossible',
      subject: 'subjectA',
      deadline: new Date('2026-09-14'), // tomorrow
      estimatedEffortHours: 20, // way more than can fit by tomorrow
      priority: 'medium',
    };
    const comfortable = {
      _id: 'comfortable',
      subject: 'subjectB',
      deadline: new Date('2026-10-13'), // 30 days out
      estimatedEffortHours: 2,
      priority: 'medium',
    };
    const { blocks } = await generatePlan({
      tasks: [comfortable, impossible],
      availableStudyTimeHours: 2,
      startDate,
    });
    const order = [...new Set(blocks.map((b) => b.task))];
    check('a task with negative slack (already behind) is still scheduled first, without crashing', order[0] === 'impossible');
  }

  // --- Edge case 6: tasks with identical slack and identical priority
  // should not crash the sort, and both should still appear. ---
  {
    const taskX = { _id: 'x', subject: 's', deadline: new Date('2026-09-20'), estimatedEffortHours: 2, priority: 'medium' };
    const taskY = { _id: 'y', subject: 's', deadline: new Date('2026-09-20'), estimatedEffortHours: 2, priority: 'medium' };
    const { blocks } = await generatePlan({ tasks: [taskX, taskY], availableStudyTimeHours: 2, startDate });
    const idsScheduled = new Set(blocks.map((b) => b.task));
    check('identical tasks (same slack, same priority) do not crash the sort and both get scheduled', idsScheduled.has('x') && idsScheduled.has('y'));
  }

  // --- Edge case 7: a task missing a priority field should default
  // sensibly rather than crashing (mirrors the Mongoose schema default
  // of "medium", in case a plain object without that field slips through). ---
  {
    const noPriority = { _id: 'noPriority', subject: 's', deadline: new Date('2026-09-25'), estimatedEffortHours: 1 };
    let didThrow = false;
    try {
      await generatePlan({ tasks: [noPriority], availableStudyTimeHours: 2, startDate });
    } catch (err) {
      didThrow = true;
    }
    check('a task with no priority field does not crash (defaults gracefully)', !didThrow);
  }

  // --- Edge case 8: fractional effort hours (e.g. 0.25h = 15 min, the
  // schema's own minimum) should split/allocate correctly, not produce
  // fractional-day weirdness. ---
  {
    const tiny = { _id: 'tiny', subject: 's', deadline: new Date('2026-09-20'), estimatedEffortHours: 0.25, priority: 'medium' };
    const { blocks } = await generatePlan({ tasks: [tiny], availableStudyTimeHours: 2, startDate });
    const totalHours = blocks.reduce((sum, b) => sum + b.allocatedHours, 0);
    check('fractional effort hours (0.25h) are allocated exactly, no rounding drift', Math.abs(totalHours - 0.25) < 1e-9);
  }

  // --- Edge case 9: a task needing more hours than fit in one day should
  // correctly split across multiple days. ---
  {
    const big = { _id: 'big', subject: 's', deadline: new Date('2026-09-25'), estimatedEffortHours: 5, priority: 'medium' };
    const { blocks } = await generatePlan({ tasks: [big], availableStudyTimeHours: 2, startDate });
    check('a task larger than one day\'s available time splits across multiple days', blocks.length === 3); // 2 + 2 + 1 hours
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Verification script error:', err);
  process.exit(1);
});
