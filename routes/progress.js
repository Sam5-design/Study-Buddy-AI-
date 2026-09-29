const express = require('express');
const router = express.Router();
const ensureAuth = require('../middleware/ensureAuth');
const { showProgress } = require('../controllers/progressController');

router.get('/', ensureAuth, showProgress);

module.exports = router;
