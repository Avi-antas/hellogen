class AIDetectionService {
  constructor() {
    // Bad words database (expandable)
    this.badWords = [
      'fuck', 'shit', 'asshole', 'bitch', 'cunt', 'nigger', 'faggot',
      // Add more in production - use a proper library
    ];
    
    this.slangViolations = [
      'kill yourself', 'die', 'murder', 'rape', 'weapon'
    ];
    
    this.abusePatterns = [
      /you\s+(?:are\s+)?(?:a\s+)?(?:fucking|stupid|dumb|idiot)/i,
      /(?:fuck|suck)\s+(?:you|off)/i
    ];
  }
  
  analyzeText(text) {
    const lowerText = text.toLowerCase();
    
    const badWordFound = this.badWords.some(word => lowerText.includes(word));
    const slangFound = this.slangViolations.some(phrase => lowerText.includes(phrase));
    const patternMatch = this.abusePatterns.some(pattern => pattern.test(text));
    
    const severity = this.calculateSeverity(badWordFound, slangFound, patternMatch);
    
    return {
      isInappropriate: badWordFound || slangFound || patternMatch,
      hasAbusiveLanguage: badWordFound,
      hasSlangViolations: slangFound,
      severity: severity,
      confidenceScore: severity * 20 // 0-100
    };
  }
  
  calculateSeverity(hasBadWords, hasSlang, hasPatterns) {
    let severity = 0;
    if (hasBadWords) severity += 2;
    if (hasSlang) severity += 3;
    if (hasPatterns) severity += 1;
    return Math.min(severity, 5);
  }
  
  // For future: image/video nudity detection using ML
  analyzeVideoFrame(frameData) {
    // Would integrate with TensorFlow.js or cloud vision API
    return { hasNudity: false, confidenceScore: 0 };
  }
}

module.exports = new AIDetectionService();