const express = require('express');
const router = express.Router();
const topicModeration = require('../services/topicModeration');

// Check topic endpoint
router.post('/check-topic', async (req, res) => {
  const { topic } = req.body;
  
  if (!topic) {
    return res.json({ 
      isOffensive: false, 
      reason: 'No topic provided' 
    });
  }
  
  try {
    const result = await topicModeration.checkTopic(topic);
    res.json(result);
  } catch (error) {
    console.error('Topic check error:', error);
    res.status(500).json({ 
      isOffensive: false, 
      reason: 'Service unavailable'
    });
  }
});

module.exports = router;