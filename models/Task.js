const mongoose = require('mongoose');

// A unit of study work belonging to a subject (FR-7).
const taskSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true,
  },
  description: {
    type: String,
    required: [true, 'Task description is required.'],
    trim: true,
    maxlength: 300,
  },
  deadline: {
    type: Date,
    required: [true, 'A deadline is required.'],
    validate: {
      // FR-11: a new task cannot be given a deadline that has already passed.
      // Only checked on creation so that FR-14 rescheduling is not blocked.
      validator: function (value) {
        if (!this.isNew) return true;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return value >= today;
      },
      message: 'The deadline must be today or a later date.',
    },
  },
  estimatedEffortHours: {
    type: Number,
    required: [true, 'An effort estimate is required.'],
    min: [0.25, 'Effort must be at least 15 minutes.'],
    max: [200, 'Effort estimate looks unrealistic. Please check the value.'],
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium', // optional per FR-7, so it defaults rather than being required
  },
  status: {
    type: String,
    enum: ['pending', 'complete', 'missed'],
    default: 'pending',
    index: true,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// The scheduling engine reads pending tasks for one student in deadline order.
taskSchema.index({ user: 1, status: 1, deadline: 1 });

// Keeps completedAt honest without the controller having to remember it.
taskSchema.pre('save', function () {
  if (this.isModified('status')) {
    this.completedAt = this.status === 'complete' ? new Date() : null;
  }
});

// Hours of work still outstanding, used as an input to plan generation (FR-12).
taskSchema.virtual('remainingEffortHours').get(function () {
  return this.status === 'complete' ? 0 : this.estimatedEffortHours;
});

taskSchema.set('toJSON', { virtuals: true });
taskSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Task', taskSchema);