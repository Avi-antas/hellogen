// Audio Moderation Client
class AudioModerationClient {
  constructor(socket, partnerId) {
    this.socket = socket;
    this.partnerId = partnerId;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.recognition = null;
    this.showingRedFlag = false;
    
    this.initSpeechRecognition();
    this.initRedFlagUI();
    this.setupSocketEvents();
  }
  
  // Initialize Web Speech API for real-time transcription
  initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.log('Speech recognition not supported');
      return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN'; // English + Hindi support
    
    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (finalTranscript) {
        console.log('Detected speech:', finalTranscript);
        this.analyzeAudioText(finalTranscript);
      }
    };
    
    this.recognition.onerror = (event) => {
      console.log('Speech recognition error:', event.error);
    };
  }
  
  startMonitoring() {
    if (this.recognition) {
      this.recognition.start();
      console.log('Audio monitoring started');
    }
  }
  
  stopMonitoring() {
    if (this.recognition) {
      this.recognition.stop();
      console.log('Audio monitoring stopped');
    }
  }
  
  analyzeAudioText(transcript) {
    // Send to backend for slang detection
    this.socket.emit('audio-transcript', {
      transcript: transcript,
      to: this.partnerId
    });
  }
  
  initRedFlagUI() {
    // Create red flag button (initially hidden)
    const redFlagBtn = document.createElement('button');
    redFlagBtn.id = 'redFlagBtn';
    redFlagBtn.className = 'red-flag-btn hidden';
    redFlagBtn.innerHTML = '🚩 Report Partner';
    redFlagBtn.onclick = () => this.reportPartner();
    document.body.appendChild(redFlagBtn);
    
    // Add CSS
    const style = document.createElement('style');
    style.textContent = `
      .red-flag-btn {
        position: fixed;
        bottom: 120px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: #ff0000;
        color: white;
        border: none;
        cursor: pointer;
        font-size: 24px;
        z-index: 15;
        box-shadow: 0 0 20px rgba(255,0,0,0.5);
        animation: pulse 2s infinite;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .red-flag-btn.visible {
        display: flex;
      }
      
      .red-flag-btn:hover {
        transform: scale(1.1);
      }
      
      .slang-toast {
        position: fixed;
        bottom: 200px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.9);
        backdrop-filter: blur(10px);
        padding: 12px 20px;
        border-radius: 10px;
        color: white;
        font-size: 14px;
        z-index: 20;
        animation: slideUp 0.3s ease;
        border-left: 4px solid #ff4757;
      }
      
      .slang-toast.warning {
        border-left-color: #ffa502;
      }
      
      .slang-toast.severe {
        border-left-color: #ff4757;
        background: rgba(255,71,87,0.2);
      }
      
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translate(-50%, 20px);
        }
        to {
          opacity: 1;
          transform: translate(-50%, 0);
        }
      }
      
      @keyframes pulse {
        0% {
          transform: scale(1);
          box-shadow: 0 0 0 0 rgba(255,0,0,0.7);
        }
        70% {
          transform: scale(1.1);
          box-shadow: 0 0 0 10px rgba(255,0,0,0);
        }
        100% {
          transform: scale(1);
          box-shadow: 0 0 0 0 rgba(255,0,0,0);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  showRedFlag() {
    const btn = document.getElementById('redFlagBtn');
    btn.classList.add('visible');
    this.showingRedFlag = true;
    
    // Auto-hide after 10 seconds if not clicked
    setTimeout(() => {
      if (this.showingRedFlag && !btn.clicked) {
        btn.classList.remove('visible');
      }
    }, 10000);
  }
  
  hideRedFlag() {
    const btn = document.getElementById('redFlagBtn');
    btn.classList.remove('visible');
    this.showingRedFlag = false;
  }
  
  showToast(message, type = 'warning') {
    const toast = document.createElement('div');
    toast.className = `slang-toast ${type}`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }
  
  reportPartner() {
    if (!this.partnerId) return;
    
    if (confirm('Report this user for inappropriate language?')) {
      this.socket.emit('report-partner-slang', {
        reportedUserId: this.partnerId,
        reason: 'verbal_abuse',
        severity: 'high'
      });
      
      this.showToast('✅ Report submitted. Thank you for keeping the community safe.', 'success');
      this.hideRedFlag();
    }
  }
  
  setupSocketEvents() {
    this.socket.on('slang-warning', (data) => {
      // Show warning to the speaker
      this.showToast(data.message, data.severity >= 4 ? 'severe' : 'warning');
    });
    
    this.socket.on('partner-slang-detected', (data) => {
      // Show red flag button to partner
      if (data.showRedFlag) {
        this.showRedFlag();
        this.showToast('⚠️ Inappropriate language detected. Click the red flag to report.', 'severe');
      }
    });
    
    this.socket.on('report-submitted', (data) => {
      this.showToast(data.message, 'success');
    });
    
    this.socket.on('account-suspended', (data) => {
      this.showToast(data.message, 'severe');
      setTimeout(() => {
        window.location.href = 'frontend/index.html';
      }, 3000);
    });
  }
}

// Initialize when matched
let audioModeration = null;

// In your chat.html socket.on('matched') event:
socket.on('matched', (id) => {
  partnerId = id;
  // Existing code...
  
  // Initialize audio moderation
  if (audioModeration) {
    audioModeration.stopMonitoring();
  }
  audioModeration = new AudioModerationClient(socket, partnerId);
  audioModeration.startMonitoring();
});

// Clean up on disconnect
socket.on('partner-disconnected', () => {
  if (audioModeration) {
    audioModeration.stopMonitoring();
  }
});