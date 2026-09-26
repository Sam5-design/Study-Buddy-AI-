const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['student', 'admin'],
    default: 'student',
  },
  // FR-8: hours per day the student can study. Used by plan generation (FR-12).
  availableStudyTimeHours: {
    type: Number,
    min: [0.5, 'Study time must be at least 30 minutes a day.'],
    max: [16, 'Study time cannot be more than 16 hours a day.'],
    default: null,
  },
  // Time of day the student usually starts studying, e.g. '18:00'.
  // The dashboard lays each day's study blocks out from this time.
  studyStartTime: {
    type: String,
    match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must look like 18:00.'],
    default: '18:00',
  },
  // Longest single study session in minutes. Longer tasks are split into
  // sessions of this length so different subjects can share a day.
  sessionLengthMinutes: {
    type: Number,
    enum: [30, 60, 90, 120],
    default: 60,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', userSchema);