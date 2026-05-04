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
  
  const result = emailOTPService.verifyOTP(email, otpCode);
  
  if (result.success) {
    // Check if user already exists in database
    let user = await User.findOne({ email });
    
    // Check if user has complete profile (username not auto-generated)
    const hasProfile = user && user.username && !user.username.startsWith('user_');
    
    // Create temp token
    const tempToken = jwt.sign(
      { 
        email, 
        otpVerified: true,
        userId: user?._id || null,
        hasProfile: hasProfile || false  // ✅ Ensure boolean, not null
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    res.json({ 
      success: true, 
      tempToken,
      hasProfile: hasProfile || false,  // ✅ Ensure boolean
      username: user?.username || '',
      email: email
    });
  } else {
    res.json(result);
  }
});

// Complete profile with email
router.post('/complete-profile-email', async (req, res) => {
  const { tempToken, username, profilePic } = req.body;
  
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    const { email, userId, hasProfile } = decoded;
    
    let user;
    
    if (userId && hasProfile) {
      // Existing user - just generate token
      user = await User.findById(userId);
      if (!user) {
        return res.json({ success: false, message: 'User not found' });
      }
    } else {
      // New user - create or update
      user = await User.findOne({ email });
      
      if (!user) {
        // ✅ Check if username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
          return res.json({ success: false, message: 'Username already taken. Please choose another.' });
        }
        
        user = new User({
          username,
          email,
          profilePic: profilePic || '😀',
          isVerified: true
        });
      } else {
        // ✅ Check if username already exists (for update)
        if (user.username !== username) {
          const existingUser = await User.findOne({ username });
          if (existingUser) {
            return res.json({ success: false, message: 'Username already taken. Please choose another.' });
          }
        }
        user.username = username;
        user.profilePic = profilePic || user.profilePic;
        user.isVerified = true;
      }
      
      await user.save();
    }
    
    // Generate final auth token
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
    } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      res.json({ success: false, message: 'Session expired. Please login again.' });
    } else {
      res.json({ success: false, message: 'Session expired. Please login again.' });
    }
  }
});

// ============================================
// PHONE OTP ROUTES (Legacy)
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

// ============================================
// FIREBASE AUTH ROUTE
// ============================================

router.post('/firebase-verify', async (req, res) => {
  const { phoneNumber, uid } = req.body;
  let user = await User.findOne({ phoneNumber });
  let isNewUser = false;
  if (!user) {
    user = new User({ phoneNumber, username: `user_${Date.now()}`, email: `${phoneNumber}@temp.user`, isVerified: true, firebaseUid: uid });
    await user.save();
    isNewUser = true;
  }
  const hasCompleteProfile = user.username && !user.username.startsWith('user_') && user.email && !user.email.includes('@temp.user');
  const tempToken = jwt.sign({ userId: user._id, phoneNumber, hasCompleteProfile }, process.env.JWT_SECRET, { expiresIn: '15m' });
  res.json({ success: true, tempToken, hasCompleteProfile, isNewUser, message: 'OTP verified' });
});

// ============================================
// GUEST MODE ROUTES
// ============================================

router.post('/guest', async (req, res) => {
  let ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
  if (ipAddress.startsWith('::ffff:')) ipAddress = ipAddress.substring(7);
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