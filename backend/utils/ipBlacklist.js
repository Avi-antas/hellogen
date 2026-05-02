// In-memory blacklist (use Redis for production)
const blacklistedIPs = new Set();

class IPBlacklist {
  addToBlacklist(ipAddress) {
    blacklistedIPs.add(ipAddress);
    console.log(`🚫 IP Blacklisted: ${ipAddress}`);
    
    // Optional: Persist to database
    // await Blacklist.create({ ip: ipAddress, bannedAt: new Date() });
  }
  
  isBlacklisted(ipAddress) {
    return blacklistedIPs.has(ipAddress);
  }
  
  removeFromBlacklist(ipAddress) {
    blacklistedIPs.delete(ipAddress);
  }
  
  getBlacklistedIPs() {
    return Array.from(blacklistedIPs);
  }
}

module.exports = new IPBlacklist();