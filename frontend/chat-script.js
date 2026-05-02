// ============================================
// PRODUCTION CHAT SCRIPT WITH MODERATION
// ============================================

const BACKEND_URL = (window.location.hostname === 'localhost')
  ? 'http://localhost:5000'
  : 'https://your-backend.onrender.com';

// Get token and user info
const token = localStorage.getItem('token');
const isGuest = localStorage.getItem('isGuest') === 'true';
const selectedTopic = localStorage.getItem('selectedTopic');

// Global variables
let localStream = null;
let peer = null;
let partnerId = null;
let mySocketId = null;
let isConnected = false;
let isMatched = false;
let socket = null;
let audioMuted = false;
let mediaRecorder = null;
let audioContext = null;
let analyticsInterval = null;
let sessionStartTime = Date.now();
let guestTimerInterval = null;

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  // Check if rules were accepted
  if (!localStorage.getItem('rulesAccepted')) {
    window.location.href = './rules.html';
    return;
  }
  
  // Check guest time
  if (isGuest) {
    await checkGuestTime();
    startGuestTimer();
    document.getElementById('timer').classList.remove('hidden');
  }
  
  // Initialize socket
  initSocket();
  
  // Start camera
  await startCamera();
  
  // Join queue with selected topic
  socket.emit("joinQueue", { 
    interests: [selectedTopic],
    userId: localStorage.getItem('userId') || null,
    isGuest: isGuest
  });
  
  updateStatus(`Looking for ${selectedTopic} partners...`);
  updateStatus(`Looking for ${selectedTopic} partners...`);
  showLoading('Finding your match...');
}

// ============================================
// SOCKET SETUP
// ============================================
function initSocket() {
  socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    auth: { token: token },
    reconnection: true
  });
  
  socket.on('connect', () => {
    mySocketId = socket.id;
    isConnected = true;
    console.log('✅ Connected to backend');
  });
  
  socket.on('matched', async (id) => {
    partnerId = id;
    isMatched = true;
    updateStatus('🎉 Matched! Connecting...');
    hideLoading();
    
    document.getElementById('localVideoWrapper').classList.remove('local-fullscreen');
    document.getElementById('localVideoWrapper').classList.add('local-video');
    document.getElementById('partnerVideoWrapper').classList.remove('partner-hidden');
    document.getElementById('controls').style.display = 'flex';
    document.getElementById('reportBtn').style.display = 'block';
    
    const isInitiator = mySocketId < partnerId;
    createPeer(isInitiator);
  });
  
  socket.on('offer', async (data) => {
    partnerId = data.from;
    isMatched = true;
    updateStatus('📞 Connecting...');
    hideLoading();
    
    document.getElementById('localVideoWrapper').classList.remove('local-fullscreen');
    document.getElementById('localVideoWrapper').classList.add('local-video');
    document.getElementById('partnerVideoWrapper').classList.remove('partner-hidden');
    document.getElementById('controls').style.display = 'flex';
    document.getElementById('reportBtn').style.display = 'block';
    
    createPeer(false);
    
    try {
      await peer.setRemoteDescription(data.offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("answer", { to: partnerId, answer });
    } catch (err) {
      console.error('Offer error:', err);
    }
  });
  
  socket.on('answer', async (data) => {
    if (peer) {
      await peer.setRemoteDescription(data.answer);
    }
  });
  
  socket.on('ice-candidate', async (data) => {
    if (peer) {
      await peer.addIceCandidate(data.candidate);
    }
  });
  
  socket.on('partner-disconnected', () => {
    updateStatus('💔 Partner disconnected');
    cleanup();
    resetToWaiting();
  });
  
  socket.on('partner-left-waiting', () => {
    updateStatus('👋 Partner left. Waiting for new partner...');
    cleanup();
    resetToWaiting();
  });
  
  // AI Moderation Events
  socket.on('ai-warning', (data) => {
    console.log('AI Warning:', data);
    showAIWarning(data.message, data.severity);
  });
  
  socket.on('session-ended', (data) => {
    updateStatus(data.message);
    setTimeout(() => {
      if (data.redirect) {
        window.location.href = '/';
      }
    }, 3000);
  });
}

// ============================================
// CAMERA & PEER CONNECTION
// ============================================
async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    
    document.getElementById('localVideo').srcObject = localStream;
    
    // Start AI audio analysis
    startAudioAnalysis();
    
  } catch (err) {
    console.error('Camera error:', err);
    alert('Camera/Microphone access required');
    window.location.href = './topics.html';
  }
}

function createPeer(isInitiator) {
  if (peer) {
    peer.close();
    peer = null;
  }
  
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
  };
  
  peer = new RTCPeerConnection(configuration);
  
  peer.oniceconnectionstatechange = () => {
    if (peer.iceConnectionState === 'connected') {
      updateStatus('🎬 Connected!');
      hideLoading();
    }
  };
  
  peer.onicecandidate = (event) => {
    if (event.candidate && partnerId) {
      socket.emit("ice-candidate", {
        to: partnerId,
        candidate: event.candidate
      });
    }
  };
  
  peer.ontrack = (event) => {
    document.getElementById("remoteVideo").srcObject = event.streams[0];
  };
  
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });
  }
  
  if (isInitiator) {
    peer.createOffer()
      .then(offer => peer.setLocalDescription(offer))
      .then(() => {
        socket.emit("offer", { to: partnerId, offer: peer.localDescription });
      })
      .catch(err => console.error("Offer error:", err));
  }
}

