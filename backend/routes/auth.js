const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const authService = require('../services/authService');
const emailOTPService = require('../services/emailOTPService');

// ============================================
// EMAIL OTP ROUTES
// ============================================

// Send OTP to email
router.post('/send-email-otp', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.json({ success: false, message: 'Email required' });
  }
  
  const result = await emailOTPService.sendOTP(email);
  res.json(result);
});

// Verify email OTP
router.post('/verify-email-otp', async (req, res) => {
  const { email, otpCode } = req.body;
  
  if (!email || !otpCode) {
    return res.json({ success: false, message: 'Email and OTP required' });
  }
  
  const result = emailOTPService.verifyOTP(email, otpCode);
  
  if (result.success) {
    let user = await User.findOne({ email });
    
    let hasProfile = false;
    if (user) {
      if (user.username && 
          user.username !== 'Explorer' && 
          !user.username.startsWith('user_') &&
          user.username.length > 0) {
        hasProfile = true;
      }
      
      if (user.isVerified === true) {
        hasProfile = true;
      }
    }
    
    console.log(`📧 User check: ${email} | exists: ${!!user} | hasProfile: ${hasProfile}`);
    
    const tempToken = jwt.sign(
      { 
        email, 
        otpVerified: true,
        userId: user?._id || null,
        hasProfile: hasProfile
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    res.json({ 
      success: true, 
      tempToken,
      hasProfile: hasProfile,
      username: user?.username || '',
      profilePic: user?.profilePic || '😎',
      email: email
    });
  } else {
    res.json(result);
  }
});

// ============================================
// GET USER PROFILE BY TEMP TOKEN
// ============================================
router.post('/get-profile', async (req, res) => {
  const { tempToken } = req.body;
  
  if (!tempToken) {
    return res.json({ success: false, message: 'Temp token required' });
  }
  
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    const { email, userId } = decoded;
    
    let user;
    if (userId) {
      user = await User.findById(userId);
    } else if (email) {
      user = await User.findOne({ email });
    }
    
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }
    
    const finalToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      success: true,
      token: finalToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic || '😎',
        isGuest: user.isGuest || false,
        matchesCount: user.matchesCount || 0,
        pinnedPartners: user.pinnedPartners || []
      }
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.json({ success: false, message: 'Session expired. Please login again.' });
  }
});

// ============================================
// COMPLETE PROFILE WITH EMAIL
// ============================================
router.post('/complete-profile-email', async (req, res) => {
  const { tempToken, username, profilePic } = req.body;
  
  if (!tempToken || !username) {
    return res.json({ success: false, message: 'Temp token and username required' });
  }
  
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    const { email, userId } = decoded;
    
    if (!email) {
      return res.json({ success: false, message: 'Email not found in session' });
    }
    
    let user = await User.findOne({ email });
    
    if (user) {
      console.log(`📝 Updating existing user: ${email}`);
      
      const existingUserWithSameName = await User.findOne({ 
        username: username,
        _id: { $ne: user._id }
      });
      
      if (existingUserWithSameName) {
        return res.json({ success: false, message: 'Username already taken. Please choose another.' });
      }
      
      user.username = username;
      user.profilePic = profilePic || user.profilePic || '😎';
      user.isVerified = true;
      user.isGuest = false;
      await user.save();
    } else {
      console.log(`📝 Creating new user: ${email}`);
      
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.json({ success: false, message: 'Username already taken. Please choose another.' });
      }
      
      user = new User({
        username,
        email,
        profilePic: profilePic || '😎',
        isVerified: true,
        isGuest: false,
        status: 'active'
      });
      
      await user.save();
    }
    
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user._id, 
        username: user.username,
        email: user.email,
        profilePic: user.profilePic
      } 
    });
  } catch (err) {
    console.error('Complete profile error:', err);
    if (err.code === 11000) {
      res.json({ success: false, message: 'Username already taken. Please choose another.' });
    } else {
      res.json({ success: false, message: 'Session expired. Please login again.' });
    }
  }
});

// ============================================
// GUEST PROFILE ROUTES
// ============================================

