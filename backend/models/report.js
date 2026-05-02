const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reportedGuestIp: { type: String },
  reason: {
    type: String,
    enum: ['harassment', 'nudity', 'hate-speech', 'violence', 'spam', 'other'],
    required: true
  },
  severity: { type: Number, default: 1, min: 1, max: 5 },
  description: String,
  chatSessionId: String,
  aiDetectedContent: {
    hasAbusiveLanguage: Boolean,
    hasNudity: Boolean,
    hasSlangViolations: Boolean,
    confidenceScore: Number
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'actioned', 'dismissed'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', ReportSchema);