// ============================================
// AI AUDIO ANALYSIS (Client-side)
// ============================================
function startAudioAnalysis() {
  if (!localStream) return;
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;
  
  // Create AudioContext for analysis
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(localStream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  
  // Analyze audio every 2 seconds
  setInterval(() => {
    if (!isMatched) return;
    
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    
    // Detect speech volume spikes (potential yelling/aggression)
    if (average > 200) {
      // Could indicate shouting/aggression
      console.log('High volume detected:', average);
    }
  }, 2000);
  
  // For actual speech-to-text, you'd need a WebSocket to a speech recognition service
  // This is a simplified version
}

// ============================================
// REPORT SYSTEM
// ============================================
function showReportModal() {
  if (!partnerId) {
    alert('No active partner to report');
    return;
  }
  document.getElementById('reportModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('reportModal').classList.add('hidden');
}

async function submitReport() {
  const reason = document.getElementById('reportReason').value;
  
  try {
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        reportedUserId: partnerId,
        reason: reason,
        chatSessionId: socket.id
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Report submitted. Thank you for keeping our community safe.');
      closeModal();
      
      if (data.action === 'banned' || data.action === 'suspended') {
        updateStatus(data.message);
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      } else {
        // End current chat
        socket.emit("next");
      }
    } else {
      alert('Failed to submit report: ' + data.message);
    }
  } catch (err) {
    console.error('Report error:', err);
    alert('Failed to submit report');
  }
}

function showAIWarning(message, severity) {
  const modal = document.getElementById('aiWarningModal');
  const content = document.getElementById('aiWarningContent');
  const messageEl = document.getElementById('aiWarningMessage');
  
  messageEl.textContent = message;
  
  if (severity >= 4) {
    content.classList.add('danger');
    content.classList.remove('warning');
  } else {
    content.classList.add('warning');
    content.classList.remove('danger');
  }
  
  modal.classList.remove('hidden');
  
  // Auto-close after 5 seconds
  setTimeout(() => {
    closeAIModal();
  }, 5000);
}

function closeAIModal() {
  document.getElementById('aiWarningModal').classList.add('hidden');
}

// ============================================
// GUEST TIMER
// ============================================
async function checkGuestTime() {
  try {
    const response = await fetch('/api/auth/guest-time', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    
    if (data.expired) {
      alert('Your 10-minute guest session has expired. Please sign up to continue!');
      window.location.href = '/';
      return false;
    }
    
    return data.remainingMinutes;
  } catch (err) {
    console.error('Guest time check error:', err);
    return 10;
  }
}

function startGuestTimer() {
  let timeLeft = 600; // 10 minutes in seconds
  
  guestTimerInterval = setInterval(async () => {
    timeLeft--;
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    const timerEl = document.getElementById('timer');
    timerEl.textContent = `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (timeLeft <= 60) {
      timerEl.classList.add('warning');
    }
    
    if (timeLeft <= 0) {
      clearInterval(guestTimerInterval);
      alert('Guest session expired. Please sign up to continue using Hellogen!');
      window.location.href = '/';
    }
  }, 1000);
}

// ============================================
// UI CONTROLS
// ============================================
function updateStatus(message) {
  const statusDiv = document.getElementById('statusIndicator');
  statusDiv.textContent = message;
  setTimeout(() => {
    if (statusDiv.textContent === message) {
      statusDiv.style.opacity = '0.7';
    }
  }, 3000);
  statusDiv.style.opacity = '1';
}

function showLoading(text) {
  // Implement loading overlay if needed
  updateStatus(text);
}

function hideLoading() {
  // Hide loading
}

function toggleAudio() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const btn = document.getElementById('muteBtn');
      btn.textContent = audioTrack.enabled ? '🎤' : '🔇';
      btn.classList.toggle('muted', !audioTrack.enabled);
    }
  }
}

function nextUser() {
  if (confirm('Find a new partner?')) {
    socket.emit("next");
    cleanup();
    resetToWaiting();
  }
}

function endCall() {
  if (confirm('End video call?')) {
    socket.emit("next");
    cleanup();
    window.location.href = './topics.html';
  }
}

function cleanup() {
  if (peer) {
    peer.close();
    peer = null;
  }
  partnerId = null;
  isMatched = false;
}

function resetToWaiting() {
  document.getElementById('partnerVideoWrapper').classList.add('partner-hidden');
  document.getElementById('localVideoWrapper').classList.add('local-fullscreen');
  document.getElementById('localVideoWrapper').classList.remove('local-video');
  document.getElementById('remoteVideo').srcObject = null;
  document.getElementById('controls').style.display = 'none';
  document.getElementById('reportBtn').style.display = 'none';
  
  // Rejoin queue
  setTimeout(() => {
    socket.emit("joinQueue", { 
      interests: [selectedTopic],
      userId: localStorage.getItem('userId') || null,
      isGuest: isGuest
    });
  }, 1000);
}

// ============================================
// START APPLICATION
// ============================================
init();