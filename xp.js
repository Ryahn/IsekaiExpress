const { Client, Intents } = require('discord.js');
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
const db = require('./database'); // Assume this is your database connection

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Fetch user's current XP and message count
  const user = await db.getUserXP(message.author.id);
  const settings = await db.getXPSettings();

  // Increment message count
  user.message_count++;

  // Check if user should gain XP
  if (user.message_count >= settings.messages_per_xp) {
    // Reset message count
    user.message_count = 0;

    // Calculate XP gain
    let xpGain = Math.floor(Math.random() * (settings.max_xp_per_gain - settings.min_xp_per_gain + 1)) + settings.min_xp_per_gain;

    // Apply weekend multiplier if applicable
    if (isWeekend(settings.weekend_days) || settings.double_xp_enabled) {
      xpGain *= settings.weekend_multiplier;
    }

    // Add XP to user
    user.xp += xpGain;

    // Update user XP in database
    await db.updateUserXP(message.author.id, user.xp, user.message_count);

    console.log(`${message.author.username} gained ${xpGain} XP`);
  } else {
    // Update message count in database
    await db.updateUserMessageCount(message.author.id, user.message_count);
  }
});

function isWeekend(weekendDays) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  return weekendDays.split(',').includes(today);
}

client.login('YOUR_BOT_TOKEN');