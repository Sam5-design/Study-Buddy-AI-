const Subject = require('../models/Subject');
const Task = require('../models/Task');


// ======================================================
// HELPER
// ======================================================

// Browser/EJS forms should include:
//
// <input type="hidden" name="_web" value="1">
//
// This lets us support:
// 1. Normal website forms -> render / redirect
// 2. API/Postman requests -> JSON responses

function isWebRequest(req) {
  return req.body && req.body._web === '1';
}


// ======================================================
// SHOW CREATE SUBJECT PAGE
// ======================================================

// GET /subjects/new

async function showCreateSubject(req, res, next) {
  try {

    return res.render('subject-new', {
      errors: [],
      formData: {}
    });

  } catch (error) {

    next(error);

  }
}


// ======================================================
// CREATE SUBJECT
// ======================================================

// POST /subjects

async function createSubject(req, res, next) {

  try {

    const {
      name,
      code,
      trimester,
      colour
    } = req.body;


    // ==================================================
    // VALIDATION
    // ==================================================

    const errors = [];


    if (!name || !name.trim()) {
      errors.push(
        'Subject name is required.'
      );
    }


    if (!code || !code.trim()) {
      errors.push(
        'Subject code is required.'
      );
    }


    if (!trimester || !trimester.trim()) {
      errors.push(
        'Trimester is required.'
      );
    }


    // ==================================================
    // VALIDATION FAILED
    // ==================================================

    if (errors.length > 0) {

      // Website / EJS form
      if (isWebRequest(req)) {

        return res.status(400).render(
          'subject-new',
          {
            errors,
            formData: req.body
          }
        );

      }


      // API / Postman
      return res.status(400).json({
        message: errors.join(' ')
      });

    }


    // ==================================================
    // CREATE SUBJECT
    // ==================================================

    const subject = await Subject.create({

      user: req.user.id,

      name: name.trim(),

      code: code.trim(),

      trimester: trimester.trim(),

      colour:
        colour || '#E56B61'

    });


    // ==================================================
    // WEBSITE FLOW
    // ==================================================

    if (isWebRequest(req)) {

      // Subject successfully created.
      // Now send the student to Add Task.

      return res.redirect(
        `/subjects/${subject._id}/tasks/new`
      );

    }


    // ==================================================
    // API FLOW
    // ==================================================

    return res.status(201).json({
      subject
    });


  } catch (error) {


    // ==================================================
    // DUPLICATE SUBJECT
    // ==================================================

    if (error.code === 11000) {

      const message =
        'You already have a subject with that name or code.';


      if (isWebRequest(req)) {

        return res.status(409).render(
          'subject-new',
          {
            errors: [message],
            formData: req.body
          }
        );

      }


      return res.status(409).json({
        message
      });

    }


    // ==================================================
    // MONGOOSE VALIDATION ERROR
    // ==================================================

    if (error.name === 'ValidationError') {

      const message =
        Object
          .values(error.errors)
          .map(err => err.message)
          .join(' ');


      if (isWebRequest(req)) {

        return res.status(400).render(
          'subject-new',
          {
            errors: [message],
            formData: req.body
          }
        );

      }


      return res.status(400).json({
        message
      });

    }


    next(error);

  }

}


// ======================================================
// SHOW CREATE TASK PAGE
// ======================================================

// GET /subjects/:subjectId/tasks/new

async function showCreateTask(req, res, next) {

  try {

    const { subjectId } =
      req.params;


    // Check that the subject exists
    // and belongs to the logged-in user.

    const subject =
      await Subject.findOne({

        _id: subjectId,

        user: req.user.id

      });


    if (!subject) {

      return res
        .status(404)
        .send('Subject not found.');

    }


    return res.render(
      'task-new',
      {
        subject,
        errors: [],
        formData: {}
      }
    );


  } catch (error) {

    next(error);

  }

}


// ======================================================
// CREATE TASK
// ======================================================

// POST /subjects/:subjectId/tasks

