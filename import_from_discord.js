const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const logger = require('silly-logger');
const path = require('path');
const fs = require('fs');
const { POWER_SCORE_L1 } = require('./src/bot/tcg/cardLayout.js');

/**
 * Fetches guild role members and writes tcg batch JSON for `master.js` / `create_card.js`.
 * Aligns with [CardSystem.md]: six rarities (C → M), role-based classes, level-1 power scores.
 *
 * - Staff   → class **Commander**
 * - Mods    → class **Guardian**
 * - Uploaders / retired → class **Artisan**
 *
 * `rarity` uses flags per tier; `powerByRarity` matches the design doc (level 1). Omit top-level
 * `power` so the batch uses `powerByRarity` per key (see [batch_worker.js](batch_worker.js)).
 */

const CARD_CLASSES = {
  staff: 'Commander',
  mod: 'Guardian',
  uploader: 'Artisan',
  retired: 'Artisan',
};

const ALL_TIERS_ON = { C: 1, UC: 1, R: 1, EP: 1, L: 1, M: 1 };

function getAvatar(avatar, userId) {
  return avatar
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=1024`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

client.once('ready', async () => {
  logger.startup('Bot has started!');

  const guild = await client.guilds.fetch(config.discord.guildId);

  const getRoleMembers = async (roleId) => {
    const role = await guild.roles.fetch(roleId);
    if (!role) return [];
    return role.members.map((m) => ({
      username: m.displayName,
      discord_id: m.user.id,
      avatar: m.user.avatar,
      user_id: m.user.id,
    }));
  };

  const [uploaders, mods, staff, retired] = await Promise.all([
    getRoleMembers(config.roles.uploader),
    getRoleMembers(config.roles.mod),
    getRoleMembers(config.roles.staff),
    getRoleMembers('1404624122209767656'),
  ]);

  const uploader_data = path.join(__dirname, './src/bot/tcg/uploader_data.json');
  const mods_data = path.join(__dirname, './src/bot/tcg/mods_data.json');
  const staff_data = path.join(__dirname, './src/bot/tcg/staff_data.json');
  const retired_data = path.join(__dirname, './src/bot/tcg/retired_data.json');

  const filteredUploaders = uploaders.filter((uploaderMember) => {
    const hasModRole = mods.some((m) => m.discord_id === uploaderMember.discord_id);
    const hasStaffRole = staff.some((s) => s.discord_id === uploaderMember.discord_id);
    return !hasModRole && !hasStaffRole;
  });

  const filteredMods = mods.filter((modMember) => {
    const hasStaffRole = staff.some((s) => s.discord_id === modMember.discord_id);
    return !hasStaffRole;
  });

  const UploaderJson = [];
  const ModsJson = [];
  const StaffJson = [];
  const RetiredJson = [];

  for (const uploader of filteredUploaders) {
    UploaderJson.push({
      name: uploader.username,
      discord_id: uploader.discord_id,
      type: 'hero',
      class: CARD_CLASSES.uploader,
      level: 1,
      powerByRarity: { ...POWER_SCORE_L1 },
      avatar: getAvatar(uploader.avatar, uploader.user_id),
      rarity: { ...ALL_TIERS_ON },
    });
  }

  for (const mod of filteredMods) {
    ModsJson.push({
      name: mod.username,
      discord_id: mod.discord_id,
      type: 'hero',
      class: CARD_CLASSES.mod,
      level: 1,
      powerByRarity: { ...POWER_SCORE_L1 },
      avatar: getAvatar(mod.avatar, mod.user_id),
      rarity: { ...ALL_TIERS_ON },
    });
  }

  for (const staffMember of staff) {
    StaffJson.push({
      name: staffMember.username,
      discord_id: staffMember.discord_id,
      type: 'hero',
      class: CARD_CLASSES.staff,
      level: 1,
      powerByRarity: { ...POWER_SCORE_L1 },
      avatar: getAvatar(staffMember.avatar, staffMember.user_id),
      rarity: { ...ALL_TIERS_ON },
    });
  }

  for (const retiredMember of retired) {
    RetiredJson.push({
      name: retiredMember.username,
      discord_id: retiredMember.discord_id,
      type: 'hero',
      class: CARD_CLASSES.retired,
      level: 1,
      powerByRarity: { ...POWER_SCORE_L1 },
      avatar: getAvatar(retiredMember.avatar, retiredMember.user_id),
      rarity: { ...ALL_TIERS_ON },
    });
  }

  fs.writeFileSync(uploader_data, JSON.stringify(UploaderJson, null, 2));
  fs.writeFileSync(mods_data, JSON.stringify(ModsJson, null, 2));
  fs.writeFileSync(staff_data, JSON.stringify(StaffJson, null, 2));
  fs.writeFileSync(retired_data, JSON.stringify(RetiredJson, null, 2));
});

(async () => {
  logger.startup('Bot is starting...');
  await client.login(config.discord.botToken);
})();
