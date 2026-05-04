const emailService = require('./emailService');

// Store OTPs temporarily (use Redis in production)
const otpStore = new Map();

class EmailOTPService {
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendOTP(email) {
    const otp = this.generateOTP();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    // Store OTP
    otpStore.set(email, { otp, expires });
    
    // Send email via Brevo
    console.log(`📧 Sending OTP to ${email}...`);
    const result = await emailService.sendOTPEmail(email, otp);
    
    if (result) {
      console.log(`✅ OTP sent to ${email}`);
    } else {
      console.log(`⚠️ Failed to send email, but OTP is: ${otp}`);
    }
    
    return { success: true, message: 'OTP sent to email' };
  }

  verifyOTP(email, otpCode) {
    const stored = otpStore.get(email);
    
    if (!stored) {
      return { success: false, message: 'No OTP requested for this email. Please request a new OTP.' };
    }
    
    if (stored.otp !== otpCode) {
      return { success: false, message: 'Invalid OTP code. Please try again.' };
    }
    
    if (stored.expires < Date.now()) {
      otpStore.delete(email);
      return { success: false, message: 'OTP has expired. Please request a new OTP.' };
    }
    
    // Clear OTP after successful verification
    otpStore.delete(email);
    return { success: true, message: 'OTP verified successfully' };
  }
}

module.exports = new EmailOTPService();