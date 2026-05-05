// Comprehensive multi-language profanity database
class MultiLanguageProfanity {
  constructor() {
    this.badWords = new Set([
      // ========== ENGLISH ==========
      'fuck', 'shit', 'asshole', 'bitch', 'cunt', 'dick', 'pussy', 'cock', 
      'whore', 'slut', 'bastard', 'motherfucker', 'faggot', 'nigger', 
      'nigga', 'retard', 'moron', 'idiot', 'dumb', 'stupid', 'ass', 'damn',
      
      // ========== HINDI / URDU ==========
      'gand', 'gandu', 'chutiya', 'bhenchod', 'madarchod', 'bhosdike', 
      'lodu', 'randi', 'harami', 'kamine', 'saala', 'hijra', 'chakka',
      'bevakoof', 'nalayak', 'bhadva', 'chodu', 'lavde', 'bhencho',
      'bhosdi', 'gandu', 'maderchod', 'bsdk', 'mc', 'bc', 'teri maa',
      'maa ki', 'bahanchod', 'bahan ke', 'chut', 'chut marunga',
      
      // ========== BENGALI / BANGLA ==========
      'khanki', 'bokachoda', 'chodna', 'magi', 'magir pola', 'kuttar bachcha',
      'kutta', 'kukur', 'shaal', 'gud', 'putki', 'boka', 'chele', 'paka',
      'nati', 'kharap', 'baje', 'mosla', 'gaye', 'garda', 'khepa',
      
      // ========== OTHER REGIONAL ==========
      'pundai', 'thevdiya', 'chod', 'lauda', 'lund', 'chutad', 'bhosda',
      'ghatiya', 'nalayak', 'ullu ka patha', 'hijda', 'hijada',
      
      // ========== THREATENING ==========
      'kill', 'murder', 'death', 'suicide', 'hang', 'shoot', 'bomb',
      'attack', 'violence', 'blood', 'rape', 'abuse', 'hitler', 'nazi',
      'terrorist', 'beheading', 'slaughter', 'torture',
      
      // ========== SEXUAL ==========
      'sex', 'porn', 'xxx', 'nude', 'naked', 'erotic', 'fucking',
      'blowjob', 'handjob', 'orgasm', 'penis', 'vagina', 'boobs', 'tits',
      'breasts', 'nipple', 'anal', 'oral', 'cum', 'semen', 'masturbate'
    ]);

    // Patterns to catch variations (e.g., "g@nd", "chutiyaa")
    this.patterns = [
      /g[a@]nd/i,
      /ch[u@]tiya/i,
      /b[e3]hnch[o0]d/i,
      /m[a@]d[a@]rch[o0]d/i,
      /b[o0]sdk/i,
      /f[u@]ck/i,
      /s[h4]it/i,
      /b[i1]tch/i,
      /c[u@]nt/i,
      /d[i1]ck/i,
      /p[u@]ssy/i,
      /wh[o0]re/i,
      /sl[u@]t/i
    ];
  }

  containsProfanity(text) {
    if (!text) return false;
    
    const lowerText = text.toLowerCase().trim();
    
    // Check exact words (including regional slangs)
    for (const word of this.badWords) {
      if (lowerText.includes(word)) {
        console.log(`🚫 [Profanity] Found exact match: "${word}"`);
        return true;
      }
    }
    
    // Check patterns for obfuscated words
    for (const pattern of this.patterns) {
      if (pattern.test(lowerText)) {
        console.log(`🚫 [Profanity] Found pattern match: ${pattern}`);
        return true;
      }
    }
    
    return false;
  }

  getOffensiveWordsFound(text) {
    const found = [];
    const lowerText = text.toLowerCase().trim();
    
    for (const word of this.badWords) {
      if (lowerText.includes(word)) {
        found.push(word);
      }
    }
    
    return found;
  }
}

module.exports = new MultiLanguageProfanity();