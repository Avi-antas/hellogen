const User = require('../models/user');
const Report = require('../models/report');
const aiDetection = require('./aiDetectionService');
const emailService = require('../utils/emailService');

class ModerationService {
  async handleRedFlag(reporterId, reportedUserId, reason, chatSessionId, guestIp = null) {
    // Calculate severity based on report reason
    let severity = 1;
    let suspensionDuration = null;
    
    // Get reported user
    let user = reportedUserId ? await User.findById(reportedUserId) : null;
    
    // Create report record
    const report = new Report({
      reporterId,
      reportedUserId,
      reportedGuestIp: guestIp,
      reason,
      chatSessionId,
      severity,
      status: 'pending'
    });
    
    await report.save();
    
    // Handle based on user type
    if (user) {
      return await this.handleAuthUserViolation(user, severity);
    } else if (guestIp) {
      return await this.handleGuestViolation(guestIp);
    }
  }
  
  async handleAuthUserViolation(user, severity) {
    // Increment report count
    user.reportCount += 1;
    user.lastReportAt = new Date();
    
    // Calculate suspension based on report count
    let suspensionDuration = null;
    let suspensionType = null;
    
    if (user.reportCount >= 10 || severity >= 4) {
      suspensionDuration = 'deactivated';
      user.status = 'deactivated';
      suspensionType = 'permanent suspension';
    } else if (user.reportCount >= 7) {
      suspensionDuration = 30;
      user.status = 'suspended_30d';
      suspensionType = '30 days suspension';
    } else if (user.reportCount >= 5) {
      suspensionDuration = 7;
      user.status = 'suspended_7d';
      suspensionType = '7 days suspension';
    } else if (user.reportCount >= 3) {
      suspensionDuration = 2;
      user.status = 'suspended_2d';
      suspensionType = '2 days suspension';
    } else {
      suspensionDuration = 1;
      user.status = 'suspended_24h';
      suspensionType = '24 hours suspension';
    }
    
    // Set suspension end date
    if (suspensionDuration && typeof suspensionDuration === 'number') {
      user.suspendedUntil = new Date(Date.now() + suspensionDuration * 24 * 60 * 60 * 1000);
    }
    
    user.suspensionCount += 1;
    user.suspensionHistory.push({
      reason: `Violation: Policy violation`,
      duration: suspensionType,
      startedAt: new Date(),
      endsAt: user.suspendedUntil || new Date()
    });
    
    await user.save();
    
    // Send email notification
    await emailService.sendViolationEmail(user.email, user.username, suspensionType);
    
    return {
      action: 'suspended',
      duration: suspensionType,
      message: `Your account has been ${suspensionType} due to policy violations.`
    };
  }
  
  async handleGuestViolation(ipAddress) {
    // Add IP to blacklist
    const ipBlacklist = require('../utils/ipBlacklist');
    ipBlacklist.addToBlacklist(ipAddress);
    
    return {
      action: 'banned',
      message: 'Your IP has been banned due to policy violations.'
    };
  }
  
  async checkUserCanChat(userId, guestIp = null) {
    if (userId) {
      const user = await User.findById(userId);
      if (!user) return { allowed: false, reason: 'User not found' };
      
      if (user.status === 'deactivated') {
        return { allowed: false, reason: 'Account permanently deactivated' };
      }
      
      if (user.status !== 'active') {
        if (user.suspendedUntil && user.suspendedUntil > new Date()) {
          const remainingHours = Math.ceil((user.suspendedUntil - new Date()) / (1000 * 60 * 60));
          return { allowed: false, reason: `Account suspended for ${remainingHours} more hours` };
        } else {
          // Suspension expired, reactivate
          user.status = 'active';
          user.suspendedUntil = null;
          await user.save();
        }
      }
      
      return { allowed: true };
    } else if (guestIp) {
      const isBlacklisted = require('../utils/ipBlacklist').isBlacklisted(guestIp);
      if (isBlacklisted) {
        return { allowed: false, reason: 'IP banned due to previous violations' };
      }
      return { allowed: true };
    }
    
    return { allowed: false, reason: 'Invalid user' };
  }
}

module.exports = new ModerationService();