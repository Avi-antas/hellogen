// ============================================
// CONFIGURATION
// ============================================
const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000'
  : 'https://hellogen.onrender.com'; // Replace with your Render URL

// Interest database for matching
const INTEREST_DATABASE = {
  'gaming': ['fortnite', 'pubg', 'valorant', 'gta', 'minecraft', 'roblox'],
  'coding': ['javascript', 'python', 'java', 'react', 'node', 'webdev'],
  'music': ['rap', 'hiphop', 'rock', 'jazz', 'classical', 'pop'],
  'sports': ['cricket', 'football', 'basketball', 'tennis', 'baseball'],
  'movies': ['hollywood', 'bollywood', 'netflix', 'marvel', 'dc'],
  'cricket': ['ipl', 'worldcup', 't20', 'odi', 'test'],
  'football': ['premier league', 'champions league', 'world cup'],
  'tech': ['ai', 'ml', 'blockchain', 'web3', 'startup']
};

// Global variables
let localStream = null;
let peer = null;
let partnerId = null;
let mySocketId = null;
let isConnected = false;
let sessionStartTime = null;
let currentInterest = null;
let isMatched = false;
let skipCount = 0;
let partnerStartTime = null;
let analyticsInterval = null;
let isLoading = false;
let socket = null;

// Session analytics
let sessionAnalytics = {
  totalTime: 0,
  partnerTime: 0,
  skips: 0,
  skippedBy: 0,
  interestMatch: 0
};

// ============================================
// SOCKET CONNECTION
// ============================================
function initSocket() {
  socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
    withCredentials: true
  });

  socket.on('connect', () => {
    mySocketId = socket.id;
    isConnected = true;
    console.log('✅ Connected to backend:', BACKEND_URL);
    updateStatus('Connected! Select your interest');
    hideLoading();
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    updateStatus('⚠️ Connection error. Please refresh.');
    hideLoading();
  });

  socket.on('matched', async (id) => {
    partnerId = id;
    isMatched = true;
    partnerStartTime = Date.now();
    
    const isInitiator = mySocketId < partnerId;
    console.log(`🎯 Matched with ${partnerId}`);
    updateStatus('🎉 Connected! Video call active');
    hideLoading();
    
    // Switch video layout
    document.getElementById('localVideoWrapper').classList.remove('local-fullscreen', 'hidden');
    document.getElementById('localVideoWrapper').classList.add('local-video');
    document.getElementById('partnerVideoWrapper').classList.remove('partner-hidden');
    document.getElementById('controls').classList.remove('hidden');
    
    createPeer(isInitiator);
  });

  socket.on('offer', async (data) => {
    partnerId = data.from;
    isMatched = true;
    partnerStartTime = Date.now();
    
    console.log("📥 Received offer");
    updateStatus('📞 Connecting...');
    hideLoading();
    
    document.getElementById('localVideoWrapper').classList.remove('local-fullscreen', 'hidden');
    document.getElementById('localVideoWrapper').classList.add('local-video');
    document.getElementById('partnerVideoWrapper').classList.remove('partner-hidden');
    document.getElementById('controls').classList.remove('hidden');
    
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
      console.log('✅ Answer received');
    }
  });

  socket.on('ice-candidate', async (data) => {
    if (peer) {
      await peer.addIceCandidate(data.candidate);
      console.log('❄️ ICE candidate added');
    }
  });

 socket.on('partner-disconnected', () => {
  console.log('Partner disconnected - call completely ended');
  updateStatus('💔 Partner disconnected. Click Start to find new partner');
  endSessionAnalytics();
  
  // Only reset if we're not in alone mode
  if (!isMatched) {
    resetCall();
  } else {
    // Just clear remote video but keep local
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) remoteVideo.srcObject = null;
    
    const partnerWrapper = document.getElementById('partnerVideoWrapper');
    if (partnerWrapper) partnerWrapper.classList.add('partner-hidden');
    
    const localWrapper = document.getElementById('localVideoWrapper');
    if (localWrapper) {
      localWrapper.classList.add('local-fullscreen');
      localWrapper.classList.remove('local-video');
    }
  }
});

