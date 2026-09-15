const mongoose = require('mongoose');

// Subject / unit owned by a single student (FR-6).

const subjectSchema = new mongoose.Schema({

  // The logged-in student who owns this subject
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Example:
  // Software Engineering
  name: {
    type: String,
    required: [true, 'Subject name is required.'],
    trim: true,
    maxlength: [100, 'Subject name cannot exceed 100 characters.'],
  },

  // Example:
  // SIT725
  code: {
    type: String,
    required: [true, 'Subject code is required.'],
    trim: true,
    uppercase: true,
    maxlength: [20, 'Subject code cannot exceed 20 characters.'],
  },

  // Example:
  // Trimester 2, 2026
  trimester: {
    type: String,
    required: [true, 'Trimester is required.'],
    trim: true,
  },

  // Used by calendar and study plan UI
  colour: {
    type: String,
    trim: true,
    default: '#E56B61',
  },

}, {
  timestamps: true,
});


// ======================================================
// DUPLICATE PROTECTION
// ======================================================

// A student cannot have two subjects with the same name.
subjectSchema.index(
  {
    user: 1,
    name: 1,
  },
  {
    unique: true,
  }
);


// A student should also not have the same subject code twice.
//
// Example:
// SIT725 + user123
// SIT725 + user123  ❌
//
// But another student can still have SIT725.
subjectSchema.index(
  {
    user: 1,
    code: 1,
  },
  {
    unique: true,
  }
);


// ======================================================
// CASCADE DELETE
// ======================================================

// FR-10:
// Deleting a subject must not leave its tasks behind.

subjectSchema.pre(
  'findOneAndDelete',
  async function () {

    const subject =
      await this.model.findOne(
        this.getQuery()
      );

    if (subject) {

      await mongoose
        .model('Task')
        .deleteMany({
          subject: subject._id,
        });

    }

  }
);


module.exports =
  mongoose.model(
    'Subject',
    subjectSchema
  );