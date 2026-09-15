/**
 * Verification script for subject and task creation (subjectController).
 * Run with: node tests/verifySubjects.js
 * Needs a real MongoDB connection — uses the same DB as .env.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Task = require('../models/Task');
const { createSubject, createTask } = require('../controllers/subjectController');

function fakeRes(label) {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; console.log(`[${label}] ${this.statusCode}`, payload); return this; },
  };
}

function fakeReq(user, body, params = {}) {
  return { user, body, params };
}

function daysFromNow(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  // clean slate
  const oldUser = await User.findOne({ email: 'verify-subjects@test.com' });
  if (oldUser) {
    await Task.deleteMany({ user: oldUser._id });
    await Subject.deleteMany({ user: oldUser._id });
    await User.deleteOne({ _id: oldUser._id });
  }

  const user = await User.create({ email: 'verify-subjects@test.com', password: 'hashed-placeholder' });

  // 1. Create a subject — expect 201
  let subjectRes = fakeRes('create-subject');
  await createSubject(fakeReq(user, { name: 'Databases', colour: '#26a69a' }), subjectRes, console.error);
  const subjectId = subjectRes.body.subject._id;

  // 2. Create the same-named subject again for the same user — expect 409 (unique index)
  await createSubject(fakeReq(user, { name: 'Databases' }), fakeRes('create-subject-duplicate'), console.error);

  // 3. Missing name — expect 400
  await createSubject(fakeReq(user, {}), fakeRes('create-subject-missing-name'), console.error);

  // 4. Create a task with a valid future deadline — expect 201
  await createTask(
    fakeReq(user, { description: 'Read chapter 4', deadline: daysFromNow(3), estimatedEffortHours: 2 }, { subjectId }),
    fakeRes('create-task-valid'),
    console.error
  );

  // 5. Create a task with a PAST deadline — expect 400 (Task model's built-in validator)
  await createTask(
    fakeReq(user, { description: 'Late task', deadline: daysFromNow(-3), estimatedEffortHours: 1 }, { subjectId }),
    fakeRes('create-task-past-deadline'),
    console.error
  );

  // 6. Create a task under a subject that doesn't belong to this user — expect 404
  const otherUser = await User.create({ email: 'verify-subjects-other@test.com', password: 'hashed-placeholder' });
  const otherSubject = await Subject.create({ user: otherUser._id, name: 'Someone Else\'s Subject' });
  await createTask(
    fakeReq(user, { description: 'Sneaky task', deadline: daysFromNow(3), estimatedEffortHours: 1 }, { subjectId: otherSubject._id }),
    fakeRes('create-task-unauthorised-subject'),
    console.error
  );

  // cleanup
  await Task.deleteMany({ user: { $in: [user._id, otherUser._id] } });
  await Subject.deleteMany({ user: { $in: [user._id, otherUser._id] } });
  await User.deleteMany({ _id: { $in: [user._id, otherUser._id] } });
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
