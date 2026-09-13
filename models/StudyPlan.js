const mongoose = require('mongoose');

// One scheduled study session. The engine returns an array of these (FR-12),
// and the calendar and list views both render from the same structure (FR-16).
const scheduleBlockSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
  },
  allocatedHours: {
    type: Number,
    required: true,
    min: [0.25, 'A study block must be at least 15 minutes.'],
  },
  status: {
    type: String,
    enum: ['scheduled', 'complete', 'missed'],
    default: 'scheduled',
  },
}, { _id: true });

// A record of why the plan changed, written every time the engine re-runs (FR-15).
const adjustmentSchema = new mongoose.Schema({
  occurredAt: {
    type: Date,
    default: Date.now,
  },
  trigger: {
    type: String,
    enum: ['initial', 'task_completed', 'task_missed', 'task_rescheduled', 'manual'],
    required: true,
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null,
  },
  note: {
    type: String,
    trim: true,
    maxlength: 300,
  },
}, { _id: false });

const studyPlanSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'superseded'],
    default: 'active',
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
  startDate: {
    type: Date,
    required: true,
  },
  // Snapshot of the input used, so a plan can be explained after the fact
  // even if the student later changes their availability.
  availableStudyTimeHours: {
    type: Number,
    required: true,
    min: 0,
  },
  blocks: {
    type: [scheduleBlockSchema],
    default: [],
  },
  adjustments: {
    type: [adjustmentSchema],
    default: [],
  },
}, {
  timestamps: true,
});

// FR-17: a failed regeneration must leave the student with their last good plan.
// Old plans are marked superseded rather than deleted, and only one plan per
// student is active at a time.
studyPlanSchema.index(
  { user: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

// Convenience for the dashboard summary (FR-18).
studyPlanSchema.virtual('totalScheduledHours').get(function () {
  return this.blocks.reduce((sum, block) => sum + block.allocatedHours, 0);
});

studyPlanSchema.methods.blocksOn = function (date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return this.blocks.filter((block) => block.date >= start && block.date < end);
};

studyPlanSchema.set('toJSON', { virtuals: true });
studyPlanSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('StudyPlan', studyPlanSchema);