const StudyPlan = require('../models/StudyPlan');
const Subject = require('../models/Subject');
const Task = require('../models/Task');
const { buildProgressViewModel } = require('../utils/progressViewModel');
const { buildStreakViewModel } = require('../utils/streakViewModel');

async function showProgress(req, res, next) {
  try {
    const userId = req.user.id;

    const [plan, subjects, tasks] = await Promise.all([
      StudyPlan.findOne({ user: userId, status: 'active' })
        .populate('blocks.subject', 'name code colour'),
      Subject.find({ user: userId }).sort({ createdAt: 1 }),
      Task.find({ user: userId }).populate('subject', 'name code colour'),
    ]);

    const stats = buildProgressViewModel({
      plan,
      subjects,
      tasks,
      today: new Date(),
    });

    const streaks = buildStreakViewModel({ plan, today: new Date() });

    return res.render('progress', {
      streaks,
      user: req.user,
      stats,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { showProgress };
