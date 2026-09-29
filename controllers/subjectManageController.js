/**
 * US3 / FR-9, FR-10: view, edit and delete subjects and tasks.
 *
 * Every query is scoped to the logged-in student (user: req.user.id), so a
 * student can never see, edit or delete someone else's subject or task by
 * guessing an id.
 *
 * After any change the study plan is recalculated automatically (US6).
 */
const Subject = require('../models/Subject');
const Task = require('../models/Task');
const { recalculateIfPlanExists } = require('../services/studyPlanService');

const PRIORITIES = ['low', 'medium', 'high'];
const COLOURS = ['#E56B61', '#F5D98A', '#DDEBE2', '#172B4D'];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Value for <input type="datetime-local">, in local time.
function toDateTimeInput(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Redirect target after a change: back to the list, and tell the
// dashboard to show "what changed" if the plan was recalculated.
function afterChange(res, recalculated, message) {
  const params = new URLSearchParams({ msg: message });
  if (recalculated) params.set('regenerated', '1');
  return res.redirect(`/subjects?${params.toString()}`);
}

// ======================================================
// GET /subjects — list subjects with their tasks
// ======================================================
async function listSubjects(req, res, next) {
  try {
    const [subjects, tasks] = await Promise.all([
      Subject.find({ user: req.user.id }).sort({ createdAt: 1 }),
      Task.find({ user: req.user.id }).sort({ deadline: 1 }),
    ]);

    const tasksBySubject = {};
    tasks.forEach((task) => {
      const key = String(task.subject);
      (tasksBySubject[key] = tasksBySubject[key] || []).push(task);
    });

    return res.render('subjects/index', {
      subjects,
      tasksBySubject,
      message: req.query.msg || null,
      recalculated: req.query.regenerated === '1',
    });
  } catch (error) {
    return next(error);
  }
}

// ======================================================
// SUBJECT: edit / delete
// ======================================================
async function showEditSubject(req, res, next) {
  try {
    const subject = await Subject.findOne({ _id: req.params.subjectId, user: req.user.id });
    if (!subject) return res.status(404).send('Subject not found.');

    return res.render('subjects/edit-subject', { subject, formData: subject, colours: COLOURS, errors: [] });
  } catch (error) {
    return next(error);
  }
}

async function updateSubject(req, res, next) {
  try {
    const subject = await Subject.findOne({ _id: req.params.subjectId, user: req.user.id });
    if (!subject) return res.status(404).send('Subject not found.');

    const name = String(req.body.name || '').trim();
    const code = String(req.body.code || '').trim();
    const trimester = String(req.body.trimester || '').trim();
    const colour = COLOURS.includes(req.body.colour) ? req.body.colour : subject.colour;

    const errors = [];
    if (!name) errors.push('Subject name is required.');
    if (!code) errors.push('Subject code is required.');
    if (!trimester) errors.push('Trimester is required.');

    const formData = { name, code, trimester, colour };
    if (errors.length) {
      return res.status(400).render('subjects/edit-subject', { subject, formData, colours: COLOURS, errors });
    }

    Object.assign(subject, formData);
    try {
      await subject.save();
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).render('subjects/edit-subject', {
          subject, formData, colours: COLOURS, errors: ['You already have a subject with that name or code.'],
        });
      }
      if (error.name === 'ValidationError') {
        return res.status(400).render('subjects/edit-subject', {
          subject, formData, colours: COLOURS, errors: Object.values(error.errors).map((e) => e.message),
        });
      }
      throw error;
    }

    // Name / colour changes show on the dashboard straight away; no reschedule needed.
    return afterChange(res, false, `Subject "${subject.code}" was updated.`);
  } catch (error) {
    return next(error);
  }
}

async function deleteSubject(req, res, next) {
  try {
    // findOneAndDelete triggers the cascade in models/Subject.js (FR-10),
    // which also deletes this subject's tasks.
    const subject = await Subject.findOneAndDelete({ _id: req.params.subjectId, user: req.user.id });
    if (!subject) return res.status(404).send('Subject not found.');

    const recalculated = await recalculateIfPlanExists(
      req.user,
      `Subject "${subject.code}" and its tasks were deleted.`
    );
    return afterChange(res, recalculated, `Subject "${subject.code}" and its tasks were deleted.`);
  } catch (error) {
    return next(error);
  }
}

// ======================================================
// TASK: edit / delete
// ======================================================
async function findOwnedTask(req) {
  const [subject, task] = await Promise.all([
    Subject.findOne({ _id: req.params.subjectId, user: req.user.id }),
    Task.findOne({ _id: req.params.taskId, subject: req.params.subjectId, user: req.user.id }),
  ]);
  return { subject, task };
}

