const mongoose = require('mongoose');

const windowSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6,
      required: true,
    },
    dayName: {
      type: String,
      required: true,
    },
    start: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    end: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
  },
  { _id: false }
);

const availabilitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    sessionLength: {
      type: Number,
      enum: [30, 60, 90],
      default: 60,
    },
    windows: {
      type: [windowSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Availability || mongoose.model('Availability', availabilitySchema);
