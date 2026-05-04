const { BrevoClient } = require('@getbrevo/brevo');

class EmailService {
  constructor() {
    this.brevo = null;
    this.apiKey = process.env.BREVO_API_KEY;
    this.init();
  }

  init() {
    if (!this.apiKey) {
      console.log('⚠️ BREVO_API_KEY not found. Emails will be logged to console (MOCK MODE)');
      return;
    }

    try {
      this.brevo = new BrevoClient({
        apiKey: this.apiKey,
        timeoutInSeconds: 30,
        maxRetries: 2,
      });
      console.log('✅ Brevo email service initialized - REAL emails will be sent');
    } catch (err) {
      console.error('❌ Brevo init failed:', err.message);
      this.brevo = null;
    }
  }

  async sendOTPEmail(email, otp) {
    // Mock mode when Brevo not available
    if (!this.brevo) {
      console.log(`\n📧 ===== OTP EMAIL (MOCK) =====`);
      console.log(`To: ${email}`);
      console.log(`OTP: ${otp}`);
      console.log(`Valid for: 10 minutes`);
      console.log(`================================\n`);
      return true;
    }

    try {
      const result = await this.brevo.transactionalEmails.sendTransacEmail({
        subject: '🔐 Your Login OTP - Live Connect',
        htmlContent: this.getOTPHTML(otp),
        sender: {
          name: 'Live Connect',
          email: 'avishekdas478@gmail.com',  // ✅ Your verified Gmail as sender
        },
        to: [{ email }],
      });

      console.log(`✅ OTP email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('❌ OTP email failed:', error.message);
      console.log(`💡 OTP for ${email}: ${otp}`);
      return false;
    }
  }

  async sendViolationEmail(email, username, suspensionType, reason) {
    if (!this.brevo) {
      console.log(`\n📧 ===== VIOLATION EMAIL (MOCK) =====`);
      console.log(`To: ${email}`);
      console.log(`User: ${username}`);
      console.log(`Action: ${suspensionType}`);
      console.log(`Reason: ${reason}`);
      console.log(`====================================\n`);
      return true;
    }

    try {
      await this.brevo.transactionalEmails.sendTransacEmail({
        subject: `⚠️ Account ${suspensionType} – Live Connect`,
        htmlContent: this.getViolationHTML(username, suspensionType, reason),
        sender: {
          name: 'Live Connect',
          email: 'avishekdas478@gmail.com',
        },
        to: [{ email, name: username }],
      });

      console.log(`✅ Violation email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('❌ Violation email failed:', error.message);
      return false;
    }
  }

  async sendWelcomeEmail(email, username) {
    if (!this.brevo) {
      console.log(`📧 WELCOME EMAIL (MOCK) to: ${email}`);
      return true;
    }

    try {
      await this.brevo.transactionalEmails.sendTransacEmail({
        subject: 'Welcome to Live Connect! 🎉',
        htmlContent: this.getWelcomeHTML(username),
        sender: {
          name: 'Live Connect',
          email: 'avishekdas478@gmail.com',
        },
        to: [{ email, name: username }],
      });

      console.log(`✅ Welcome email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('❌ Welcome email failed:', error.message);
      return false;
    }
  }

  getOTPHTML(otp) {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <div style="max-width: 500px; margin: auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px;">
            <h2>🎥 Live Connect</h2>
          </div>
          <div style="padding: 40px 20px;">
            <h3>Your Login OTP</h3>
            <div style="font-size: 48px; font-weight: bold; letter-spacing: 8px; background: #f0f0ff; padding: 20px; border-radius: 15px; margin: 20px 0;">
              ${otp}
            </div>
            <p>This code is valid for <strong>10 minutes</strong>.</p>
            <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getViolationHTML(username, suspensionType, reason) {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 20px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px;">
            <h2>⚠️ Account ${suspensionType}</h2>
          </div>
          <div style="padding: 20px;">
            <p>Dear <strong>${username}</strong>,</p>
            <p>Your account has been <strong>${suspensionType}</strong> due to a violation of our community guidelines.</p>
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
              <strong>Reason:</strong> ${reason}
            </div>
            <p>If you believe this is an error, please contact support.</p>
            <hr>
            <p style="font-size: 12px; color: #666;">Live Connect – real conversations, real people.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getWelcomeHTML(username) {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 20px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
            <h2>🎉 Welcome to Live Connect!</h2>
          </div>
          <div style="padding: 20px;">
            <h3>Hi ${username},</h3>
            <p>Thanks for joining! You're now part of a community of real people having real conversations.</p>
            <ul>
              <li>Select your interests</li>
              <li>Get matched instantly</li>
              <li>Start authentic conversations</li>
            </ul>
            <p>Stay respectful, stay safe, and enjoy!</p>
            <p style="font-size: 12px; color: #666;">– The Live Connect team</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new EmailService();