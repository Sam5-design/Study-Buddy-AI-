const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  showForgotPassword,
  forgotPassword,
  showResetPassword,
  resetPassword,
} = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/forgot-password', showForgotPassword);
router.post('/forgot-password', forgotPassword);

router.get('/reset-password/:token', showResetPassword);
router.post('/reset-password/:token', resetPassword);

module.exports = router;
