const express = require('express');
const plannerController = require('../controllers/planner.controller');
const ensureAuthenticated = require('../middleware/ensureAuthenticated');

const router = express.Router();

router.use(ensureAuthenticated);

router.get('/', plannerController.dashboard);

router.get('/subjects/new', plannerController.showCreateSubject);
router.post('/subjects', plannerController.createSubject);

router.get('/tasks/new', plannerController.showCreateTask);
router.post('/tasks', plannerController.createTask);

router.get('/availability', plannerController.showAvailability);
router.post('/availability', plannerController.saveAvailability);
router.post('/generate', plannerController.generatePlan);

router.get('/plan', plannerController.showPlan);
router.post('/sessions/:id/complete', plannerController.completeSession);

module.exports = router;
