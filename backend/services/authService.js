const User = require('../models/User');
const jwt = require('jsonwebtoken');

class AuthService {
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  
  async sendOTP(phoneNumber) {
    const otp = this.generateOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    
    let user = await User.findOne({ phoneNumber });
    if (!user) {
      user = new User({
        phoneNumber,
        username: `user_${Date.now()}`,
        email: `${phoneNumber}@temp.user`,
        isVerified: false
      });
    }
    
    user.otpCode = otp;
    user.otpExpires = expires;
    await user.save();
    
    console.log(`📱 OTP for ${phoneNumber}: ${otp}`);
    
    return { success: true, otp: otp };
  }
  
  async verifyOTP(phoneNumber, otpCode) {
    const user = await User.findOne({ phoneNumber });
    
    if (!user) {
      return { 
        success: false, 
        message: 'User not found',
        isNewUser: true 
      };
    }
    
    if (user.otpCode !== otpCode) {
      return { success: false, message: 'Invalid OTP code' };
    }
    
    if (user.otpExpires < new Date()) {
      return { success: false, message: 'OTP has expired' };
    }
    
    // Check if user has COMPLETE profile (not temporary)
    const hasCompleteProfile = user.username && 
                               !user.username.startsWith('user_') &&
                               user.email && 
                               !user.email.includes('@temp.user') &&
                               user.email.includes('@') &&
                               user.isVerified === true;
    
    console.log('User verification:', {
      phoneNumber,
      username: user.username,
      email: user.email,
      hasCompleteProfile
    });
    
    // Clear OTP
    user.otpCode = null;
    user.otpExpires = null;
    user.isVerified = true;
    await user.save();
    
    return { 
      success: true, 
      userId: user._id,
      phoneNumber: user.phoneNumber,
      hasCompleteProfile: hasCompleteProfile,
      isNewUser: !hasCompleteProfile,
      username: user.username,
      email: user.email,
      profilePic: user.profilePic
    };
  }
  
  async updateProfile(phoneNumber, username, email, profilePic) {
    const user = await User.findOne({ phoneNumber });
    
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    
    if (username) user.username = username;
    if (email) user.email = email;
    if (profilePic) user.profilePic = profilePic;
    user.isVerified = true;
    
    await user.save();
    
    const token = jwt.sign(
      { userId: user._id, phoneNumber: user.phoneNumber },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    return { 
      success: true, 
      token, 
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email,
        profilePic: user.profilePic
      } 
    };
  }
  
  async generateToken(phoneNumber) {
    const user = await User.findOne({ phoneNumber });
    
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    
    const token = jwt.sign(
      { userId: user._id, phoneNumber: user.phoneNumber },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    return { 
      success: true, 
      token, 
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email,
        profilePic: user.profilePic
      } 
    };
  }
  
  async createGuestSession(ipAddress) {
    const guest = new User({
      username: `guest_${Date.now()}`,
      email: `guest_${Date.now()}@temp.user`,
      isGuest: true,
      guestSessionStart: new Date(),
      guestIpAddress: ipAddress,
      isVerified: false
    });
    
    await guest.save();
    
    const token = jwt.sign(
      { userId: guest._id, isGuest: true },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    
    return { token, user: { id: guest._id, username: guest.username, isGuest: true } };
  }
  
  async checkGuestTimeRemaining(userId) {
    const user = await User.findById(userId);
    if (!user || !user.isGuest) return null;
    
    const elapsedMinutes = (Date.now() - user.guestSessionStart) / (1000 * 60);
    const remainingMinutes = Math.max(0, 10 - elapsedMinutes);
    
    return {
      remainingMinutes: Math.floor(remainingMinutes),
      totalUsedMinutes: Math.floor(elapsedMinutes),
      expired: remainingMinutes <= 0
    };
  }
}

module.exports = new AuthService();