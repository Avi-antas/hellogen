// ============================================
// COMPLETE AI MODERATION CLIENT
// Combines Audio (Whisper + ToxicBERT) + Hand Gesture (MediaPipe)
// ============================================

class CompleteAIModeration {
  constructor(socket, partnerId, remoteVideoElement) {
    this.socket = socket;
    this.partnerId = partnerId;
    this.videoElement = remoteVideoElement;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isActive = false;
    this.violationCount = 0;
  }

  // ============================================
  // PART 1: AUDIO MODERATION (Whisper + ToxicBERT)
  // ============================================
  async startAudioMonitoring() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        this.audioChunks = [];
        await this.analyzeAudioChunk(audioBlob);
      };
      
      this.mediaRecorder.start(4000); // Record 4-second chunks
      this.isActive = true;
      console.log('✅ Audio monitoring active');
      
    } catch (err) {
      console.error('Audio monitoring failed:', err);
    }
  }

  async analyzeAudioChunk(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    
    try {
      const response = await fetch(`${BACKEND_URL}/moderation/audio`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.isInappropriate && result.confidence > 0.6) {
        this.handleViolation({
          type: 'audio_slang',
          detected: result.detected,
          transcript: result.transcript,
          severity: result.severity,
          confidence: result.confidence
        });
      }
    } catch (err) {
      console.error('Analysis failed:', err);
    }
  }

  // ============================================
  // PART 2: HAND GESTURE MODERATION (MediaPipe)
  // ============================================
  async startGestureMonitoring() {
    if (!this.videoElement) {
      console.error('No video element for gesture detection');
      return;
    }
    
    // Load MediaPipe Hands
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
    script.onload = () => this.initMediaPipe();
    document.head.appendChild(script);
  }

  initMediaPipe() {
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    hands.onResults((results) => {
      this.onHandDetected(results);
    });
    
    // Process video frames
    const processVideo = async () => {
      if (this.videoElement && this.videoElement.readyState >= 2) {
        await hands.send({ image: this.videoElement });
      }
      requestAnimationFrame(processVideo);
    };
    
    processVideo();
    console.log('✅ Gesture monitoring active');
  }

  onHandDetected(results) {
    if (!results.multiHandLandmarks) return;
    
    for (const landmarks of results.multiHandLandmarks) {
      const gesture = this.classifyGesture(landmarks);
      
      if (gesture.isOffensive && gesture.confidence > 0.7) {
        this.handleViolation({
          type: 'offensive_gesture',
          gesture: gesture.name,
          severity: 4,
          confidence: gesture.confidence
        });
      }
    }
  }

  classifyGesture(landmarks) {
    // Get finger positions
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    
    const indexIP = landmarks[6];
    const middleIP = landmarks[10];
    const ringIP = landmarks[14];
    const pinkyIP = landmarks[18];
    
    // MIDDLE FINGER detection
    const isMiddleUp = middleTip.y < middleIP.y;
    const isIndexDown = indexTip.y > indexIP.y;
    const isRingDown = ringTip.y > ringIP.y;
    const isPinkyDown = pinkyTip.y > pinkyIP.y;
    
    if (isMiddleUp && isIndexDown && isRingDown && isPinkyDown) {
      return { isOffensive: true, name: 'middle_finger', confidence: 0.95 };
    }
    
    // FIST detection
    const allFingersDown = indexTip.y > indexIP.y &&
                          middleTip.y > middleIP.y &&
                          ringTip.y > ringIP.y &&
                          pinkyTip.y > pinkyIP.y;
    
    if (allFingersDown) {
      return { isOffensive: true, name: 'fist', confidence: 0.8 };
    }
    
    // POINTING FINGER detection
    const isPointing = indexTip.y < indexIP.y && middleTip.y > middleIP.y;
    
    if (isPointing) {
      return { isOffensive: true, name: 'pointing', confidence: 0.75 };
    }
    
    return { isOffensive: false, name: 'normal', confidence: 0 };
  }

  // ============================================
  // PART 3: VIOLATION HANDLER
  // ============================================
  handleViolation(violation) {
    console.log('🚨 VIOLATION DETECTED:', violation);
    
    this.violationCount++;
    
    // Progressive penalties
    let severity = violation.severity;
    let action = 'warn';
    
    if (severity >= 4 || this.violationCount >= 3) {
      action = 'end_call';
    } else if (severity >= 3 || this.violationCount >= 2) {
      action = 'red_flag';
    }
    
    // Send to backend
    this.socket.emit('moderation-violation', {
      to: this.partnerId,
      type: violation.type,
      details: violation,
      action: action,
      violationCount: this.violationCount
    });
    
    // Show local warning
    this.showWarning(violation, action);
  }

  showWarning(violation, action) {
    const warningDiv = document.createElement('div');
    warningDiv.className = 'moderation-warning';
    
    let message = '';
    let color = '';
    
    if (violation.type === 'audio_slang') {
      message = `⚠️ Inappropriate language detected: ${violation.detected[0]?.word || 'abusive words'}`;
      color = '#ffa502';
    } else if (violation.type === 'offensive_gesture') {
      message = `🚫 Offensive gesture detected: ${violation.gesture}`;
      color = '#ff4757';
    }
    
    if (action === 'end_call') {
      message = `❗ SEVIOLATION: ${message} Call will end`;
      color = '#ff0000';
    }
    
    warningDiv.style.cssText = `
      position: fixed;
      bottom: 180px;
      left: 50%;
      transform: translateX(-50%);
      background: ${color};
      color: white;
      padding: 10px 20px;
      border-radius: 25px;
      font-size: 14px;
      z-index: 1000;
      animation: slideUp 0.3s ease;
    `;
    warningDiv.textContent = message;
    document.body.appendChild(warningDiv);
    
    setTimeout(() => warningDiv.remove(), 3000);
  }

  // ============================================
  // START ALL MONITORING
  // ============================================
  async start() {
    await this.startAudioMonitoring();
    await this.startGestureMonitoring();
    console.log('🎯 Complete AI Moderation Active');
  }

  stop() {
    this.isActive = false;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }
}