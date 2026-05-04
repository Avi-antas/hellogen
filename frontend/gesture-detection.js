// ============================================
// PRE-TRAINED HAND GESTURE RECOGNITION
// Uses: MediaPipe Hands (Google's trained model)
// ============================================

class GestureDetection {
  constructor(socket, partnerId, videoElement) {
    this.socket = socket;
    this.partnerId = partnerId;
    this.videoElement = videoElement;
    this.detector = null;
  }
  
  async init() {
    // Load MediaPipe Hands (pre-trained by Google)
    const hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
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
      await hands.send({ image: this.videoElement });
      requestAnimationFrame(processVideo);
    };
    
    processVideo();
  }
  
  onHandDetected(results) {
    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        const gesture = this.classifyGesture(landmarks);
        
        if (gesture.isOffensive && gesture.confidence > 0.7) {
          this.socket.emit('gesture-violation', {
            to: this.partnerId,
            gesture: gesture.name,
            confidence: gesture.confidence
          });
        }
      }
    }
  }
  
  classifyGesture(landmarks) {
    // Get finger tips and IP joints
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    
    const indexIP = landmarks[6];
    const middleIP = landmarks[10];
    const ringIP = landmarks[14];
    const pinkyIP = landmarks[18];
    
    // Middle finger detection (classic offensive gesture)
    const isMiddleUp = middleTip.y < middleIP.y;
    const isIndexDown = indexTip.y > indexIP.y;
    const isRingDown = ringTip.y > ringIP.y;
    const isPinkyDown = pinkyTip.y > pinkyIP.y;
    
    if (isMiddleUp && isIndexDown && isRingDown && isPinkyDown) {
      return { isOffensive: true, name: 'middle_finger', confidence: 0.95 };
    }
    
    // OK sign detection (can be offensive in some cultures)
    const thumbAndIndexCircle = this.distance(thumbTip, indexTip) < 0.05;
    const otherFingersUp = middleTip.y < middleIP.y && ringTip.y < ringIP.y;
    
    if (thumbAndIndexCircle && otherFingersUp) {
      return { isOffensive: true, name: 'ok_sign', confidence: 0.85 };
    }
    
    // Fist shake
    const allFingersDown = indexTip.y > indexIP.y &&
                          middleTip.y > middleIP.y &&
                          ringTip.y > ringIP.y &&
                          pinkyTip.y > pinkyIP.y;
    
    if (allFingersDown) {
      return { isOffensive: true, name: 'fist', confidence: 0.75 };
    }
    
    return { isOffensive: false, name: 'normal', confidence: 0 };
  }
  
  distance(point1, point2) {
    return Math.hypot(point1.x - point2.x, point1.y - point2.y);
  }
}