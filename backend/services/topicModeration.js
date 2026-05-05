const multiLanguageProfanity = require('../utils/multiLanguageProfanity');

class TopicModeration {
  async checkTopic(topic) {
    console.log(`\n🔍 Checking topic: "${topic}"`);
    
    // Check for profanity
    const hasProfanity = multiLanguageProfanity.containsProfanity(topic);
    const offensiveWords = multiLanguageProfanity.getOffensiveWordsFound(topic);
    
    if (hasProfanity) {
      console.log(`🚫 BLOCKED - Contains: ${offensiveWords.join(', ')}`);
      return {
        isOffensive: true,
        reason: `Contains inappropriate language: ${offensiveWords[0]}`,
        detectedWords: offensiveWords
      };
    }
    
    console.log(`✅ ALLOWED - Clean topic`);
    return {
      isOffensive: false,
      reason: 'Clean topic'
    };
  }
}

module.exports = new TopicModeration();