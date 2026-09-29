const User = require('../models/User');
const Subject = require('../models/Subject');
const Task = require('../models/Task');

/**
 * GET /profile
 * Shows the student's personal details, study settings and a few totals.
 */
async function showProfile(req, res, next) {
  try {
    const [subjectCount, taskCount, completedCount] = await Promise.all([
      Subject.countDocuments({ user: req.user.id }),
      Task.countDocuments({ user: req.user.id }),
      Task.countDocuments({ user: req.user.id, status: 'complete' }),
    ]);

    return res.render('profile', {
      user: req.user,
      stats: { subjectCount, taskCount, completedCount },
      saved: req.query.saved === '1',
      error: null,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /profile
 * Lets the student change their full name.
 * (Email is their login, so it isn't editable here.)
 */
async function updateProfile(req, res, next) {
  try {
    const fullName = String(req.body.fullName || '').trim();

    if (fullName.length < 2 || fullName.length > 80) {
      const [subjectCount, taskCount, completedCount] = await Promise.all([
        Subject.countDocuments({ user: req.user.id }),
        Task.countDocuments({ user: req.user.id }),
        Task.countDocuments({ user: req.user.id, status: 'complete' }),
      ]);
      return res.status(400).render('profile', {
        user: { ...req.user.toObject(), fullName },
        stats: { subjectCount, taskCount, completedCount },
        saved: false,
        error: 'Please enter your full name (2 to 80 characters).',
      });
    }

    await User.findByIdAndUpdate(req.user.id, { fullName });
    return res.redirect('/profile?saved=1');
  } catch (error) {
    return next(error);
  }
}

async function updateReminders(req, res, next) {
  try {
    const remindersEnabled = req.body.remindersEnabled === 'on';
    await User.findByIdAndUpdate(req.user.id, { remindersEnabled });
    return res.redirect('/profile?saved=1#reminders');
  } catch (error) {
    return next(error);
  }
}

module.exports = { showProfile, updateProfile, updateReminders };