async function showEditTask(req, res, next) {
  try {
    const { subject, task } = await findOwnedTask(req);
    if (!subject || !task) return res.status(404).send('Task not found.');

    return res.render('subjects/edit-task', {
      subject,
      task,
      formData: {
        description: task.description,
        deadline: toDateTimeInput(task.deadline),
        estimatedEffortHours: task.estimatedEffortHours,
        priority: task.priority,
        isExam: Boolean(task.isExam),
        status: task.status,
        notes: task.notes || '',
        links: (task.links || []).join('\n'),
      },
      errors: [],
    });
  } catch (error) {
    return next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    const { subject, task } = await findOwnedTask(req);
    if (!subject || !task) return res.status(404).send('Task not found.');

    const description = String(req.body.description || '').trim();
    const effort = Number(req.body.estimatedEffortHours);
    const priority = String(req.body.priority || 'medium').toLowerCase();
    const status = req.body.status === 'complete' ? 'complete' : 'pending';
    const isExam = Boolean(req.body.isExam); // exam boost (Sprint 2)
    const deadline = new Date(req.body.deadline);

    // Notes and links (Sprint 2). Links come from a textarea, one per line.
    const notes = String(req.body.notes || '').trim();
    const links = String(req.body.links || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const editAll = req.body.scope === 'all' && Boolean(task.recurrenceGroupId);

    const errors = [];
    if (!description) errors.push('Task description is required.');
    if (notes.length > 2000) errors.push('Notes cannot exceed 2000 characters.');
    if (links.some((l) => !/^https?:\/\//i.test(l))) {
      errors.push('Links must start with http:// or https://');
    }
    if (description.length > 300) errors.push('Task description cannot exceed 300 characters.');
    if (Number.isNaN(deadline.getTime())) {
      errors.push('Please enter a valid deadline.');
    } else {
      // A changed deadline can't be moved into the past (FR-11 / FR-14).
      const deadlineChanged = deadline.getTime() !== new Date(task.deadline).getTime();
      const deadlineDay = new Date(deadline);
      deadlineDay.setHours(0, 0, 0, 0);
      if (deadlineChanged && deadlineDay < startOfToday()) {
        errors.push('The deadline must be today or a later date.');
      }
    }
    if (!Number.isFinite(effort) || effort < 0.25) errors.push('Effort must be at least 15 minutes (0.25 hours).');
    if (effort > 200) errors.push('Effort estimate looks unrealistic. Please check the value.');
    if (!PRIORITIES.includes(priority)) errors.push('Priority must be low, medium or high.');

    if (errors.length) {
      return res.status(400).render('subjects/edit-task', {
        subject, task, formData: { ...req.body, priority, status }, errors,
      });
    }

    const before = {
      deadline: task.deadline.getTime(),
      effort: task.estimatedEffortHours,
      priority: task.priority,
      isExam: Boolean(task.isExam),
      status: task.status,
    };

    task.description = description;
    task.deadline = deadline;
    task.estimatedEffortHours = effort;
    task.priority = priority;
    task.isExam = isExam;
    task.status = status;
    task.notes = notes;
    task.links = links;
    await task.save();

    // "All tasks in this series": copy the shared details to the other
    // repeats. Deadline and status stay per task, because each repeat has
    // its own due date and its own progress.
    if (editAll) {
      await Task.updateMany(
        { recurrenceGroupId: task.recurrenceGroupId, user: req.user.id, _id: { $ne: task._id } },
        { $set: { description, estimatedEffortHours: effort, priority, isExam } }
      );
    }

    // Only reschedule if something that affects the plan changed.
    const affectsPlan = before.deadline !== deadline.getTime() || before.effort !== effort
      || before.priority !== priority || before.status !== status
      || before.isExam !== isExam;

    let recalculated = false;
    if (affectsPlan) {
      recalculated = await recalculateIfPlanExists(req.user, `You edited "${description}".`);
    }
    return afterChange(res, recalculated, `Task "${description}" was updated.`);
  } catch (error) {
    return next(error);
  }
}

async function deleteTask(req, res, next) {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.taskId,
      subject: req.params.subjectId,
      user: req.user.id,
    });
    if (!task) return res.status(404).send('Task not found.');

    const recalculated = await recalculateIfPlanExists(req.user, `Task "${task.description}" was deleted.`);
    return afterChange(res, recalculated, `Task "${task.description}" was deleted.`);
  } catch (error) {
    return next(error);
  }
}

// Deletes every task in a weekly series (Sprint 2, recurring tasks).
async function deleteTaskSeries(req, res, next) {
  try {
    const { task } = await findOwnedTask(req);
    if (!task || !task.recurrenceGroupId) return res.status(404).send('Task not found.');

    const result = await Task.deleteMany({
      recurrenceGroupId: task.recurrenceGroupId,
      user: req.user.id,
    });

    const recalculated = await recalculateIfPlanExists(
      req.user,
      `Repeating task "${task.description}" was deleted.`
    );
    return afterChange(res, recalculated, `${result.deletedCount} repeats of "${task.description}" were deleted.`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listSubjects,
  showEditSubject,
  updateSubject,
  deleteSubject,
  showEditTask,
  updateTask,
  deleteTask,
  deleteTaskSeries,
};
