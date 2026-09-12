/**
 * Verification script for the Study Plan screen (checklist item 3).
 *
 * Run with: node scripts/verifyStudyPlanView.js
 *
 * Generates a sample plan in the database, then calls showStudyPlan()
 * with a fake req/res to confirm the screen receives correctly mapped
 * data. Checks the no-plan state first, before any plan exists.
 *
 * Needs a real MongoDB connection (MONGO_URI in .env).
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Subject = require('../models/Subject');
const Task = require('../models/Task');
const StudyPlan = require('../models/StudyPlan');
const { showStudyPlan, generateStudyPlan } = require('../controllers/studyPlanController');

const created = { user: null, subject: null };

function daysFromNow(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

// Fake response that captures what the controller rendered, instead of
// sending anything over HTTP.
function fakeRes() {
  return {
    statusCode: null,
    viewName: null,
    locals: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    render(view, locals) { this.viewName = view; this.locals = locals; return this; },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION FAILED: ' + message);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  const user = await User.create({
    email: `view-check-${Date.now()}@example.com`,
    password: 'not-a-real-hash',
  });
  created.user = user;

  const req = {
    user: { id: user._id.toString(), availableStudyTimeHours: 2 },
    query: {},
  };

  // --- No-plan state -------------------------------------------------------
  {
    const res = fakeRes();
    await showStudyPlan(req, res, (error) => { throw error; });
    assert(res.viewName === 'studyPlan/index', `expected studyPlan/index, got ${res.viewName}`);
    assert(res.locals.planView.hasPlan === false, 'expected hasPlan false with no plan');
    assert(res.locals.planView.days.length === 0, 'expected no days with no plan');
    console.log('1. No-plan state: hasPlan false, no days, correct view');
  }

  // --- Create sample data and generate a plan ------------------------------
  const subject = await Subject.create({ user: user._id, name: 'SIT725', colour: '#df6d60' });
  created.subject = subject;

  await Task.create([
    {
      user: user._id, subject: subject._id, description: 'Read lecture 5',
      deadline: daysFromNow(3), estimatedEffortHours: 2, priority: 'high',
    },
    {
      user: user._id, subject: subject._id, description: 'Finish prac 8',
      deadline: daysFromNow(6), estimatedEffortHours: 3,
    },
  ]);

  {
    const res = fakeRes();
    await generateStudyPlan(req, res);
    assert(res.statusCode === 201, `plan generation failed: ${JSON.stringify(res.body)}`);
    console.log(`2. Sample plan generated with ${res.body.plan.blocks.length} blocks`);
  }

  // --- Retrieve and map ----------------------------------------------------
  {
    const res = fakeRes();
    await showStudyPlan(req, res, (error) => { throw error; });
    const planView = res.locals.planView;

    assert(planView.hasPlan === true, 'expected hasPlan true');
    assert(planView.days.length > 0, 'expected at least one day');

    // Days must come back in ascending date order.
    const dates = planView.days.map((day) => day.isoDate);
    assert(
      dates.join() === [...dates].sort().join(),
      `days not sorted ascending: ${dates.join(' ')}`
    );

    // Populated references must have resolved to real names.
    const firstBlock = planView.days[0].blocks[0];
    assert(firstBlock.description !== 'Untitled task', 'task did not populate');
    assert(firstBlock.subjectName === 'SIT725', `expected SIT725, got ${firstBlock.subjectName}`);
    assert(firstBlock.subjectColour === '#df6d60', 'subject colour did not populate');

    // Per-day totals must add up to the plan total.
    const summed = planView.days.reduce((total, day) => total + day.totalHours, 0);
    assert(
      Math.abs(summed - planView.totalScheduledHours) < 0.001,
      `day totals ${summed} do not match plan total ${planView.totalScheduledHours}`
    );

    console.log(`3. Plan retrieved and mapped: ${planView.days.length} days, ${planView.totalScheduledHours}h total`);
    console.log(`   References populated: ${firstBlock.subjectName} / ${firstBlock.description}`);
    planView.days.forEach((day) => {
      console.log(`   ${day.isoDate}  ${day.label}  ${day.totalHours}h  ${day.blocks.length} block(s)${day.isToday ? '  [today]' : ''}`);
    });
  }

  // --- View toggle respects the query string -------------------------------
  {
    const res = fakeRes();
    await showStudyPlan({ ...req, query: { view: 'calendar' } }, res, (error) => { throw error; });
    assert(res.locals.currentView === 'calendar', `expected calendar, got ${res.locals.currentView}`);

    const res2 = fakeRes();
    await showStudyPlan({ ...req, query: { view: 'nonsense' } }, res2, (error) => { throw error; });
    assert(res2.locals.currentView === 'list', 'unknown view should fall back to list');
    console.log('4. View toggle: calendar respected, unknown value falls back to list');
  }

  // --- A superseded plan must not be shown ---------------------------------
  {
    await StudyPlan.updateMany({ user: user._id }, { status: 'superseded' });
    const res = fakeRes();
    await showStudyPlan(req, res, (error) => { throw error; });
    assert(res.locals.planView.hasPlan === false, 'superseded plan should not be rendered');
    console.log('5. Superseded plan correctly not shown, falls back to no-plan state');
  }

  console.log('\nAll checks passed.');
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