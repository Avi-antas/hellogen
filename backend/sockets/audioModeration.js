const audioModeration = require('../services/audioModerationService');
const moderationService = require('../services/moderationService');

function handleAudioModeration(io, socket) {
  
  // Receive audio transcript from client (if using speech-to-text)
  socket.on('audio-transcript', async (data) => {
    const { transcript, to } = data;
    
    // Analyze the transcript for slangs
    const analysis = audioModeration.detectSlangs(transcript, socket.userId);
    
    if (analysis.hasSlang) {
      console.log(`🚫 Slang detected from ${socket.id}:`, analysis.detectedSlangs);
      
      // Send warning to the speaker
      socket.emit('slang-warning', {
        message: analysis.message,
        severity: analysis.severity,
        timestamp: Date.now()
      });
      
      // Send red flag notification to the partner (listener)
      if (analysis.shouldReport) {
        io.to(to).emit('partner-slang-detected', {
          severity: analysis.severity,
          detectedWords: analysis.detectedSlangs.map(s => s.word),
          timestamp: Date.now(),
          showRedFlag: true
        });
      }
      
      // Log violation
      if (analysis.severity >= 3) {
        await moderationService.logViolation(socket.userId, {
          type: 'audio_slang',
          reason: analysis.message,
          severity: analysis.severity,
          detectedWords: analysis.detectedSlangs,
          timestamp: Date.now()
        });
      }
    }
  });
  
  // Report from partner (red flag button)
  socket.on('report-partner-slang', async (data) => {
    const { reportedUserId, reason, severity } = data;
    
    console.log(`🚩 Partner reported slang from ${reportedUserId}`);
    
    // Handle report (existing moderation service)
    const result = await moderationService.handleRedFlag(
      socket.userId,
      reportedUserId,
      'verbal_abuse',
      socket.id,
      null
    );
    
    // Notify reporter
    socket.emit('report-submitted', {
      success: true,
      message: 'Report submitted. Thank you for keeping the community safe.'
    });
    
    // Notify reported user (if needed)
    if (result.action === 'suspended') {
      io.to(reportedUserId).emit('account-suspended', {
        message: result.message,
        duration: result.duration
      });
    }
  });
}

module.exports = { handleAudioModeration };