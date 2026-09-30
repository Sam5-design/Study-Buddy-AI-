const bcrypt = require('bcrypt');
const passport = require('passport');
const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

async function register(req, res, next) {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword });

    // logs the new user straight into a session, so they don't have to log in twice
    req.login(user, (err) => {
      if (err) return next(err);
      return res.status(201).json({ message: 'Account created.', redirect: '/dashboard' });
    });
  } catch (error) {
    next(error);
  }
}



function login(req, res, next) {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ message: info?.message || 'Invalid email or password.' });

    req.login(user, (err) => {
      if (err) return next(err);
      return res.status(200).json({ message: 'Logged in.', redirect: '/dashboard' });
    });
  })(req, res, next);
}

function logout(req, res, next) {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      // Remove the session cookie from the browser as well.
      res.clearCookie('connect.sid');
      return res.redirect('/login');
    });
  });
}

function showForgotPassword(req, res) {
  res.render('auth/forgot-password', {
    message: null,
    error: null,
  });
}

async function forgotPassword(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).render('auth/forgot-password', {
        message: null,
        error: 'Enter your email address.',
      });
    }

    const user = await User.findOne({ email });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');

      user.passwordResetTokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const baseUrl = (
        process.env.APP_BASE_URL || 'http://localhost:3000'
      ).replace(/\/+$/, '');

      const resetUrl = `${baseUrl}/reset-password/${token}`;

      const smtpConfigured = Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS
      );

      if (!smtpConfigured && process.env.NODE_ENV === 'production') {
        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        await user.save();

        return next(new Error('SMTP email settings are missing.'));
      }

      if (!smtpConfigured) {
        // Local development only: copy this link from the VS Code terminal.
        console.log('\n[DEV] Password reset link:\n' + resetUrl + '\n');
      } else {
        const port = Number(process.env.SMTP_PORT || 587);

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: user.email,
            subject: 'Reset your Study Buddy password',
            text: `Use this link to reset your password. It expires in one hour: ${resetUrl}`,
            html: `
              <p>Use the link below to reset your Study Buddy password.
              It expires in one hour.</p>
              <p><a href="${resetUrl}">Reset password</a></p>
            `,
          });
        } catch (mailError) {
          user.passwordResetTokenHash = null;
          user.passwordResetExpiresAt = null;
          await user.save();
          return next(mailError);
        }
      }
    }

    // Give the same response whether or not the email belongs to an account.
    return res.render('auth/forgot-password', {
      message: 'If an account uses that email, a password reset link has been sent.',
      error: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function showResetPassword(req, res, next) {
  try {
    const tokenHash = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    return res.render('auth/reset-password', {
      token: req.params.token,
      isValid: Boolean(user),
      error: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).render('auth/reset-password', {
        token: req.params.token,
        isValid: true,
        error: 'The new password must be at least 8 characters.',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).render('auth/reset-password', {
        token: req.params.token,
        isValid: true,
        error: 'The passwords do not match.',
      });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).render('auth/reset-password', {
        token: req.params.token,
        isValid: false,
        error: null,
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    return res.render('auth/reset-success');
  } catch (error) {
    return next(error);
  }
}
module.exports = {
  register,
  login,
  logout,
  showForgotPassword,
  forgotPassword,
  showResetPassword,
  resetPassword,
};



