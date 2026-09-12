const express = require('express');
const router = express.Router();
const ensureAuth = require('../middleware/ensureAuth');
const { generateStudyPlan } = require('../controllers/studyPlanController');

// FR-12. No request body needed, everything comes from the student's own
// stored subjects, tasks and available study time.
router.post('/generate', ensureAuth, generateStudyPlan);

module.exports = router;