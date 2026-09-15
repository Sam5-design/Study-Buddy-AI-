const Task = require('../models/Task');
const StudyPlan = require('../models/StudyPlan');
const aiSchedulingEngine = require('../services/aiSchedulingEngine');
const { buildPlanViewModel } = require('../utils/planViewModel');

/**
 * GET /study-plan
 * FR-16: show the student their current plan as a list or calendar view.
 *
 * Only ever loads the student's own active plan, so a superseded plan or
 * another student's plan can't be rendered by guessing an id.
 */
async function showStudyPlan(req, res, next) {
  try {
    const plan = await StudyPlan.findOne({ user: req.user.id, status: 'active' })
      .populate('blocks.task', 'description deadline status')
      .populate('blocks.subject', 'name colour');

    const planView = buildPlanViewModel(plan);

    // 'list' or 'calendar'. Defaults to list. The toggle itself is a
    // separate card, this just respects the query string if it's there.
    const requestedView = req.query.view === 'calendar' ? 'calendar' : 'list';

    return res.render('studyPlan/index', {
      planView,
      currentView: requestedView,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /study-plan/generate
 * FR-12: generate a day-by-day plan from the student's current tasks,
 * deadlines, effort estimates and available study time.
 *
 * Reads availableStudyTimeHours off req.user rather than re-querying the
 * User collection, since Passport's deserializeUser already attaches the
 * full user document to every authenticated request. That field is not
 * on the User schema yet (open item, tracked separately) — until it is,
 * this returns a normal 400 rather than crashing.
 */
async function generateStudyPlan(req, res) {
  try {
    const userId = req.user.id;
    const availableStudyTimeHours = req.user.availableStudyTimeHours;

    if (!availableStudyTimeHours || availableStudyTimeHours <= 0) {
      return res.status(400).json({
        message: 'Please set your available study time before generating a plan.',
      });
    }

    const tasks = await Task.find({ user: userId, status: 'pending' }).sort({ deadline: 1 });

    if (tasks.length === 0) {
      return res.status(400).json({
        message: 'Add at least one subject and task before generating a plan.',
      });
    }

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    let result;
    try {
      result = await aiSchedulingEngine.generatePlan({ tasks, availableStudyTimeHours, startDate });
    } catch (serviceError) {
      console.error('Scheduling engine failed:', serviceError.message);

      // FR-17: a failed regeneration must not leave the student without a
      // plan at all, so fall back to whatever they had before.
      const existingPlan = await StudyPlan.findOne({ user: userId, status: 'active' });
      if (existingPlan) {
        return res.status(200).json({
          message: 'Could not regenerate the plan just now, showing your last saved plan instead.',
          plan: existingPlan,
        });
      }
      return res.status(502).json({
        message: 'Could not generate a study plan right now. Please try again shortly.',
      });
    }

    // Old active plan is marked superseded rather than deleted, so a crash
    // partway through never leaves the student with zero plans.
    await StudyPlan.updateMany({ user: userId, status: 'active' }, { status: 'superseded' });

    const plan = await StudyPlan.create({
      user: userId,
      startDate,
      availableStudyTimeHours,
      blocks: result.blocks,
      adjustments: [{ trigger: 'initial', note: 'Initial plan generated.' }],
    });

    return res.status(201).json({ plan });
  } catch (error) {
    console.error('generateStudyPlan error:', error);
    return res.status(500).json({ message: 'Something went wrong generating the plan.' });
  }
}

module.exports = { showStudyPlan, generateStudyPlan };