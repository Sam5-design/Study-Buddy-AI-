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
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', userSchema);