// UPDATE your partner-left-waiting handler:
socket.on('partner-left-waiting', () => {
  console.log('Partner left gracefully - waiting for new partner (ALONE MODE)');
  updateStatus('👋 Partner left. Finding someone new...');
  
  // Reset partner connection but keep local video
  if (peer) {
    peer.close();
    peer = null;
  }
  isMatched = false;
  partnerId = null;
  
  // Clear remote video
  const remoteVideo = document.getElementById('remoteVideo');
  if (remoteVideo) remoteVideo.srcObject = null;
  
  // Hide partner video wrapper
  const partnerWrapper = document.getElementById('partnerVideoWrapper');
  if (partnerWrapper) partnerWrapper.classList.add('partner-hidden');
  
  // Show local video fullscreen (alone mode)
  const localWrapper = document.getElementById('localVideoWrapper');
  if (localWrapper) {
    localWrapper.classList.remove('hidden');
    localWrapper.classList.add('local-fullscreen');
    localWrapper.classList.remove('local-video');
  }
  
  // Show controls still visible
  const controls = document.getElementById('controls');
  if (controls) controls.classList.remove('hidden');
  
  // Show loading while searching for new partner
  showLoading('Searching for new partner...');
  
  // End session analytics but keep call active
  endSessionAnalytics();
  
  // Automatically rejoin queue
  setTimeout(() => {
    if (currentInterest && socket.connected) {
      console.log('Auto-rejoining queue after partner left');
      socket.emit("joinQueue", { 
        interests: [currentInterest],
        userId: localStorage.getItem('userId') || null
      });
    }
  }, 500);
});

// UPDATE your rejoin-queue handler:
socket.on('rejoin-queue', () => {
  console.log('Rejoining queue automatically');
  updateStatus('Looking for new partner...');
  
  // Clear any existing loading
  hideLoading();
  showLoading('Finding new partner...');
  
  // Rejoin with same interest
  if (currentInterest) {
    socket.emit("joinQueue", { 
      interests: [currentInterest],
      userId: localStorage.getItem('userId') || null
    });
  }
});
// Waiting status updates
socket.on('waiting-status', (data) => {
  console.log(`Queue length: ${data.queueLength}`);
  if (data.queueLength > 0) {
    updateStatus(`Waiting... ${data.queueLength} people online`);
  }
});

  socket.on('match-quality', (score) => {
  console.log(`Match quality: ${score}%`);
  updateStatus(`✨ ${score}% interest match!`);
  
  // Optional: Show match quality badge
  showMatchQualityBadge(score);
});
}



// ============================================
// UI CONTROLS
// ============================================
function updateStatus(message) {
  const statusDiv = document.getElementById('statusIndicator');
  statusDiv.textContent = message;
  statusDiv.style.opacity = '1';
  setTimeout(() => {
    if (statusDiv.textContent === message) {
      statusDiv.style.opacity = '0.7';
    }
  }, 3000);
}

function showLoading(text = 'Finding your perfect match...') {
  isLoading = true;
  const overlay = document.getElementById('loadingOverlay');
  const textEl = document.getElementById('loadingText');
  textEl.textContent = text;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  isLoading = false;
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('hidden');
}

// ============================================
// CANCEL LOADING - FIXED VERSION
// ============================================
function cancelLoading() {
  console.log('Cancel button clicked - resetting to modal');
  
  // Hide loading overlay
  hideLoading();
  
  // Stop any ongoing matching process
  if (socket && socket.connected) {
    socket.emit("next"); // Leave the queue
  }
  
  // Stop and cleanup local stream
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.stop();
      console.log('Stopped track:', track.kind);
    });
    localStream = null;
  }
  
  // Reset all video elements
  const localVideo = document.getElementById('localVideo');
  if (localVideo) {
    localVideo.srcObject = null;
  }
  
  const remoteVideo = document.getElementById('remoteVideo');
  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
  
  // Reset UI states
  isMatched = false;
  partnerId = null;
  isConnected = true; // Keep socket connection
  isLoading = false;
  
  // Reset video wrappers to default state
  const localWrapper = document.getElementById('localVideoWrapper');
  const partnerWrapper = document.getElementById('partnerVideoWrapper');
  const controls = document.getElementById('controls');
  
  if (localWrapper) {
    localWrapper.classList.remove('local-video', 'local-fullscreen');
    localWrapper.classList.add('hidden');
  }
  
  if (partnerWrapper) {
    partnerWrapper.classList.add('partner-hidden');
  }
  
  if (controls) {
    controls.classList.add('hidden');
  }
  
  // Reset analytics
  sessionStartTime = null;
  partnerStartTime = null;
  skipCount = 0;
  sessionAnalytics = {
    totalTime: 0,
    partnerTime: 0,
    skips: 0,
    skippedBy: 0,
    interestMatch: 0
  };
  
  // Clear analytics interval
  if (analyticsInterval) {
    clearInterval(analyticsInterval);
    analyticsInterval = null;
  }
  
  // Close peer connection if exists
  if (peer) {
    peer.close();
    peer = null;
  }
  
  // IMPORTANT: Show the interest modal again
  const modal = document.getElementById('interestModal');
  if (modal) {
    modal.classList.remove('hidden');
    console.log('Modal shown again');
  }
  
  // Clear input field
  const interestInput = document.getElementById('interestInput');
  if (interestInput) {
    interestInput.value = '';
  }
  
  // Reset status message
  updateStatus('Choose your interest to start');
  
  console.log('Cancel complete - ready for new session');
}

