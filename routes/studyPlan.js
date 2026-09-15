const express = require('express');
const router = express.Router();
const ensureAuth = require('../middleware/ensureAuth');
const { showStudyPlan, generateStudyPlan } = require('../controllers/studyPlanController');

// FR-16: render the student's current plan.
router.get('/', ensureAuth, showStudyPlan);

// FR-12: generate a plan. No request body needed, everything comes from
// the student's own stored subjects, tasks and available study time.
router.post('/generate', ensureAuth, generateStudyPlan);

module.exports = router;