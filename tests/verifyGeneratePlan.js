/**
 * Verification script for the Generate Plan API (studyPlanController).
 *
 * Run with: node scripts/verifyGeneratePlan.js
 *
 * Exercises generateStudyPlan() directly with fake req/res objects, so
 * it does not need the Express server running. It does need a real
 * MongoDB connection for the cases that touch Task and StudyPlan.
 *
 * Covers, in order:
 *   1. Missing availableStudyTimeHours          -> 400
 *   2. No pending tasks                          -> 400
 *   3. Successful generation                     -> 201, blocks persisted
 *   4. A second generation supersedes the first   -> only one active plan
 *   5. The scheduling engine throwing             -> falls back to the
 *                                                    last valid plan (FR-17)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Subject = require('../models/Subject');
const Task = require('../models/Task');
const StudyPlan = require('../models/StudyPlan');
const User = require('../models/User');
const { generateStudyPlan } = require('../controllers/studyPlanController');
const aiSchedulingEngine = require('../services/aiSchedulingEngine');

const created = { user: null, subject: null, tasks: [] };

function daysFromNow(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

// Minimal fake Express response that records what the controller sent.
function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION FAILED: ' + message);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  const user = await User.create({
    email: `plan-check-${Date.now()}@example.com`,
    password: 'not-a-real-hash',
  });
  created.user = user;

  const subject = await Subject.create({ user: user._id, name: 'SIT725' });
  created.subject = subject;

  // --- Case 1: missing availableStudyTimeHours -----------------------------
  {
    const req = { user: { id: user._id.toString() } }; // no availableStudyTimeHours at all
    const res = fakeRes();
    await generateStudyPlan(req, res);
    assert(res.statusCode === 400, `expected 400 for missing available time, got ${res.statusCode}`);
    console.log('1. Missing availableStudyTimeHours correctly rejected (400)');
  }

  // --- Case 2: no pending tasks ----------------------------------------------
  {
    const req = { user: { id: user._id.toString(), availableStudyTimeHours: 3 } };
    const res = fakeRes();
    await generateStudyPlan(req, res);
    assert(res.statusCode === 400, `expected 400 for no tasks, got ${res.statusCode}`);
    console.log('2. No pending tasks correctly rejected (400)');
  }

  // --- Case 3: successful generation -----------------------------------------
  const tasks = await Task.create([
    {
      user: user._id, subject: subject._id, description: 'Read lecture 5',
      deadline: daysFromNow(3), estimatedEffortHours: 2, priority: 'high',
    },
    {
      user: user._id, subject: subject._id, description: 'Finish prac 8',
      deadline: daysFromNow(6), estimatedEffortHours: 3,
    },
  ]);
  created.tasks = tasks;

  let firstPlanId;
  {
    const req = { user: { id: user._id.toString(), availableStudyTimeHours: 2 } };
    const res = fakeRes();
    await generateStudyPlan(req, res);
    assert(res.statusCode === 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert(res.body.plan.blocks.length > 0, 'expected at least one block');
    firstPlanId = res.body.plan._id.toString();
    console.log(`3. Plan generated: 201, ${res.body.plan.blocks.length} blocks, id ${firstPlanId}`);
  }

  // --- Case 4: regenerating supersedes the previous plan ----------------------
  {
    const req = { user: { id: user._id.toString(), availableStudyTimeHours: 4 } };
    const res = fakeRes();
    await generateStudyPlan(req, res);
    assert(res.statusCode === 201, `expected 201 on regeneration, got ${res.statusCode}`);

    const activeCount = await StudyPlan.countDocuments({ user: user._id, status: 'active' });
    const supersededCount = await StudyPlan.countDocuments({ user: user._id, status: 'superseded' });
    assert(activeCount === 1, `expected exactly 1 active plan, got ${activeCount}`);
    assert(supersededCount === 1, `expected exactly 1 superseded plan, got ${supersededCount}`);
    console.log('4. Regeneration superseded the old plan, exactly one active plan remains');
  }

  // --- Case 5: scheduling engine throws, should fall back to last plan -------
  {
    const original = aiSchedulingEngine.generatePlan;
    aiSchedulingEngine.generatePlan = async () => {
      throw new Error('simulated scheduling engine failure');
    };

    const req = { user: { id: user._id.toString(), availableStudyTimeHours: 3 } };
    const res = fakeRes();
    await generateStudyPlan(req, res);

    assert(res.statusCode === 200, `expected 200 fallback, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert(res.body.plan, 'expected a fallback plan in the response');
    console.log('5. Scheduling engine failure fell back to the last valid plan (200), as FR-17 requires');

    aiSchedulingEngine.generatePlan = original;
  }

  console.log('\nAll cases passed.');
}

async function cleanUp() {
  await StudyPlan.deleteMany({ user: created.user._id });
  await Task.deleteMany({ user: created.user._id });
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
    } catch (cleanupError) {
      console.error('Cleanup failed, remove test records manually:', cleanupError.message);
    }
    await mongoose.disconnect();
  });