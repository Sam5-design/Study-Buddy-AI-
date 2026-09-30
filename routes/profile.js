const express = require('express');
const router = express.Router();
const ensureAuth = require('../middleware/ensureAuth');
const {
  showProfile,
  updateProfile,
  updateReminders,
  changePassword,
} = require('../controllers/profileController');
// Personal details page for the logged-in student.
router.get('/', ensureAuth, showProfile);
router.post('/', ensureAuth, updateProfile);
router.post('/reminders', ensureAuth, updateReminders);
router.post('/password', ensureAuth, changePassword);

module.exports = router;