router.get('/api/guest/profile', async (req, res) => {
  let ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
  if (ipAddress.startsWith('::ffff:')) ipAddress = ipAddress.substring(7);
  if (ipAddress === '::1') ipAddress = '127.0.0.1';
  
  try {
    let guest = await User.findOne({ 
      guestIpAddress: ipAddress,
      isGuest: true 
    });
    
    if (guest) {
      res.json({
        success: true,
        name: guest.username,
        avatar: guest.profilePic || '😎',
        email: guest.email || null,
        matchCount: guest.matchesCount || 0
      });
    } else {
      res.json({
        success: true,
        name: null,
        avatar: null,
        email: null,
        matchCount: 0
      });
    }
  } catch (error) {
    console.error('Get guest profile error:', error);
    res.json({ success: false, name: null, avatar: null });
  }
});

router.post('/api/guest/track', async (req, res) => {
  let ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
  if (ipAddress.startsWith('::ffff:')) ipAddress = ipAddress.substring(7);
  if (ipAddress === '::1') ipAddress = '127.0.0.1';
  
  const { name, avatar, email } = req.body;
  
  try {
    let guest = await User.findOne({ 
      guestIpAddress: ipAddress,
      isGuest: true 
    });
    
    if (guest) {
      guest.username = name || guest.username;
      guest.profilePic = avatar || guest.profilePic;
      if (email && !guest.email) {
        guest.email = email;
      }
      guest.lastActiveAt = new Date();
      await guest.save();
    } else {
      guest = new User({
        username: name || 'Explorer',
        profilePic: avatar || '😎',
        email: email || null,
        isGuest: true,
        guestIpAddress: ipAddress,
        isVerified: false,
        status: 'active',
        guestSessionStart: new Date()
      });
      await guest.save();
    }
    
    res.json({ 
      success: true, 
      guest: {
        id: guest._id,
        name: guest.username,
        avatar: guest.profilePic,
        email: guest.email
      }
    });
  } catch (error) {
    console.error('Save guest profile error:', error);
    res.json({ success: false, message: 'Error saving profile' });
  }
});

// ============================================
// MATCH COUNT ROUTES
// ============================================

router.get('/api/user/matches/count', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.json({ success: false, count: 0 });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    res.json({ success: true, count: user?.matchesCount || 0 });
  } catch (error) {
    res.json({ success: false, count: 0 });
  }
});

router.post('/api/user/matches/increment', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.json({ success: false });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { $inc: { matchesCount: 1 } },
      { new: true }
    );
    res.json({ success: true, count: user?.matchesCount || 0 });
  } catch (error) {
    res.json({ success: false });
  }
});

// ============================================
// PINNED PARTNERS ROUTES
// ============================================

// Get pinned partners list
router.get('/pinned/list', async (req, res) => {
  const authToken = req.headers.authorization?.split(' ')[1];
  
  if (!authToken) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      pinnedPartners: user.pinnedPartners || [] 
    });
  } catch (error) {
    console.error('Get pinned error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add pinned partner
router.post('/pinned/add', async (req, res) => {
  const authToken = req.headers.authorization?.split(' ')[1];
  
  if (!authToken) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
    const { partnerId, partnerName, partnerAvatar, topic } = req.body;
    
    console.log('📌 Adding pinned partner:', { userId: decoded.userId, partnerId, partnerName });
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }
    
    // Initialize pinnedPartners array if it doesn't exist
    if (!user.pinnedPartners) {
      user.pinnedPartners = [];
    }
    
    // Check if already pinned
    const alreadyPinned = user.pinnedPartners.some(p => p.partnerId === partnerId);
    if (alreadyPinned) {
      return res.json({ success: false, message: 'Partner already pinned' });
    }
    
    // Add to pinned partners (limit to 20)
    user.pinnedPartners.unshift({
      partnerId: partnerId,
      name: partnerName,
      avatar: partnerAvatar || '🦊',
      topic: topic || 'General',
      pinnedAt: new Date()
    });
    
    // Keep only last 20
    if (user.pinnedPartners.length > 20) {
      user.pinnedPartners = user.pinnedPartners.slice(0, 20);
    }
    
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Partner pinned successfully',
      pinnedPartners: user.pinnedPartners 
    });
    
  } catch (error) {
    console.error('Add pinned error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remove pinned partner
router.post('/pinned/remove', async (req, res) => {
  const authToken = req.headers.authorization?.split(' ')[1];
  
  if (!authToken) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
    const { partnerId } = req.body;
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }
    
    user.pinnedPartners = (user.pinnedPartners || []).filter(p => p.partnerId !== partnerId);
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Partner unpinned',
      pinnedPartners: user.pinnedPartners 
    });
    
  } catch (error) {
    console.error('Remove pinned error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// TEST ENDPOINTS (for debugging)
// ============================================

router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Auth routes are working!' });
});

