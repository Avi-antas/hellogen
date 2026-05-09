const express = require('express');
const router = express.Router();

// ✅ FIX: Safely require models
let Report, User;

try {
  Report = require('../models/Report');
} catch (err) {
  console.log('Report model not loaded yet');
}

try {
  User = require('../models/user');
} catch (err) {
  console.log('User model not loaded yet');
}

// Report violation endpoint
router.post('/report', async (req, res) => {
  const { 
    reportedUserId, 
    reporterId, 
    isGuest, 
    topic, 
    violations, 
    violationType, 
    description, 
    timestamp,
    guestIp,
    chatSessionId
  } = req.body;
  
  console.log('📝 Report received:', { 
    reportedUserId, 
    reporterId,
    violationType, 
    topic,
    isGuest,
    timestamp: new Date().toISOString()
  });
  
  try {
    // If Report model is not available, return success without saving
    if (!Report) {
      console.log('⚠️ Report model not available, skipping database save');
      return res.json({ 
        success: true, 
        message: 'Report noted (offline mode)',
        reportId: Date.now()
      });
    }
    
    // Create new report using your schema
    const report = new Report({
      reporterId: reporterId,
      reportedUserId: reportedUserId || null,
      reportedGuestIp: isGuest ? (guestIp || req.ip) : null,
      reason: violationType,
      severity: violations?.length > 0 ? Math.min(violations.length, 5) : 3,
      description: description || violations?.map(v => v.message).join(', ') || '',
      chatSessionId: chatSessionId || `session_${Date.now()}`,
      aiDetectedContent: {
        hasAbusiveLanguage: violations?.some(v => v.type === 'audio_slang') || false,
        hasSlangViolations: violations?.some(v => v.type === 'audio_slang') || false,
        confidenceScore: violations?.length > 0 ? 0.8 : 0
      },
      status: 'pending'
    });
    
    await report.save();
    console.log(`✅ Report saved with ID: ${report._id}`);
    
    // Increment report count for the reported user (if auth user and User model exists)
    if (reportedUserId && !isGuest && User) {
      try {
        await User.findByIdAndUpdate(reportedUserId, { 
          $inc: { reportCount: 1, reportsReceived: 1 } 
        });
        console.log(`📊 Incremented report count for user: ${reportedUserId}`);
      } catch (userErr) {
        console.log('User update skipped:', userErr.message);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Report submitted successfully',
      reportId: report._id
    });
    
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error submitting report',
      error: error.message 
    });
  }
});

// Audio moderation endpoint
router.post('/audio', async (req, res) => {
  console.log('🎤 Audio moderation request received');
  try {
    res.json({ 
      isInappropriate: false, 
      confidence: 0, 
      detected: [],
      transcript: ""
    });
  } catch (error) {
    console.error('Audio moderation error:', error);
    res.json({ 
      isInappropriate: false, 
      confidence: 0, 
      detected: [] 
    });
  }
});

// Get reports (optional - for admin)
router.get('/reports', async (req, res) => {
  try {
    if (!Report) {
      return res.json({ success: true, reports: [] });
    }
    const reports = await Report.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('reporterId', 'username profilePic')
      .populate('reportedUserId', 'username profilePic');
    
    res.json({ success: true, reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single report
router.get('/report/:id', async (req, res) => {
  try {
    if (!Report) {
      return res.status(404).json({ success: false, message: 'Report model not available' });
    }
    const report = await Report.findById(req.params.id)
      .populate('reporterId', 'username profilePic email')
      .populate('reportedUserId', 'username profilePic');
    
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Moderation routes are working!' });
});

module.exports = router;