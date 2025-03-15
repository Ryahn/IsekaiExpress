class CooldownManager {
  constructor() {
    this.cooldowns = new Map();
    this.defaultCooldown = 3000; // 3 seconds default
    
    // Command-specific cooldowns
    this.commandCooldowns = {
      'youtube': 2000,
      'roll': 5000,
      'peperoll': 10000,
      'baka': 10000,
      'cuddle': 10000,
      'dance': 10000,
      'feed': 10000,
      'fake_cage': 10000,
      'bite': 10000,
      'blush': 10000,
      'bored': 10000,
      'cry': 10000,
      'facepalm': 10000,
      'hug': 10000,
      'kiss': 10000,
      'pat': 10000,
      'slap': 10000,
      'smug': 10000,
      'tickle': 10000,
      'waifu': 10000,
      'wink': 10000,
      'yawn': 10000,
      'level': 10000,
      // Add more as needed
    };
  }
  
  getCooldownTime(commandName) {
    return this.commandCooldowns[commandName] || this.defaultCooldown;
  }
  
  isOnCooldown(userId, commandName) {
    const key = `${userId}-${commandName}`;
    const cooldownTime = this.getCooldownTime(commandName);
    
    if (this.cooldowns.has(key)) {
      const expirationTime = this.cooldowns.get(key) + cooldownTime;
      
      if (Date.now() < expirationTime) {
        return (expirationTime - Date.now()) / 1000;
      }
    }
    
    return false;
  }
  
  setCooldown(userId, commandName) {
    const key = `${userId}-${commandName}`;
    this.cooldowns.set(key, Date.now());
  }
}

module.exports = new CooldownManager();
