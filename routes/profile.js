const express = require('express');
const router = express.Router();
const ensureAuth = require('../middleware/ensureAuth');
const { showProfile, updateProfile } = require('../controllers/profileController');

// Personal details page for the logged-in student.
router.get('/', ensureAuth, showProfile);
router.post('/', ensureAuth, updateProfile);

module.exports = router;
