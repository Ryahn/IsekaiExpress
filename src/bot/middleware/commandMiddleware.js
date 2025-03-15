/**
 * Middleware for handling command cooldowns and permissions
 */
const checkCommandCooldown = (client, userId, commandName) => {
  const remainingCooldown = client.cooldownManager.isOnCooldown(userId, commandName);
  
  if (remainingCooldown) {
    return {
      onCooldown: true,
      remainingTime: remainingCooldown
    };
  }
  
  return { onCooldown: false };
};

const setCooldown = (client, userId, commandName) => {
  client.cooldownManager.setCooldown(userId, commandName);
};

module.exports = {
  checkCommandCooldown,
  setCooldown
}; 