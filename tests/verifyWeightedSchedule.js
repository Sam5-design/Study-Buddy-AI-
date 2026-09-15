/**
 * Verification script for the weighted scheduling algorithm.
 * Run with: node verifyWeightedSchedule.js
 * No database needed — uses plain task objects.
 */
const { generatePlan } = require('../services/aiSchedulingEngine/generatePlan');

async function run() {
  const startDate = new Date('2026-09-13T00:00:00.000Z');

  // Task A: due in 12 days, needs 20 hours of effort. At 2 hrs/day that's
  // 10 days of work needed -> slack = 12 - 10 = 2 days. Tight.
  const taskA = {
    _id: 'taskA',
    subject: 'subjectA',
    deadline: new Date('2026-09-25T00:00:00.000Z'), // 12 days out
    estimatedEffortHours: 20,
    priority: 'medium',
  };

  // Task B: due in 5 days, needs only 1 hour. At 2 hrs/day that's 0.5
  // days of work needed -> slack = 5 - 0.5 = 4.5 days. More breathing
  // room than Task A, despite the closer deadline -> should NOT jump
  // ahead of Task A.
  const taskB = {
    _id: 'taskB',
    subject: 'subjectB',
    deadline: new Date('2026-09-18T00:00:00.000Z'), // 5 days out
    estimatedEffortHours: 1,
    priority: 'medium',
  };

  // Task C: same slack as Task B roughly, but priority high -> should be
  // scheduled before Task B due to the priority tiebreaker.
  const taskC = {
    _id: 'taskC',
    subject: 'subjectC',
    deadline: new Date('2026-09-18T00:00:00.000Z'),
    estimatedEffortHours: 1,
    priority: 'high',
  };

  const { blocks } = await generatePlan({
    tasks: [taskB, taskA, taskC], // deliberately out of "correct" order
    availableStudyTimeHours: 2,
    startDate,
  });

  const firstTaskScheduled = blocks[0].task;
  const scheduleOrder = [...new Set(blocks.map((b) => b.task))];

  console.log('Schedule order (by task id):', scheduleOrder);

  // Task A should be scheduled first: it has less slack (2 days) than
  // Task B (4.5 days), even though Task B's deadline is nominally
  // closer — because Task A needs far more work relative to the time
  // it has.
  if (firstTaskScheduled !== 'taskA') {
    console.error('FAILED: expected Task A (low slack) to be scheduled first.');
    process.exit(1);
  }
  console.log('PASSED: low-slack task (A) correctly scheduled first.');

  // Between B and C (similar slack, same deadline), C (high priority)
  // should come before B (medium priority).
  const cIndex = scheduleOrder.indexOf('taskC');
  const bIndex = scheduleOrder.indexOf('taskB');
  if (cIndex >= bIndex) {
    console.error('FAILED: expected high-priority Task C before medium-priority Task B.');
    process.exit(1);
  }
  console.log('PASSED: priority correctly used as a tiebreaker (C before B).');

  console.log('\nAll checks passed.');
}

run().catch((err) => {
  console.error('Verification script error:', err);
  process.exit(1);
});