router.get('/pinned/test', (req, res) => {
  res.json({ success: true, message: 'Pinned routes are working!' });
});

// ============================================
// LEGACY ROUTES (Keep for compatibility)
// ============================================

router.post('/send-otp', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.json({ success: false, message: 'Phone number required' });
  }
  const result = await authService.sendOTP(phoneNumber);
  res.json(result);
});

router.post('/verify-otp', async (req, res) => {
  const { phoneNumber, otpCode } = req.body;
  console.log('Verify OTP request:', { phoneNumber, otpCode });
  if (!phoneNumber || !otpCode) {
    return res.json({ success: false, message: 'Phone number and OTP required' });
  }
  const verificationResult = await authService.verifyOTP(phoneNumber, otpCode);
  if (!verificationResult.success) {
    return res.json(verificationResult);
  }
  const tempToken = jwt.sign(
    { phoneNumber, userId: verificationResult.userId, otpVerified: true, hasCompleteProfile: verificationResult.hasCompleteProfile },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  res.json({ success: true, tempToken, hasCompleteProfile: verificationResult.hasCompleteProfile, isNewUser: verificationResult.isNewUser, username: verificationResult.username, email: verificationResult.email, profilePic: verificationResult.profilePic, message: 'OTP verified.' });
});

router.post('/complete-profile', async (req, res) => {
  const { tempToken, username, email, profilePic, skipProfile, existingUser } = req.body;
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    const { phoneNumber, hasCompleteProfile } = decoded;
    let result;
    if (skipProfile || hasCompleteProfile || existingUser) {
      result = await authService.generateToken(phoneNumber);
    } else {
      result = await authService.updateProfile(phoneNumber, username, email, profilePic);
    }
    res.json(result);
  } catch (err) {
    console.error('Complete profile error:', err);
    res.json({ success: false, message: 'Session expired. Please login again.' });
  }
});

router.post('/firebase-verify', async (req, res) => {
  const { phoneNumber, uid } = req.body;
  let user = await User.findOne({ phoneNumber });
  let isNewUser = false;
  if (!user) {
    user = new User({ 
      phoneNumber, 
      username: `user_${Date.now()}`, 
      email: `${phoneNumber}@temp.user`, 
      isVerified: true, 
      firebaseUid: uid 
    });
    await user.save();
    isNewUser = true;
  }
  const hasCompleteProfile = user.username && !user.username.startsWith('user_') && user.email && !user.email.includes('@temp.user');
  const tempToken = jwt.sign({ userId: user._id, phoneNumber, hasCompleteProfile }, process.env.JWT_SECRET, { expiresIn: '15m' });
  res.json({ success: true, tempToken, hasCompleteProfile, isNewUser, message: 'OTP verified' });
});

router.post('/guest', async (req, res) => {
  let ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
  if (ipAddress.startsWith('::ffff:')) ipAddress = ipAddress.substring(7);
  if (ipAddress === '::1') ipAddress = '127.0.0.1';
  console.log('Guest IP address:', ipAddress);
  const result = await authService.createGuestSession(ipAddress);
  res.json(result);
});

router.get('/guest-time', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.json({ expired: true });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await authService.checkGuestTimeRemaining(decoded.userId);
    res.json(result || { expired: true });
  } catch (err) {
    res.json({ expired: true });
  }
});

module.exports = router;