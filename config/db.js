const mongoose = require('mongoose');

// If there is no .env file (for example straight after a git pull), use a
// local MongoDB on this computer, so the app runs with no extra setup.
const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/study-buddy-ai';

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || LOCAL_MONGO_URI;
    if (!process.env.MONGO_URI) {
      console.log(`No MONGO_URI set, using local database: ${LOCAL_MONGO_URI}`);
    }
    await mongoose.connect(uri);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;