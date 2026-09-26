const express = require('express');
const router = express.Router();
const ensureAuth = require('../middleware/ensureAuth');
const {
  showStudyPlan,
  generateStudyPlan,
  showAvailability,
  saveAvailability,
} = require('../controllers/studyPlanController');

// FR-16: render the student's current plan.
router.get('/', ensureAuth, showStudyPlan);

// FR-12: generate a plan. No request body needed, everything comes from
// the student's own stored subjects, tasks and available study time.
router.post('/generate', ensureAuth, generateStudyPlan);

// FR-8: set how many hours a day the student can study.
router.get('/availability', ensureAuth, showAvailability);
router.post('/availability', ensureAuth, saveAvailability);

module.exports = router;