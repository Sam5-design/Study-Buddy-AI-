/**
 * Verification script for the Subject, Task and StudyPlan schemas.
 * Creates one throwaway student with a subject, two tasks and a study plan,
 * reads the plan back with populate to confirm the references resolve, then
 * removes everything it created.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Subject = require('../models/Subject');
const Task = require('../models/Task');
const StudyPlan = require('../models/StudyPlan');

const created = { user: null, subject: null, tasks: [], plans: [] };

function daysFromNow(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  // --- Create a throwaway student -----------------------------------------
  const user = await User.create({
    email: `schema-check-${Date.now()}@example.com`,
    password: 'not-a-real-hash',
  });
  created.user = user;
  console.log('1. Created test student:', user.email);

  // --- Subject and tasks ---------------------------------------------------
  const subject = await Subject.create({ user: user._id, name: 'SIT725' });
  created.subject = subject;
  console.log('2. Created subject:', subject.name);

  const tasks = await Task.create([
    {
      user: user._id,
      subject: subject._id,
      description: 'Read lecture 5 notes',
      deadline: daysFromNow(3),
      estimatedEffortHours: 2,
      priority: 'high',
    },
    {
      user: user._id,
      subject: subject._id,
      description: 'Finish prac 8 write-up',
      deadline: daysFromNow(6),
      estimatedEffortHours: 3,
    },
  ]);
  created.tasks = tasks;
  console.log(`3. Created ${tasks.length} tasks, second one defaulted to priority "${tasks[1].priority}"`);

  // --- Study plan ----------------------------------------------------------
  const plan = await StudyPlan.create({
    user: user._id,
    startDate: daysFromNow(0),
    availableStudyTimeHours: 3,
    blocks: [
      { date: daysFromNow(0), task: tasks[0]._id, subject: subject._id, allocatedHours: 2 },
      { date: daysFromNow(1), task: tasks[1]._id, subject: subject._id, allocatedHours: 1.5 },
      { date: daysFromNow(2), task: tasks[1]._id, subject: subject._id, allocatedHours: 1.5 },
    ],
    adjustments: [{ trigger: 'initial', note: 'First generated plan' }],
  });
  created.plans.push(plan);
  console.log('4. Saved study plan with', plan.blocks.length, 'blocks\n');

  // --- Read it back --------------------------------------------------------
  const saved = await StudyPlan.findOne({ user: user._id, status: 'active' })
    .populate('blocks.task', 'description deadline status')
    .populate('blocks.subject', 'name');

  console.log('5. Retrieved plan:');
  console.log('   status:', saved.status);
  console.log('   total scheduled hours:', saved.totalScheduledHours);
  console.log('   blocks today:', saved.blocksOn(daysFromNow(0)).length);
  saved.blocks.forEach((block) => {
    const when = block.date.toISOString().slice(0, 10);
    console.log(`   ${when}  ${block.subject.name}  ${block.task.description}  ${block.allocatedHours}h  [${block.status}]`);
  });
  console.log();

  // --- Check the one-active-plan rule (FR-17) ------------------------------
  try {
    const second = await StudyPlan.create({
      user: user._id,
      startDate: daysFromNow(0),
      availableStudyTimeHours: 3,
    });
    created.plans.push(second);
    console.log('6. PROBLEM: a second active plan was allowed. The partial index is missing.');
    console.log('   Run StudyPlan.syncIndexes() or create the index manually.');
  } catch (error) {
    if (error.code === 11000) {
      console.log('6. Second active plan correctly rejected (duplicate key).');
    } else {
      throw error;
    }
  }

  // --- Supersede and regenerate -------------------------------------------
  await StudyPlan.updateOne({ _id: plan._id }, { status: 'superseded' });
  const regenerated = await StudyPlan.create({
    user: user._id,
    startDate: daysFromNow(0),
    availableStudyTimeHours: 4,
    blocks: [
      { date: daysFromNow(1), task: tasks[1]._id, subject: subject._id, allocatedHours: 3 },
    ],
    adjustments: [
      { trigger: 'initial', note: 'First generated plan' },
      { trigger: 'task_completed', task: tasks[0]._id, note: 'Lecture notes marked complete' },
    ],
  });
  created.plans.push(regenerated);

  const activeCount = await StudyPlan.countDocuments({ user: user._id, status: 'active' });
  const totalCount = await StudyPlan.countDocuments({ user: user._id });
  console.log(`7. After regeneration: ${activeCount} active plan, ${totalCount} kept in total.`);
  console.log('   Adjustment history on the new plan:', regenerated.adjustments.length, 'entries\n');
}

async function cleanUp() {
  if (created.plans.length) await StudyPlan.deleteMany({ user: created.user._id });
  if (created.tasks.length) await Task.deleteMany({ user: created.user._id });
  if (created.subject) await Subject.deleteOne({ _id: created.subject._id });
  if (created.user) await User.deleteOne({ _id: created.user._id });
  console.log('Test data removed.');
}

run()
  .catch((error) => {
    console.error('\nVerification failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (created.user) await cleanUp();
    } catch (error) {
      console.error('Cleanup failed, remove the test records manually:', error.message);
    }
    await mongoose.disconnect();
  });