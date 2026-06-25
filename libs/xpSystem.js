const { EmbedBuilder } = require('discord.js');
const utils = require('./utils');

/** @type {Map<string, number>} key: `${userId}:${channelId}` → last XP grant epoch ms */
const lastChannelMessageXpAt = new Map();
let cooldownPruneTicks = 0;

function pruneMessageXpCooldownMap() {
  cooldownPruneTicks += 1;
  if (cooldownPruneTicks % 2000 !== 0) return;
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, ts] of lastChannelMessageXpAt) {
    if (ts < cutoff) lastChannelMessageXpAt.delete(key);
  }
}

const self = (module.exports = {
  xpSystem: async (client, message) => {
    // Callers (messageCreate) already filter bots / DMs, but guard defensively so this
    // service is safe to call from anywhere.
    if (!message.guild || message.author.bot || message.webhookId || message.system) return;

    try {
      await client.db.checkUser(message.author);
      const settings = await client.db.getXPSettings(message.guild.id);
      const cdSec = Math.max(1, Number(settings.message_xp_cooldown_seconds) || 60);
      const cdMs = cdSec * 1000;
      const cooldownKey = `${message.author.id}:${message.channel.id}`;
      const now = Date.now();
      const lastAt = lastChannelMessageXpAt.get(cooldownKey) || 0;
      if (now - lastAt < cdMs) {
        return;
      }

      // Claim the cooldown slot BEFORE any awaited work so a burst of messages in the
      // same channel cannot race past the check and grant XP multiple times.
      pruneMessageXpCooldownMap();
      lastChannelMessageXpAt.set(cooldownKey, now);

      const minG = Number(settings.min_xp_per_gain);
      const maxG = Number(settings.max_xp_per_gain);
      const min = Number.isFinite(minG) ? minG : 15;
      const max = Number.isFinite(maxG) ? maxG : 15;
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      let xpGain = lo === hi ? lo : Math.floor(Math.random() * (hi - lo + 1)) + lo;

      if (settings.double_xp_enabled || self.isWeekend(settings.weekend_days)) {
        // Parenthesise the multiply: the previous `xpGain * Number(x) || 1` bound `||` to the
        // whole product, silently flooring legitimate gains to 1 when the multiplier was odd.
        const mult = Number(settings.weekend_multiplier) || 1;
        xpGain = Math.floor(xpGain * mult);
      }

      // Atomic increment under a row lock — no lost updates across concurrent channels.
      const result = await client.db.addUserXP(message.author.id, xpGain, utils.calculateLevel);

      if (result.leveledUp) {
        const guildSettings = (await client.db.getGuildConfigurable(message.guild.id)) || {};
        if (guildSettings.level_up_enabled && guildSettings.level_up_channel) {
          const channel = message.guild.channels.cache.get(guildSettings.level_up_channel);
          if (channel) {
            await self.sendLevelUpMessage(channel, message.author, result.level).catch((e) =>
              client.logger.error('Error sending level-up message:', e),
            );
          }
        }
      }

      client.logger.info(
        `${message.author.username} gained ${xpGain} XP and is now level ${result.level}`,
      );
    } catch (error) {
      client.logger.error('Error in XP system:', error);
    }
  },

  isWeekend: (weekendDays) => {
    if (!weekendDays) return false;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
    return String(weekendDays).split(',').map((d) => d.trim()).includes(today);
  },

  /** Kept as an alias of the canonical formula in libs/utils to avoid drift. */
  calculateLevel: utils.calculateLevel,

  sendLevelUpMessage: (channel, user, newLevel) => {
    const embed = new EmbedBuilder()
      .setTitle('Level Up!')
      .setDescription(`Congratulations ${user.username}! You've reached level ${newLevel}!`)
      .setColor('#00FF00')
      .setThumbnail(user.displayAvatarURL());

    return channel.send({ embeds: [embed] });
  },
});
