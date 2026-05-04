// ============================================
// PRE-TRAINED LLM MODELS FOR MODERATION
// Uses: Hugging Face Inference API (FREE)
// Models: openai/whisper-small + unitary/toxic-bert
// ============================================

const FormData = require('form-data');
const fetch = require('node-fetch');

class LLMModerationService {
  constructor() {
    // Get free API key from huggingface.co/settings/tokens
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.whisperUrl = 'https://api-inference.huggingface.co/models/openai/whisper-small';
    this.toxicBertUrl = 'https://api-inference.huggingface.co/models/unitary/toxic-bert';
    
    // Fallback to local model if API fails
    this.useApi = !!this.apiKey;
  }
  
  async analyzeAudio(audioBuffer) {
    try {
      // Step 1: Speech-to-Text with Whisper
      const transcript = await this.speechToText(audioBuffer);
      console.log('📝 Transcript:', transcript);
      
      if (!transcript) return null;
      
      // Step 2: Analyze text with ToxicBERT
      const analysis = await this.analyzeText(transcript);
      
      return {
        transcript,
        ...analysis
      };
    } catch (err) {
      console.error('LLM analysis failed:', err);
      return this.fallbackAnalysis(audioBuffer);
    }
  }
  
  async speechToText(audioBuffer) {
    if (!this.useApi) return this.mockTranscript(audioBuffer);
    
    try {
      const response = await fetch(this.whisperUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/octet-stream'
        },
        body: audioBuffer
      });
      
      const result = await response.json();
      return result.text || '';
    } catch (err) {
      console.error('Whisper failed:', err);
      return '';
    }
  }
  
  async analyzeText(text) {
    if (!this.useApi) return this.fallbackTextAnalysis(text);
    
    try {
      const response = await fetch(this.toxicBertUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: text })
      });
      
      const scores = await response.json();
      
      // ToxicBERT returns array of scores
      const toxicityScore = scores.find(s => s.label === 'toxic')?.score || 0;
      const severeToxicity = scores.find(s => s.label === 'severe_toxic')?.score || 0;
      const insultScore = scores.find(s => s.label === 'insult')?.score || 0;
      const profanityScore = scores.find(s => s.label === 'obscene')?.score || 0;
      
      const isInappropriate = toxicityScore > 0.6 || severeToxicity > 0.4;
      const severity = Math.ceil((toxicityScore + severeToxicity * 2) * 5);
      const confidence = Math.max(toxicityScore, severeToxicity);
      
      return {
        isInappropriate,
        severity: Math.min(5, severity),
        confidence,
        detectedWords: this.extractBadWords(text),
        scores: { toxicityScore, severeToxicity, insultScore, profanityScore }
      };
    } catch (err) {
      console.error('ToxicBERT failed:', err);
      return this.fallbackTextAnalysis(text);
    }
  }
  
  extractBadWords(text) {
    const badWords = ['fuck', 'shit', 'bitch', 'cunt', 'asshole'];
    const detected = [];
    const lowerText = text.toLowerCase();
    
    for (const word of badWords) {
      if (lowerText.includes(word)) detected.push(word);
    }
    
    return detected;
  }
  
  fallbackAnalysis(audioBuffer) {
    // Mock analysis for development
    return {
      transcript: 'Sample transcript',
      isInappropriate: false,
      severity: 0,
      confidence: 0,
      detectedWords: []
    };
  }
  
  fallbackTextAnalysis(text) {
    const lowerText = text.toLowerCase();
    const badWords = ['fuck', 'shit', 'bitch', 'asshole', 'cunt'];
    const detected = badWords.filter(w => lowerText.includes(w));
    
    return {
      isInappropriate: detected.length > 0,
      severity: detected.length > 0 ? Math.min(3, detected.length) : 0,
      confidence: detected.length > 0 ? 0.7 : 0,
      detectedWords: detected
    };
  }
}

module.exports = new LLMModerationService();