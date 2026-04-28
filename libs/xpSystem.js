const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const tcgEconomy = require('./tcgEconomy');

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
    try {
      client.db.checkUser(message.author);
      const settings = await client.db.getXPSettings(message.guild.id);
      const cdSec = Math.max(1, Number(settings.message_xp_cooldown_seconds) || 60);
      const cdMs = cdSec * 1000;
      const cooldownKey = `${message.author.id}:${message.channel.id}`;
      const now = Date.now();
      const lastAt = lastChannelMessageXpAt.get(cooldownKey) || 0;
      if (now - lastAt < cdMs) {
        return;
      }

      const user = await client.db.getUserXP(message.author.id);
      const guildSettings = (await client.db.getGuildConfigurable(message.guild.id)) || {};

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
        xpGain = Math.floor(xpGain * Number(settings.weekend_multiplier) || 1);
      }

      try {
        const internalId = await tcgEconomy.getInternalUserId(message.author.id);
        if (internalId) {
          const w = await db.query('user_wallets').where({ user_id: internalId }).first();
          const until = w && w.tcg_xp_booster_until != null ? Number(w.tcg_xp_booster_until) : 0;
          if (until > Math.floor(Date.now() / 1000)) {
            xpGain *= 2;
          }
        }
      } catch (_) {
        /* optional booster */
      }

      user.xp += xpGain;
      user.message_count = 0;

      const newLevel = self.calculateLevel(user.xp);
      if (newLevel > user.level) {
        user.level = newLevel;
        if (guildSettings.level_up_enabled && guildSettings.level_up_channel) {
          const channel = message.guild.channels.cache.get(guildSettings.level_up_channel);
          if (channel) self.sendLevelUpMessage(channel, message.author, newLevel);
        }
      }

      await client.db.updateUserXPAndLevel(message.author.id, user.xp, user.level, user.message_count);
      client.logger.info(`${message.author.username} gained ${xpGain} XP and is now level ${user.level}`);
    } catch (error) {
      client.logger.error('Error in XP system:', error);
    }
  },

  isWeekend: (weekendDays) => {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
    return weekendDays.split(',').includes(today);
  },

  calculateLevel: (xp) => Math.floor(0.47 * Math.sqrt(xp)),

  sendLevelUpMessage: (channel, user, newLevel) => {
    const embed = new EmbedBuilder()
      .setTitle('Level Up!')
      .setDescription(`Congratulations ${user.username}! You've reached level ${newLevel}!`)
      .setColor('#00FF00')
      .setThumbnail(user.displayAvatarURL());

    channel.send({ embeds: [embed] });
  },
});
