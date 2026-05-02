// Audio Moderation Service - Detects slangs from audio stream
class AudioModerationService {
  constructor() {
    // Comprehensive slang database
    this.slangDatabase = {
      // English slangs
      english: {
        severe: ['fuck', 'motherfucker', 'cunt', 'nigger', 'faggot'],
        moderate: ['shit', 'asshole', 'bitch', 'bastard', 'damn'],
        mild: ['crap', 'hell', 'stupid', 'idiot', 'dumb']
      },
      
      // Hindi/Urdu slangs (Indian context)
      hindi: {
        severe: ['madarchod', 'bhosdike', 'chutiya', 'gandu', 'bhenchod'],
        moderate: ['saala', 'kamine', 'harami', 'lodu', 'chodu'],
        mild: ['bevakoof', 'nalayak', 'pagal', 'ullu']
      },
      
      // Common abusive patterns
      patterns: [
        /you\s+(?:are\s+)?(?:a\s+)?(?:fucking|fukin|fakin)\s+(?:idiot|stupid|dumb)/gi,
        /(?:fuck|suck)\s+(?:you|off|it)/gi,
        /(?:kill|murder|death)\s+you/gi,
        /shut\s+(?:the\s+)?(?:fuck|hell|up)/gi,
        /(?:what|where|who)\s+the\s+(?:fuck|hell)/gi
      ]
    };
    
    // Speech recognition keywords (for real-time detection)
    this.keywords = this.buildKeywordSet();
  }
  
  buildKeywordSet() {
    const keywords = new Set();
    
    Object.values(this.slangDatabase.english).forEach(words => 
      words.forEach(w => keywords.add(w.toLowerCase()))
    );
    Object.values(this.slangDatabase.hindi).forEach(words => 
      words.forEach(w => keywords.add(w.toLowerCase()))
    );
    
    return keywords;
  }
  
  // Detect slangs from audio text (speech-to-text result)
  detectSlangs(transcript, userId) {
    const lowerText = transcript.toLowerCase();
    const detectedSlangs = [];
    let severity = 0;
    let categories = {
      abusive: false,
      threatening: false,
      harassment: false
    };
    
    // Check English slangs
    for (const [level, words] of Object.entries(this.slangDatabase.english)) {
      for (const word of words) {
        if (lowerText.includes(word)) {
          detectedSlangs.push({ word, language: 'english', severity: level });
          if (level === 'severe') severity += 3;
          else if (level === 'moderate') severity += 2;
          else severity += 1;
          categories.abusive = true;
        }
      }
    }
    
    // Check Hindi slangs
    for (const [level, words] of Object.entries(this.slangDatabase.hindi)) {
      for (const word of words) {
        if (lowerText.includes(word)) {
          detectedSlangs.push({ word, language: 'hindi', severity: level });
          if (level === 'severe') severity += 3;
          else if (level === 'moderate') severity += 2;
          else severity += 1;
          categories.abusive = true;
        }
      }
    }
    
    // Check patterns
    for (const pattern of this.slangDatabase.patterns) {
      if (pattern.test(transcript)) {
        detectedSlangs.push({ pattern: pattern.toString(), severity: 'high' });
        severity += 3;
        categories.threatening = true;
      }
    }
    
    // Normalize severity (1-5)
    severity = Math.min(5, Math.max(1, Math.ceil(severity / 2)));
    
    return {
      hasSlang: detectedSlangs.length > 0,
      detectedSlangs,
      severity,
      categories,
      shouldWarn: severity >= 2,
      shouldReport: severity >= 3,
      message: this.getWarningMessage(severity, detectedSlangs)
    };
  }
  
  getWarningMessage(severity, slangs) {
    if (severity >= 4) {
      return '⚠️ Severe policy violation detected. This has been reported.';
    } else if (severity >= 3) {
      return '🚫 Inappropriate language detected. Please maintain respectful communication.';
    } else if (severity >= 2) {
      return '⚠️ Please avoid using inappropriate language.';
    }
    return 'Please keep conversations respectful.';
  }
}

module.exports = new AudioModerationService();