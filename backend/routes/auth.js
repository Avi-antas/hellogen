const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const jwt = require('jsonwebtoken');

// Send OTP
router.post('/send-otp', async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.json({ success: false, message: 'Phone number required' });
  }

  const result = await authService.sendOTP(phoneNumber);
  res.json(result);
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { phoneNumber, otpCode } = req.body;

  console.log('Verify OTP request:', { phoneNumber, otpCode });

  if (!phoneNumber || !otpCode) {
    return res.json({ success: false, message: 'Phone number and OTP required' });
  }

  // Verify the OTP
  const verificationResult = await authService.verifyOTP(phoneNumber, otpCode);

  if (!verificationResult.success) {
    return res.json(verificationResult);
  }

  // Create temp token
  const tempToken = jwt.sign(
    {
      phoneNumber,
      userId: verificationResult.userId,
      otpVerified: true,
      hasCompleteProfile: verificationResult.hasCompleteProfile
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  console.log('Sending response:', {
    hasCompleteProfile: verificationResult.hasCompleteProfile,
    isNewUser: verificationResult.isNewUser
  });

  res.json({
    success: true,
    tempToken,
    hasCompleteProfile: verificationResult.hasCompleteProfile,
    isNewUser: verificationResult.isNewUser,
    username: verificationResult.username,
    email: verificationResult.email,
    profilePic: verificationResult.profilePic,
    message: 'OTP verified.'
  });
});

// Complete profile - FIXED for existing users
// Complete profile - FIXED
router.post('/complete-profile', async (req, res) => {
  const { tempToken, username, email, profilePic, skipProfile, existingUser } = req.body;

  console.log('Complete profile request:', { username, email, skipProfile, existingUser });

  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    const { phoneNumber, hasCompleteProfile } = decoded;

    let result;

    if (skipProfile || hasCompleteProfile || existingUser) {
      // Existing user - just generate token
      console.log('Existing user, generating token');
      result = await authService.generateToken(phoneNumber);
    } else {
      // New user - update profile
      console.log('New user, updating profile');
      result = await authService.updateProfile(phoneNumber, username, email, profilePic);
    }

    res.json(result);
  } catch (err) {
    console.error('Complete profile error:', err);
    res.json({ success: false, message: 'Session expired. Please login again.' });
  }
});

// Guest mode
// Guest mode - FIXED
router.post('/guest', async (req, res) => {
  // Get IP address correctly
  let ipAddress = req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  // Clean IP address (remove IPv6 prefix if present)
  if (ipAddress.startsWith('::ffff:')) {
    ipAddress = ipAddress.substring(7);
  }

  console.log('Guest IP address:', ipAddress);

  const result = await authService.createGuestSession(ipAddress);
  res.json(result);
});

// Check guest time
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