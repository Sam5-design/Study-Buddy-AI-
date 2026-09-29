const express = require('express');
const router = express.Router();
const ensureAuth = require('../middleware/ensureAuth');
const {
  showStudyPlan,
  generateStudyPlan,
  showAvailability,
  saveAvailability,
  toggleBlockComplete,
  exportCalendar,
} = require('../controllers/studyPlanController');

// FR-16: render the student's current plan.
router.get('/', ensureAuth, showStudyPlan);

// FR-12: generate a plan. No request body needed, everything comes from
// the student's own stored subjects, tasks and available study time.
router.post('/generate', ensureAuth, generateStudyPlan);

// FR-8: set how many hours a day the student can study.
router.get('/availability', ensureAuth, showAvailability);
router.post('/availability', ensureAuth, saveAvailability);

// FR-13: mark a study block done (or undo it).
router.post('/blocks/:blockId/complete', ensureAuth, toggleBlockComplete);

// Sprint 2: download the active plan as a calendar file (.ics).
router.get('/export.ics', ensureAuth, exportCalendar);

module.exports = router;