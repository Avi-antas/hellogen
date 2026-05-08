// ============================================
// MATCH OVERLAY WITH AVATARS + SCROLL TO SKIP
// ============================================

class MatchOverlay {
  constructor() {
    this.overlay = null;
    this.userAvatar = null;
    this.userName = null;
    this.partnerAvatarEl = null;
    this.partnerNameEl = null;
    this.statusText = null;
    this.isMatched = false;
  }
  
  create() {
    // Get user profile
    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    this.userAvatar = profile.avatar || '👋';
    this.userName = profile.username || 'You';
    
    // Create overlay HTML
    const overlayHTML = `
      <div id="matchOverlay" class="match-overlay">
        <div class="match-container">
          <div class="match-status" id="matchStatus">Finding your match...</div>
          
          <div class="avatars-container">
            <!-- Your Avatar -->
            <div class="avatar-wrapper">
              <div class="avatar-circle" id="userAvatarCircle">
                ${this.userAvatar}
              </div>
              <div class="avatar-name" id="userName">${this.userName}</div>
              <div class="avatar-label">You</div>
            </div>
            
            <div class="connection-line" id="connectionLine">
              <div class="pulse-dot"></div>
              <div class="pulse-dot delay-1"></div>
              <div class="pulse-dot delay-2"></div>
            </div>
            
            <!-- Partner Avatar (Empty) -->
            <div class="avatar-wrapper">
              <div class="avatar-circle partner-avatar" id="partnerAvatarCircle">
                ?
              </div>
              <div class="avatar-name" id="partnerName">???</div>
              <div class="avatar-label">Partner</div>
            </div>
          </div>
          
          <div class="searching-dots" id="searchingDots">
            <span>.</span><span>.</span><span>.</span>
          </div>
          
          <div class="match-tip">Scroll on video to skip</div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', overlayHTML);
    this.overlay = document.getElementById('matchOverlay');
    this.partnerAvatarEl = document.getElementById('partnerAvatarCircle');
    this.partnerNameEl = document.getElementById('partnerName');
    this.statusText = document.getElementById('matchStatus');
    
    // Add styles
    this.addStyles();
  }
  
  addStyles() {
    if (document.getElementById('matchOverlayStyles')) return;
    
    const styles = `
      <style id="matchOverlayStyles">
        .match-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(10, 10, 10, 0.98);
          backdrop-filter: blur(20px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.5s ease, visibility 0.5s ease;
        }
        
        .match-overlay.hide {
          opacity: 0;
          visibility: hidden;
        }
        
        .match-container {
          text-align: center;
          max-width: 600px;
          width: 90%;
        }
        
        .match-status {
          font-size: var(--font-size-2xl);
          font-weight: var(--font-weight-semibold);
          margin-bottom: var(--spacing-2xl);
          color: var(--accent-primary);
        }
        
        .avatars-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-3xl);
          margin-bottom: var(--spacing-2xl);
          flex-wrap: wrap;
        }
        
        .avatar-wrapper {
          text-align: center;
        }
        
        .avatar-circle {
          width: 120px;
          height: 120px;
          background: linear-gradient(135deg, var(--accent-primary), #764ba2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 4rem;
          box-shadow: var(--shadow-lg);
          transition: all 0.3s ease;
        }
        
        .partner-avatar {
          background: linear-gradient(135deg, #2d2d2d, #1a1a1a);
          animation: pulse 1.5s infinite;
        }
        
        .avatar-name {
          margin-top: var(--spacing-md);
          font-weight: var(--font-weight-medium);
          font-size: var(--font-size-lg);
        }
        
        .avatar-label {
          font-size: var(--font-size-sm);
          color: var(--text-muted);
          margin-top: var(--spacing-xs);
        }
        
        .connection-line {
          display: flex;
          gap: var(--spacing-sm);
          align-items: center;
        }
        
        .pulse-dot {
          width: 8px;
          height: 8px;
          background: var(--accent-primary);
          border-radius: 50%;
          animation: pulse 1.5s infinite;
        }
        
        .pulse-dot.delay-1 { animation-delay: 0.5s; }
        .pulse-dot.delay-2 { animation-delay: 1s; }
        
        .searching-dots {
          font-size: var(--font-size-3xl);
          letter-spacing: 4px;
          color: var(--text-muted);
        }
        
        .searching-dots span {
          animation: blink 1.4s infinite;
        }
        
        .searching-dots span:nth-child(2) { animation-delay: 0.2s; }
        .searching-dots span:nth-child(3) { animation-delay: 0.4s; }
        
        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        
        .match-tip {
          margin-top: var(--spacing-2xl);
          font-size: var(--font-size-sm);
          color: var(--text-muted);
        }
        
        /* Match Found Animation */
        .match-overlay.matched .avatar-circle {
          animation: matchExplosion 0.5s ease;
        }
        
        .match-overlay.matched .connection-line {
          animation: glow 0.5s ease 3;
        }
        
        @keyframes matchExplosion {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        
        @media (max-width: 768px) {
          .avatar-circle {
            width: 80px;
            height: 80px;
            font-size: 2.5rem;
          }
          
          .avatars-container {
            gap: var(--spacing-xl);
          }
          
          .match-status {
            font-size: var(--font-size-xl);
          }
        }
      </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
  }
  
  show() {
    if (this.overlay) {
      this.overlay.classList.remove('hide', 'matched');
    }
  }
  
  hide() {
    if (this.overlay) {
      this.overlay.classList.add('hide');
      setTimeout(() => {
        if (this.overlay) this.overlay.remove();
      }, 500);
    }
  }
  
  onMatchFound(partnerAvatar = '🦊', partnerName = 'Sam') {
    this.isMatched = true;
    
    // Update partner info
    this.partnerAvatarEl.textContent = partnerAvatar;
    this.partnerNameEl.textContent = partnerName;
    this.partnerAvatarEl.style.background = 'linear-gradient(135deg, var(--accent-primary), #764ba2)';
    this.partnerAvatarEl.style.animation = 'none';
    
    // Update status
    this.statusText.innerHTML = '✨ MATCHED! ✨';
    this.statusText.style.color = 'var(--accent-success)';
    
    // Add matched class for animation
    this.overlay.classList.add('matched');
    
    // Update searching dots to connecting
    const dotsContainer = document.getElementById('searchingDots');
    dotsContainer.innerHTML = 'Connecting';
    
    // Return promise that resolves after animation
    return new Promise(resolve => {
      setTimeout(() => {
        this.hide();
        resolve();
      }, 2000);
    });
  }
  
  updatePartnerInfo(avatar, name) {
    if (this.partnerAvatarEl && !this.isMatched) {
      this.partnerAvatarEl.textContent = avatar;
      this.partnerNameEl.textContent = name;
    }
  }
}

// ============================================
// SCROLL TO SKIP HANDLER
// ============================================

class ScrollToSkip {
  constructor(videoElement, onSkipCallback) {
    this.videoElement = videoElement;
    this.onSkip = onSkipCallback;
    this.scrollThreshold = 50; // pixels
    this.lastScrollY = 0;
    this.isListening = false;
  }
  
  start() {
    if (!this.videoElement) {
      console.warn('ScrollToSkip: No video element provided');
      return;
    }
    
    this.isListening = true;
    
    // Desktop: Mouse wheel
    this.videoElement.addEventListener('wheel', this.handleWheel.bind(this));
    
    // Mobile: Touch swipe
    this.videoElement.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.videoElement.addEventListener('touchend', this.handleTouchEnd.bind(this));
    
    console.log('✅ Scroll to skip active - scroll on video to find next partner');
  }
  
  stop() {
    this.isListening = false;
    this.videoElement.removeEventListener('wheel', this.handleWheel);
    this.videoElement.removeEventListener('touchstart', this.handleTouchStart);
    this.videoElement.removeEventListener('touchend', this.handleTouchEnd);
  }
  
  handleWheel(e) {
    if (!this.isListening) return;
    
    // Detect scroll direction (down/up)
    if (e.deltaY > this.scrollThreshold) {
      // Scrolled down - skip to next partner
      e.preventDefault();
      this.triggerSkip();
    }
  }
  
  handleTouchStart(e) {
    this.touchStartY = e.touches[0].clientY;
  }
  
  handleTouchEnd(e) {
    if (!this.isListening || !this.touchStartY) return;
    
    const touchEndY = e.changedTouches[0].clientY;
    const swipeDistance = this.touchStartY - touchEndY;
    
    // Swipe up to skip
    if (swipeDistance > this.scrollThreshold) {
      e.preventDefault();
      this.triggerSkip();
    }
    
    this.touchStartY = null;
  }
  
  triggerSkip() {
    if (this.onSkip) {
      // Visual feedback
      this.showSkipFeedback();
      this.onSkip();
    }
  }
  
  showSkipFeedback() {
    const feedback = document.createElement('div');
    feedback.textContent = '⏭️ Finding next partner...';
    feedback.style.position = 'fixed';
    feedback.style.bottom = '100px';
    feedback.style.left = '50%';
    feedback.style.transform = 'translateX(-50%)';
    feedback.style.background = 'rgba(0,0,0,0.9)';
    feedback.style.color = 'white';
    feedback.style.padding = '12px 24px';
    feedback.style.borderRadius = '50px';
    feedback.style.zIndex = '1000';
    feedback.style.fontFamily = "var(--font-family)";
    feedback.style.fontSize = "var(--font-size-sm)";
    feedback.style.animation = 'fadeIn 0.3s ease';
    
    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 1500);
  }
}

