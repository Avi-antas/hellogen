const FormData = require('form-data');
const fetch = require('node-fetch');

class AIModerationService {
  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.whisperUrl = 'https://api-inference.huggingface.co/models/openai/whisper-small';
    this.toxicUrl = 'https://api-inference.huggingface.co/models/unitary/toxic-bert';
    this.isAvailable = !!this.apiKey;
  }

  // Step 1: Speech-to-Text using Whisper
  async transcribeAudio(audioBuffer) {
    if (!this.isAvailable) return this.mockTranscribe();
    
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

  // Step 2: Toxicity Detection using ToxicBERT
  async detectToxicity(text) {
    if (!this.isAvailable || !text) return this.mockToxicity(text);
    
    try {
      const response = await fetch(this.toxicUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: text })
      });
      
      const scores = await response.json();
      
      const toxicity = scores.find(s => s.label === 'toxic')?.score || 0;
      const severeToxicity = scores.find(s => s.label === 'severe_toxic')?.score || 0;
      const insult = scores.find(s => s.label === 'insult')?.score || 0;
      const obscene = scores.find(s => s.label === 'obscene')?.score || 0;
      const threat = scores.find(s => s.label === 'threat')?.score || 0;
      
      const isInappropriate = toxicity > 0.6 || severeToxicity > 0.4 || threat > 0.5;
      const severity = Math.ceil((toxicity + severeToxicity * 2) * 5);
      
      return {
        isInappropriate,
        severity: Math.min(5, severity),
        confidence: Math.max(toxicity, severeToxicity, threat),
        scores: { toxicity, severeToxicity, insult, obscene, threat },
        detected: this.extractBadWords(text, scores)
      };
    } catch (err) {
      console.error('ToxicBERT failed:', err);
      return this.mockToxicity(text);
    }
  }

  extractBadWords(text, scores) {
    const severeWords = ['fuck', 'motherfucker', 'cunt', 'nigger', 'bhenchod', 'madarchod'];
    const moderateWords = ['shit', 'bitch', 'asshole', 'chutiya', 'gandu'];
    const detected = [];
    
    const lowerText = text.toLowerCase();
    
    for (const word of severeWords) {
      if (lowerText.includes(word)) detected.push({ word, severity: 'severe' });
    }
    for (const word of moderateWords) {
      if (lowerText.includes(word)) detected.push({ word, severity: 'moderate' });
    }
    
    return detected;
  }

  // Step 3: Complete audio analysis pipeline
  async analyzeAudio(audioBuffer) {
    // Step 1: Transcribe
    const transcript = await this.transcribeAudio(audioBuffer);
    
    if (!transcript) {
      return { isInappropriate: false, severity: 0, transcript: '' };
    }
    
    // Step 2: Analyze toxicity
    const toxicity = await this.detectToxicity(transcript);
    
    return {
      ...toxicity,
      transcript,
      timestamp: Date.now()
    };
  }

  // Fallback methods for testing without API
  mockTranscribe() {
    return 'sample speech';
  }

  mockToxicity(text) {
    const lowerText = text.toLowerCase();
    const badWords = ['fuck', 'shit', 'bitch', 'asshole'];
    const found = badWords.filter(w => lowerText.includes(w));
    
    return {
      isInappropriate: found.length > 0,
      severity: found.length > 0 ? Math.min(3, found.length) : 0,
      confidence: found.length > 0 ? 0.7 : 0,
      detected: found.map(w => ({ word: w, severity: 'moderate' }))
    };
  }
}

module.exports = new AIModerationService();