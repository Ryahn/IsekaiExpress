const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const logger = require('./libs/logger');
const path = require('path');
const fs = require('fs');
const { POWER_SCORE_L1 } = require('./src/bot/tcg/cardLayout.js');
const { RARITY_ORDER } = require('./src/bot/tcg/rarityOrder');

/**
 * Fetches guild role members and writes tcg batch JSON for `master.js` / `create_card.js`.
 * Aligns with [CardSystem.md]: 11 rarities (N → M), `source` + class rules for Stage 3, level-1 power scores.
 *
 * **Staff / Mod / Trial mod / Uploader** → `source` staff|mod|uploader, **class Sovereign** (batch rarity floors via `batch_worker.js`).
 * **Retired / Respected** → `source` **member**, class from prior row if still valid, else **Artisan** (Sovereign on a member row is corrected).
 *
 * On each run, rows are **migrated** from the existing file: `description` and per-rarity **toggles** are kept; `powerByRarity`
 * is refreshed from `POWER_SCORE_L1`; unknown/legacy keys are dropped. Obsolete top-level fields (`power`, `grade`, etc.) are removed.
 */

/** @typedef {'staff'|'mod'|'uploader'|'member'} CardBatchSource */

const ALL_TIERS_ON = RARITY_ORDER.reduce(
  (acc, abbrev) => {
    acc[abbrev] = 1;
    return acc;
  },
  /** @type {Record<string, number>} */ ({}),
);

const MEMBER_CLASS_LABEL = {
  guardian: 'Guardian',
  artisan: 'Artisan',
  commander: 'Commander',
  phantom: 'Phantom',
  sage: 'Sage',
  warden: 'Warden',
};

/**
 * Discord role file → `card_data.source` for `batch_worker.js` / `create_card.js`.
 * Trial mods use **mod** (same SR floor as moderators).
 */
const SOURCE_BY_CLASS_KEY = {
  staff: 'staff',
  mod: 'mod',
  trialmod: 'mod',
  uploader: 'uploader',
  retired: 'member',
  respected: 'member',
};

const tcgDir = path.join(__dirname, 'src', 'bot', 'tcg');

/** Keys written to JSON — anything else from an old file is dropped. */
const HERO_ROW_KEYS = new Set([
  'name',
  'discord_id',
  'type',
  'class',
  'level',
  'description',
  'powerByRarity',
  'avatar',
  'rarity',
  'source',
]);

function getAvatar(avatar, userId) {
  return avatar
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=1024`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function isRarityEnabled(v) {
  if (v === false || v === 0 || v === '0') return false;
  return v != null;
}

/**
 * Keep player toggles for each canonical rarity; add missing tiers as on; strip unknown keys.
 * @param {Record<string, unknown>|null|undefined} prev
 */
function normalizeRarityObject(prev) {
  const out = {};
  for (const abbrev of RARITY_ORDER) {
    if (prev && Object.prototype.hasOwnProperty.call(prev, abbrev)) {
      out[abbrev] = isRarityEnabled(prev[abbrev]) ? 1 : 0;
    } else {
      out[abbrev] = ALL_TIERS_ON[abbrev];
    }
  }
  return out;
}

/**
 * Canonical level-1 power row; drops legacy tiers (e.g. EP) and non-canonical keys.
 */
function normalizePowerByRarity() {
  const out = {};
  for (const abbrev of RARITY_ORDER) {
    out[abbrev] = POWER_SCORE_L1[abbrev] ?? POWER_SCORE_L1.C;
  }
  return out;
}

/**
 * @param {string|undefined|null} prevClass
 * @returns {keyof typeof MEMBER_CLASS_LABEL}
 */
function normalizedMemberClassKey(prevClass) {
  const k = String(prevClass || '').trim().toLowerCase();
  if (k === 'sovereign') return 'artisan';
  if (MEMBER_CLASS_LABEL[k]) return /** @type {keyof typeof MEMBER_CLASS_LABEL} */ (k);
  return 'artisan';
}

/**
 * @param {string|undefined|null} prevClass
 */
function formatMemberClassLabel(prevClass) {
  const key = normalizedMemberClassKey(prevClass);
  return MEMBER_CLASS_LABEL[key];
}

/**
 * @param {CardBatchSource} source
 * @param {string|undefined|null} prevClass
 */
function resolveClassForRow(source, prevClass) {
  if (source === 'staff' || source === 'mod' || source === 'uploader') {
    return 'Sovereign';
  }
  return formatMemberClassLabel(prevClass);
}

/**
 * @param {Record<string, unknown>|undefined} prevRow
 * @param {string} descriptionFallback
 */
function resolveDescription(prevRow, descriptionFallback) {
  if (prevRow && prevRow.description != null) {
    const s = String(prevRow.description).trim();
    if (s.length) return s;
  }
  return descriptionFallback;
}

/**
 * Load prior file rows by discord_id for migration (description, rarity toggles, class hint for member files).
 * @param {string} filePath
 * @returns {Map<string, Record<string, unknown>>}
 */
function previousRowsByIdFromFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const map = new Map();
    if (!Array.isArray(data)) return map;
    for (const row of data) {
      if (!row || row.discord_id == null) continue;
      map.set(String(row.discord_id), row);
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * @param {import('discord.js').GuildMember} memberLike
 * @param {string} classKey
 * @param {Record<string, unknown>|undefined} prevRow
 */
function buildHeroRow(memberLike, classKey, prevRow) {
  const id = String(memberLike.discord_id);
  const source = /** @type {CardBatchSource} */ (
    SOURCE_BY_CLASS_KEY[classKey] || 'member'
  );
  const desc = resolveDescription(prevRow, 'TBD');
  const rarity = normalizeRarityObject(
    prevRow && typeof prevRow.rarity === 'object' && prevRow.rarity
      ? /** @type {Record<string, unknown>} */ (prevRow.rarity)
      : null,
  );
  const prevClass = prevRow && prevRow.class != null ? String(prevRow.class) : null;
  const className = resolveClassForRow(source, prevClass);

  /** @type {Record<string, unknown>} */
  const row = {
    name: memberLike.username,
    discord_id: memberLike.discord_id,
    type: 'hero',
    class: className,
    level: 1,
    description: desc != null && String(desc).trim() !== '' ? String(desc).trim() : 'TBD',
    powerByRarity: normalizePowerByRarity(),
    avatar: getAvatar(memberLike.avatar, memberLike.user_id),
    rarity,
    source,
  };

  const cleaned = {};
  for (const k of HERO_ROW_KEYS) {
    if (Object.prototype.hasOwnProperty.call(row, k)) cleaned[k] = row[k];
  }
  return cleaned;
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
    },
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
      (u) => !modIds.has(u.discord_id) && !staffIds.has(u.discord_id),
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
      outputFiles.map(async ({ file, classKey, members }) => {
        const target = path.join(tcgDir, file);
        const previousById = previousRowsByIdFromFile(target);
        const data = members.map((m) => {
          const id = String(m.discord_id);
          const prevRow = previousById.get(id);
          return buildHeroRow(m, classKey, prevRow);
        });
        return fs.promises.writeFile(target, JSON.stringify(data, null, 2), 'utf8');
      }),
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
