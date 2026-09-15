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


module.exports = router;