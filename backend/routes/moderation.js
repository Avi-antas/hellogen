const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const aiModeration = require('../services/aiModerationService');

// Moderate audio endpoint (called from frontend)
router.post('/audio', upload.single('audio'), async (req, res) => {
  try {
    const audioBuffer = req.file.buffer;
    const result = await aiModeration.analyzeAudio(audioBuffer);
    
    res.json(result);
  } catch (err) {
    console.error('Moderation error:', err);
    res.status(500).json({ error: 'Moderation failed' });
  }
});

// Moderate text endpoint
router.post('/text', async (req, res) => {
  const { text } = req.body;
  const result = await aiModeration.detectToxicity(text);
  res.json(result);
});

module.exports = router;