async function createTask(req, res, next) {

  try {

    const { subjectId } =
      req.params;


    const {
      description,
      deadline,
      estimatedEffortHours,
      priority
    } = req.body;


    // ==================================================
    // CHECK SUBJECT OWNERSHIP
    // ==================================================

    const subject =
      await Subject.findOne({

        _id: subjectId,

        user: req.user.id

      });


    if (!subject) {

      if (isWebRequest(req)) {

        return res
          .status(404)
          .send('Subject not found.');

      }


      return res.status(404).json({
        message: 'Subject not found.'
      });

    }


    // ==================================================
    // VALIDATION
    // ==================================================

    const errors = [];


    // -----------------------------
    // Description
    // -----------------------------

    if (
      !description ||
      !description.trim()
    ) {

      errors.push(
        'Task description is required.'
      );

    }


    if (
      description &&
      description.trim().length > 300
    ) {

      errors.push(
        'Task description cannot exceed 300 characters.'
      );

    }


    // -----------------------------
    // Deadline
    // -----------------------------

    if (!deadline) {

      errors.push(
        'A deadline is required.'
      );

    }


    if (deadline) {

      const deadlineDate =
        new Date(deadline);


      if (
        Number.isNaN(
          deadlineDate.getTime()
        )
      ) {

        errors.push(
          'Please enter a valid deadline.'
        );

      } else {

        const today =
          new Date();

        today.setHours(
          0,
          0,
          0,
          0
        );


        const selectedDate =
          new Date(deadlineDate);

        selectedDate.setHours(
          0,
          0,
          0,
          0
        );


        if (
          selectedDate < today
        ) {

          errors.push(
            'The deadline must be today or a later date.'
          );

        }

      }

    }


    // -----------------------------
    // Estimated effort
    // -----------------------------

    const effort =
      Number(
        estimatedEffortHours
      );


    if (
      estimatedEffortHours === undefined ||
      estimatedEffortHours === '' ||
      Number.isNaN(effort)
    ) {

      errors.push(
        'An effort estimate is required.'
      );

    } else {


      if (effort < 0.25) {

        errors.push(
          'Effort must be at least 15 minutes.'
        );

      }


      if (effort > 200) {

        errors.push(
          'Effort estimate looks unrealistic. Please check the value.'
        );

      }

    }


    // -----------------------------
    // Priority
    // -----------------------------

    const allowedPriorities = [
      'low',
      'medium',
      'high'
    ];


    let taskPriority =
      priority || 'medium';


    taskPriority =
      taskPriority.toLowerCase();


    if (
      !allowedPriorities.includes(
        taskPriority
      )
    ) {

      errors.push(
        'Priority must be low, medium or high.'
      );

    }


    // ==================================================
    // VALIDATION FAILED
    // ==================================================

    if (errors.length > 0) {

      if (isWebRequest(req)) {

        return res.status(400).render(
          'task-new',
          {
            subject,
            errors,
            formData: req.body
          }
        );

      }


      return res.status(400).json({
        message: errors.join(' ')
      });

    }


    // ==================================================
    // CREATE TASK
    // ==================================================

    const task =
      await Task.create({

        user: req.user.id,

        subject: subjectId,

        description:
          description.trim(),

        deadline,

        estimatedEffortHours:
          effort,

        priority:
          taskPriority

      });


    // ==================================================
    // WEBSITE FLOW
    // ==================================================

    if (isWebRequest(req)) {

      // Task successfully created.
      // Next step in the Figma flow:
      // Available Study Time.

      return res.redirect(
        '/study-plan/availability'
      );

    }


    // ==================================================
    // API FLOW
    // ==================================================

    return res.status(201).json({
      task
    });


  } catch (error) {


    // ==================================================
    // MONGOOSE VALIDATION ERROR
    // ==================================================

    if (error.name === 'ValidationError') {

      const message =
        Object
          .values(error.errors)
          .map(err => err.message)
          .join(' ');


      if (isWebRequest(req)) {


        // Reload subject because
        // task-new.ejs needs it.

        const subject =
          await Subject.findOne({

            _id:
              req.params.subjectId,

            user:
              req.user.id

          });


        return res.status(400).render(
          'task-new',
          {
            subject,
            errors: [message],
            formData: req.body
          }
        );

      }


      return res.status(400).json({
        message
      });

    }


    next(error);

  }

}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {

  showCreateSubject,

  createSubject,

  showCreateTask,

  createTask

};