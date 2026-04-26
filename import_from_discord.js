const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const logger = require('./libs/logger');
const path = require('path');
const fs = require('fs');
const { POWER_SCORE_L1 } = require('./src/bot/tcg/cardLayout.js');
const { RARITY_ORDER } = require('./src/bot/tcg/rarityOrder');

/**
 * Fetches guild role members and writes tcg batch JSON for `master.js` / `create_card.js`.
 * Aligns with [CardSystem.md]: 11 rarities (N → M), role-based classes, level-1 power scores.
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
  trialmod: 'Guardian',
  uploader: 'Artisan',
  retired: 'Artisan',
  respected: 'Artisan',
};

const ALL_TIERS_ON = RARITY_ORDER.reduce(
  (acc, abbrev) => {
    acc[abbrev] = 1;
    return acc;
  },
  /** @type {Record<string, number>} */ ({}),
);
const tcgDir = path.join(__dirname, 'src', 'bot', 'tcg');

function getAvatar(avatar, userId) {
  return avatar
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=1024`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function buildHeroRow(member, classKey) {
  return {
    name: member.username,
    discord_id: member.discord_id,
    type: 'hero',
    class: CARD_CLASSES[classKey],
    level: 1,
    powerByRarity: { ...POWER_SCORE_L1 },
    avatar: getAvatar(member.avatar, member.user_id),
    rarity: { ...ALL_TIERS_ON },
  };
}

function logError(context, err) {
  const stack = err && err.stack ? err.stack : String(err);
  const msg = err && err.message ? err.message : String(err);
  logger.error(`${context}: ${msg}`);
  if (stack && stack !== msg) {
    logger.error(stack);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function shutdown(exitCode) {
  return client.destroy().then(
    () => {
      process.exit(exitCode);
    },
    (destroyErr) => {
      logError('import_from_discord: client.destroy() failed', destroyErr);
      process.exit(1);
    }
  );
}

client.once('clientReady', async () => {
  let exitCode = 0;
  try {
    logger.startup('Connected. Fetching guild and roles...');

    const guild = await client.guilds.fetch(config.discord.guildId);
    if (!guild) {
      throw new Error(`Guild not found: ${config.discord.guildId}`);
    }

    // `Role#members` only includes cached guild members. Without a full fetch, lists are
    // incomplete (often 0–1 after refactors that dropped implicit caching). See discord.js
    // GuildMemberManager#fetch and Role.members.
    logger.startup('Fetching all guild members (required for full role rosters)...');
    const fetched = await guild.members.fetch();
    logger.info(`Guild member cache: ${fetched.size} member(s).`);

    const getRoleMembers = async (roleId) => {
      if (!roleId) return [];
      const role = await guild.roles.fetch(roleId);
      if (!role) {
        logger.warn(`Role not found (check env id): ${roleId}`);
        return [];
      }
      return role.members.map((m) => ({
        username: m.displayName,
        discord_id: m.user.id,
        avatar: m.user.avatar,
        user_id: m.user.id,
      }));
    };

    const [uploaders, mods, staff, retired, respected, trialmod] = await Promise.all([
      getRoleMembers(config.roles.uploader),
      getRoleMembers(config.roles.mod),
      getRoleMembers(config.roles.staff),
      getRoleMembers(config.roles.retired),
      getRoleMembers(config.roles.respected),
      getRoleMembers(config.roles.trialmod),
    ]);

    const modIds = new Set(mods.map((m) => m.discord_id));
    const staffIds = new Set(staff.map((s) => s.discord_id));
    const filteredUploaders = uploaders.filter(
      (u) => !modIds.has(u.discord_id) && !staffIds.has(u.discord_id)
    );
    const filteredMods = mods.filter((m) => !staffIds.has(m.discord_id));

    const outputFiles = [
      { file: 'uploader_data.json', classKey: 'uploader', members: filteredUploaders },
      { file: 'mods_data.json', classKey: 'mod', members: filteredMods },
      { file: 'staff_data.json', classKey: 'staff', members: staff },
      { file: 'retired_data.json', classKey: 'retired', members: retired },
      { file: 'respected_data.json', classKey: 'respected', members: respected },
      { file: 'trialmod_data.json', classKey: 'trialmod', members: trialmod },
    ];

    await Promise.all(
      outputFiles.map(({ file, classKey, members }) => {
        const data = members.map((m) => buildHeroRow(m, classKey));
        const target = path.join(tcgDir, file);
        return fs.promises.writeFile(target, JSON.stringify(data, null, 2), 'utf8');
      })
    );

    const counts = outputFiles
      .map(({ file, members }) => `${file.replace(/_data\.json$/, '')}:${members.length}`)
      .join(', ');
    logger.success(`import_from_discord: wrote ${outputFiles.length} files (${counts})`);
  } catch (err) {
    exitCode = 1;
    logError('import_from_discord failed', err);
  } finally {
    await shutdown(exitCode);
  }
});

client.on('error', (err) => {
  logError('Discord client error', err);
});

(async () => {
  try {
    if (!config.discord.botToken) {
      logger.error('import_from_discord: set DISCORD_BOT_TOKEN in .env');
      process.exit(1);
      return;
    }
    if (!config.discord.guildId) {
      logger.error('import_from_discord: set DISCORD_GUILD_ID in .env');
      process.exit(1);
      return;
    }
    logger.startup('Logging in to Discord...');
    await client.login(config.discord.botToken);
  } catch (err) {
    logError('import_from_discord: login failed', err);
    process.exit(1);
  }
})();
