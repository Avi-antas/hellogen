const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Remove useNewUrlParser and useUnifiedTopology - they're deprecated
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Don't exit on DB connection error in production, just log it
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

module.exports = connectDB;