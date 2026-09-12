const mongoose = require('mongoose');

// Subject / unit owned by a single student (FR-6).
const subjectSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Subject name is required.'],
    trim: true,
    maxlength: 100,
  },
  colour: {
    type: String,
    trim: true,
    default: '#26a69a', // used by the calendar view to colour-code sessions
  },
}, {
  timestamps: true,
});

// A student cannot have two subjects with the same name.
subjectSchema.index({ user: 1, name: 1 }, { unique: true });

// FR-10: deleting a subject must not leave its tasks behind.
subjectSchema.pre('findOneAndDelete', async function () {
  const subject = await this.model.findOne(this.getQuery());
  if (subject) {
    await mongoose.model('Task').deleteMany({ subject: subject._id });
  }
});

module.exports = mongoose.model('Subject', subjectSchema);