function resetCall() {
  console.log('Resetting call - showing modal');
  
  // Clean up peer connection
  if (peer) {
    peer.close();
    peer = null;
  }
  
  // Reset UI
  partnerId = null;
  isMatched = false;
  partnerStartTime = null;
  
  // Hide partner video, show local fullscreen
  const partnerWrapper = document.getElementById('partnerVideoWrapper');
  const localWrapper = document.getElementById('localVideoWrapper');
  const controls = document.getElementById('controls');
  
  if (partnerWrapper) partnerWrapper.classList.add('partner-hidden');
  if (localWrapper) {
    localWrapper.classList.add('local-fullscreen');
    localWrapper.classList.remove('local-video');
  }
  if (controls) controls.classList.add('hidden');
  
  // Clear remote video
  const remoteVideo = document.getElementById('remoteVideo');
  if (remoteVideo) remoteVideo.srcObject = null;
  
  // Show interest modal again
  const modal = document.getElementById('interestModal');
  if (modal) modal.classList.remove('hidden');
  
  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  // Clear local video
  const localVideo = document.getElementById('localVideo');
  if (localVideo) localVideo.srcObject = null;
  
  // Hide local wrapper
  if (localWrapper) localWrapper.classList.add('hidden');
  
  // Clear analytics interval
  if (analyticsInterval) {
    clearInterval(analyticsInterval);
    analyticsInterval = null;
  }
  
  sessionStartTime = null;
  skipCount = 0;
  sessionAnalytics = {
    totalTime: 0,
    partnerTime: 0,
    skips: 0,
    skippedBy: 0,
    interestMatch: 0
  };
  
  updateStatus('Choose your interest to start');
}

// ============================================
// VIDEO CHAT FUNCTIONS
// ============================================
async function startWithInterest() {
  const interest = document.getElementById('interestInput').value.trim().toLowerCase();
  if (!interest) {
    alert('Please select or enter an interest');
    return;
  }
  
  currentInterest = interest;
  
  // Close modal
  document.getElementById('interestModal').classList.add('hidden');
  
  // Show loading
  showLoading('Starting camera...');
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    
    document.getElementById('localVideo').srcObject = localStream;
    
    // Show local video fullscreen while waiting
    document.getElementById('localVideoWrapper').classList.remove('hidden');
    document.getElementById('localVideoWrapper').classList.add('local-fullscreen');
    document.getElementById('localVideoWrapper').classList.remove('local-video');
    
    updateStatus('Finding matches with similar interests...');
    showLoading('Finding your perfect match...');
    
    // Join queue with interest
    socket.emit("joinQueue", { 
      interests: [interest],
      userId: localStorage.getItem('userId') || null
    });
    
    sessionStartTime = Date.now();
    
    // Start analytics updates
    startAnalyticsUpdates();
    
  } catch (err) {
    console.error('Camera error:', err);
    alert('Camera/Mic access required');
    document.getElementById('interestModal').classList.remove('hidden');
    hideLoading();
  }
}

function selectTopic(topic) {
  document.getElementById('interestInput').value = topic;
}

function toggleAudio() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const btn = document.getElementById('audioBtn');
      btn.textContent = audioTrack.enabled ? '🎤' : '🔇';
      btn.classList.toggle('muted', !audioTrack.enabled);
    }
  }
}

function switchCamera() {
  // Future implementation for camera switching
  console.log('Switch camera requested');
}

// In script.js - modify nextUser()
function nextUser() {
  console.log('Next button clicked - finding new partner gracefully');
  
  if (!confirm('Find a new partner?')) {
    return;
  }
  
  skipCount++;
  sessionAnalytics.skips = skipCount;
  
  updateStatus('Finding new partner...');
  showLoading('Finding new partner...');
  
  // Emit next event (backend will send partner-left-waiting)
  socket.emit("next");
  
  // Reset local state but keep stream
  if (peer) {
    peer.close();
    peer = null;
  }
  isMatched = false;
  partnerId = null;
  
  // Clear remote video
  const remoteVideo = document.getElementById('remoteVideo');
  if (remoteVideo) remoteVideo.srcObject = null;
  
  // Hide partner video
  const partnerWrapper = document.getElementById('partnerVideoWrapper');
  if (partnerWrapper) partnerWrapper.classList.add('partner-hidden');
  
  // Show local fullscreen
  const localWrapper = document.getElementById('localVideoWrapper');
  if (localWrapper) {
    localWrapper.classList.add('local-fullscreen');
    localWrapper.classList.remove('local-video');
  }
  
  // Note: DON'T call resetCall() here - we want to stay in call
}

