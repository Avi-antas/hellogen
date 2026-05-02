const express = require('express');
const router = express.Router();
const moderationService = require('../services/moderationService');
const auth = require('../middleware/auth');

router.post('/', auth, async (req, res) => {
  const { reportedUserId, reason, chatSessionId } = req.body;
  const reporterId = req.user.userId;
  
  try {
    const result = await moderationService.handleRedFlag(
      reporterId,
      reportedUserId,
      reason,
      chatSessionId,
      null
    );
    
    res.json(result);
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;