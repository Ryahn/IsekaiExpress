const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const str = (k, d = '') => {
  const v = process.env[k];
  if (v === undefined || v === '') return d;
  return v;
};

const int = (k, d) => {
  const v = parseInt(str(k, ''), 10);
  return Number.isNaN(v) ? d : v;
};

const bool = (k, d = false) => {
  const v = str(k, '').toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return d;
};

const baseUrl = str('PUBLIC_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');

/**
 * Central config: env first, with defaults for local dev.
 * Copy `.env.example` to `.env` and set secrets (`.config.js` is no longer required).
 */
module.exports = {
  port: int('PORT', 3000),

  discord: {
    botToken: str('DISCORD_BOT_TOKEN', ''),
    clientId: str('DISCORD_CLIENT_ID', ''),
    clientSecret: str('DISCORD_CLIENT_SECRET', ''),
    callbackUrl: str('DISCORD_CALLBACK_URL', 'http://localhost:3000/auth/discord/callback'),
    guildId: str('DISCORD_GUILD_ID', ''),
    requiredRole: str('REQUIRED_ROLE', ''),
    ownerId: str('OWNER_ID', ''),
    prefix: str('PREFIX', '!'),
    applicationId: str('APPLICATION_ID', str('DISCORD_CLIENT_ID', ''))
  },

  session: {
    secret: str('SESSION_SECRET', ''),
    expires: int('SESSION_EXPIRES', 7)
  },

  mysql: {
    host: str('MYSQL_HOST', 'localhost'),
    port: int('MYSQL_PORT', 3306),
    user: str('MYSQL_USER', 'root'),
    password: str('MYSQL_PASS', ''),
    database: str('MYSQL_DB', 'f95bot'),
    runMigrations: bool('MYSQL_RUN_MIGRATIONS', false)
  },

  warningSystem: {
    enabled: bool('WARNING_SYSTEM_ENABLED', true)
  },

  imageArchive: {
    enabled: bool('IMAGE_ARCHIVE_ENABLED', true),
    uploadToken: str('IMAGE_ARCHIVE_UPLOAD_TOKEN', '')
  },

  channelStats: {
    enabled: bool('CHANNEL_STATS_ENABLED', false)
  },

  /** In-memory custom command cache: revision poll (ms) and optional full reload safety net (0 = disabled). */
  customCommands: {
    pollMs: int('CUSTOM_COMMANDS_POLL_MS', 5000),
    safetyRefreshMs: int('CUSTOM_COMMANDS_SAFETY_REFRESH_MS', 12 * 60 * 1000)
  },

  template: {
    watch: bool('TEMPLATE_WATCH', false),
    noCache: bool('TEMPLATE_NO_CACHE', false),
    undefined: bool('TEMPLATE_UNDEFINED', true),
    trimBlocks: true,
    lstripBlocks: true
  },

  cors: {
    enabled: bool('CORS_ENABLED', false)
  },

  femboy: {
    apiKey: str('FEMBOY_API_KEY', 'anonymous'),
    userId: str('FEMBOY_USER_ID', '9455')
  },

  currencyApiKey: str('CURRENCY_API_KEY', ''),
  youtubeApiKey: str('YOUTUBE_API_KEY', ''),

  url: str('PUBLIC_BASE_URL', baseUrl),
  cardUrl: str('CARD_PUBLIC_URL', `${baseUrl}/public/cards`),

  roles: {
    staff: str('ROLE_STAFF', str('DISCORD_STAFF_ROLE_ID', '')),
    mod: str('ROLE_MOD', ''),
    uploader: str('ROLE_UPLOADER', ''),
    user: str('ROLE_USER', '')
  },

  emojis: {
    type: str('EMOJI_TYPE', '🃏'),
    level: str('EMOJI_LEVEL', '⭐'),
    power: str('EMOJI_POWER', '⚡'),
    class: str('EMOJI_CLASS', '🎭'),
    star: str('EMOJI_STAR', '✦')
  }
};
