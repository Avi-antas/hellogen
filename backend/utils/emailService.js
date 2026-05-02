const nodemailer = require('nodemailer');

// For production, use SendGrid, AWS SES, or Brevo (free tier available)
class EmailService {
  constructor() {
    // Configure for development (console logging)
    this.isProduction = process.env.NODE_ENV === 'production';
    
    if (this.isProduction) {
      // Configure with your email provider
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
  }
  
  async sendViolationEmail(userEmail, username, suspensionType) {
    const subject = `Account Suspension Notice - Hellogen`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff4757;">⚠️ Account Suspension Notice</h2>
        <p>Dear ${username},</p>
        <p>Your account has been ${suspensionType} due to violation of our community guidelines.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; margin: 20px 0;">
          <h3>Violation Details:</h3>
          <p>• Multiple reports received from other users</p>
          <p>• Violation of our content policy</p>
          <p>• Failure to maintain respectful communication</p>
        </div>
        <p><strong>Suspension Duration:</strong> ${suspensionType}</p>
        <p>During this time, you will not be able to access your account or use Hellogen services.</p>
        <p>If you believe this is an error, please contact our support team.</p>
        <hr style="margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Hellogen - Real conversations, real people</p>
      </div>
    `;
    
    if (this.isProduction) {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: userEmail,
        subject,
        html
      });
    } else {
      console.log(`📧 Email would be sent to ${userEmail}:`, { subject, html });
    }
  }
  
  async sendWarningEmail(userEmail, username, reason) {
    const subject = `Warning Notice - Hellogen`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ffa502;">⚠️ Warning Notice</h2>
        <p>Dear ${username},</p>
        <p>Our AI moderation system has detected activity that violates our community guidelines.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Continuing this behavior may result in account suspension.</p>
        <p>Please review our community guidelines to ensure a positive experience for everyone.</p>
        <hr style="margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Hellogen - Real conversations, real people</p>
      </div>
    `;
    
    if (this.isProduction) {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: userEmail,
        subject,
        html
      });
    } else {
      console.log(`📧 Warning email would be sent to ${userEmail}`);
    }
  }
}

module.exports = new EmailService();