function endCall() {
  if (confirm('End video call?')) {
    // Stop all streams
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    
    // Emit next to clean up
    socket.emit("next");
    
    // Full reset to modal
    resetCall();
  }
}
// ============================================
// WEBRTC PEER CONNECTION
// ============================================
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
    console.log("ICE state:", peer.iceConnectionState);
    if (peer.iceConnectionState === 'connected') {
      updateStatus('🎬 Video call active!');
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
    console.log("🎥 Remote stream received!");
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
// ANALYTICS
// ============================================
function startAnalyticsUpdates() {
  if (analyticsInterval) clearInterval(analyticsInterval);
  
  analyticsInterval = setInterval(() => {
    if (sessionStartTime) {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      sessionAnalytics.totalTime = elapsed;
      
      if (partnerStartTime && isMatched) {
        sessionAnalytics.partnerTime = Math.floor((Date.now() - partnerStartTime) / 1000);
      }
      
      updateAnalyticsDisplay();
    }
  }, 1000);
}

function updateAnalyticsDisplay() {
  const analyticsDiv = document.getElementById('analyticsDashboard');
  const content = document.getElementById('analyticsContent');
  
  // Only show in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    analyticsDiv.classList.remove('hidden');
  }
  
  content.innerHTML = `
    Session: ${formatTime(sessionAnalytics.totalTime)}<br>
    Partner: ${formatTime(sessionAnalytics.partnerTime)}<br>
    Skips: ${sessionAnalytics.skips}<br>
    Interest: ${currentInterest || 'none'}<br>
    Status: ${isMatched ? 'Connected ✅' : 'Waiting ⏳'}
  `;
}

function endSessionAnalytics() {
  if (partnerStartTime && isMatched) {
    const duration = Math.floor((Date.now() - partnerStartTime) / 1000);
    console.log('Session ended:', {
      duration,
      interest: currentInterest,
      skips: skipCount,
      timestamp: new Date().toISOString()
    });
    
    socket.emit('session-end', {
      duration,
      interest: currentInterest,
      skips: skipCount
    });
  }
  partnerStartTime = null;
}

function formatTime(seconds) {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ============================================
// DEBUG FEATURES
// ============================================
let clickCount = 0;
function setupDebugFeatures() {
  const statusDiv = document.getElementById('statusIndicator');
  statusDiv.addEventListener('click', () => {
    clickCount++;
    if (clickCount === 3) {
      const analytics = document.getElementById('analyticsDashboard');
      analytics.classList.toggle('hidden');
      clickCount = 0;
    }
    setTimeout(() => { clickCount = 0; }, 1000);
  });
}

// ============================================
// EVENT LISTENERS
// ============================================
function bindEvents() {
  // Topic chips
  document.querySelectorAll('.topic-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const topic = chip.getAttribute('data-topic');
      selectTopic(topic);
    });
  });
  
  // Start button
  document.getElementById('startBtn').addEventListener('click', startWithInterest);
  
  // Enter key on input
  document.getElementById('interestInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startWithInterest();
  });
  
  // 👇 ADD THIS - Cancel button event listener
  const cancelBtn = document.getElementById('cancelLoadingBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelLoading);
  }
}

// ============================================
// EXPOSE GLOBAL FUNCTIONS
// ============================================
window.startWithInterest = startWithInterest;
window.selectTopic = selectTopic;
window.toggleAudio = toggleAudio;
window.switchCamera = switchCamera;
window.nextUser = nextUser;
window.endCall = endCall;
window.cancelLoading = cancelLoading;

// ============================================
// INITIALIZATION
// ============================================
function init() {
  bindEvents();
  initSocket();
  setupDebugFeatures();
  console.log('🎬 App initialized. Backend URL:', BACKEND_URL);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


// Add this near your formatTime() or other helper functions
function showMatchQualityBadge(score) {
  let badge = document.getElementById('matchQualityBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'matchQualityBadge';
    badge.style.position = 'fixed';
    badge.style.top = '80px';
    badge.style.right = '20px';
    badge.style.backgroundColor = score >= 70 ? '#2ed573' : score >= 50 ? '#ffa502' : '#ff4757';
    badge.style.color = 'white';
    badge.style.padding = '8px 15px';
    badge.style.borderRadius = '20px';
    badge.style.fontSize = '12px';
    badge.style.zIndex = '15';
    badge.style.fontWeight = 'bold';
    badge.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    document.body.appendChild(badge);
  }
  
  badge.textContent = `🎯 ${score}% Match`;
  badge.style.backgroundColor = score >= 70 ? '#2ed573' : score >= 50 ? '#ffa502' : '#ff4757';
  badge.style.opacity = '1';
  
  // Fade out after 3 seconds
  setTimeout(() => {
    badge.style.opacity = '0';
    setTimeout(() => {
      if (badge.parentNode) badge.remove();
    }, 500);
  }, 3000);
}