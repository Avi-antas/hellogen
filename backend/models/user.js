const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  profilePic: { type: String, default: '' },
  phoneNumber: { type: String, unique: true, sparse: true },
  isVerified: { type: Boolean, default: false },
  otpCode: { type: String },
  otpExpires: { type: Date },
  
  // ✅ NEW: Pinned partners
  pinnedPartners: [{
    partnerId: { type: String, required: true },  // socketId or userId
    name: { type: String, required: true },
    avatar: { type: String, default: '😎' },
    topic: { type: String },
    pinnedAt: { type: Date, default: Date.now },
    lastSeen: { type: Date },
    chatCount: { type: Number, default: 0 }
  }],
  
  // Moderation system
  status: {
    type: String,
    enum: ['active', 'suspended_24h', 'suspended_2d', 'suspended_7d', 'suspended_30d', 'deactivated'],
    default: 'active'
  },
  suspensionCount: { type: Number, default: 0 },
  suspensionHistory: [{
    reason: String,
    duration: String,
    startedAt: Date,
    endsAt: Date
  }],
  reportCount: { type: Number, default: 0 },
  lastReportAt: Date,
  suspendedUntil: Date,
  
  // Guest tracking
  isGuest: { type: Boolean, default: false },
  guestSessionStart: Date,
  guestIpAddress: String,
  
  // User stats
  totalChatTime: { type: Number, default: 0 },
  totalSessions: { type: Number, default: 0 },
  matchesCount: { type: Number, default: 0 },
  reportsReceived: { type: Number, default: 0 },
  reportsMade: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);