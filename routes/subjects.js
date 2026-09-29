const express = require('express');

const router = express.Router();

const ensureAuth =
  require('../middleware/ensureAuth');

const {
  showCreateSubject,
  createSubject,
  showCreateTask,
  createTask
} = require(
  '../controllers/subjectController'
);


router.get(
  '/new',
  ensureAuth,
  showCreateSubject
);


router.post(
  '/',
  ensureAuth,
  createSubject
);


router.get(
  '/:subjectId/tasks/new',
  ensureAuth,
  showCreateTask
);


router.post(
  '/:subjectId/tasks',
  ensureAuth,
  createTask
);


// ======================================================
// US3: view, edit and delete subjects and tasks
// ======================================================

const manage = require('../controllers/subjectManageController');

router.get('/', ensureAuth, manage.listSubjects);

router.get('/:subjectId/edit', ensureAuth, manage.showEditSubject);
router.post('/:subjectId/edit', ensureAuth, manage.updateSubject);
router.post('/:subjectId/delete', ensureAuth, manage.deleteSubject);

router.get('/:subjectId/tasks/:taskId/edit', ensureAuth, manage.showEditTask);
router.post('/:subjectId/tasks/:taskId/edit', ensureAuth, manage.updateTask);
router.post('/:subjectId/tasks/:taskId/delete', ensureAuth, manage.deleteTask);
router.post('/:subjectId/tasks/:taskId/delete-series', ensureAuth, manage.deleteTaskSeries);


module.exports = router;