/**
 * Web-only documentation for the `/mod` slash command tree.
 * Keep in sync with `src/bot/commands/slashCommands/moderation/mod.js` — last reviewed 2026-04-26.
 * If you change `xpDoubleXpChoices.js`, update `doubleXpDayChoices` here too.
 */

/** Duplicated from `src/bot/commands/slashCommands/moderation/xpDoubleXpChoices.js` — do not require that file from the web app. */
const doubleXpDayChoices = [
  { name: 'Monday, Tuesday', value: 'mon,tue' },
  { name: 'Monday, Tuesday, Wednesday', value: 'mon,tue,wed' },
  { name: 'Monday, Tuesday, Wednesday, Thursday', value: 'mon,tue,wed,thu' },
  { name: 'Monday, Tuesday, Wednesday, Thursday, Friday', value: 'mon,tue,wed,thu,fri' },
  { name: 'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday', value: 'mon,tue,wed,thu,fri,sat' },
  {
    name: 'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday',
    value: 'mon,tue,wed,thu,fri,sat,sun',
  },
  { name: 'Tuesday, Wednesday', value: 'tue,wed' },
  { name: 'Tuesday, Wednesday, Thursday', value: 'tue,wed,thu' },
  { name: 'Tuesday, Wednesday, Thursday, Friday', value: 'tue,wed,thu,fri' },
  { name: 'Tuesday, Wednesday, Thursday, Friday, Saturday', value: 'tue,wed,thu,fri,sat' },
  { name: 'Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday', value: 'tue,wed,thu,fri,sat,sun' },
  { name: 'Wednesday, Thursday', value: 'wed,thu' },
  { name: 'Wednesday, Thursday, Friday', value: 'wed,thu,fri' },
  { name: 'Wednesday, Thursday, Friday, Saturday', value: 'wed,thu,fri,sat' },
  { name: 'Wednesday, Thursday, Friday, Saturday, Sunday', value: 'wed,thu,fri,sat,sun' },
  { name: 'Thursday, Friday', value: 'thu,fri' },
  { name: 'Thursday, Friday, Saturday', value: 'thu,fri,sat' },
  { name: 'Thursday, Friday, Saturday, Sunday', value: 'thu,fri,sat,sun' },
  { name: 'Friday, Saturday', value: 'fri,sat' },
  { name: 'Friday, Saturday, Sunday', value: 'fri,sat,sun' },
  { name: 'Saturday', value: 'sat' },
  { name: 'Saturday, Sunday', value: 'sat,sun' },
  { name: 'Sunday', value: 'sun' },
];

const inDiscordPermissionNote =
  'Many subcommands also require Administrator or the Staff role in Discord (enforced in code for blacklist, review, server utilities, and global lock). Other actions may use default slash permissions; when in doubt, check the bot source for hasGuildAdminOrStaffRole.';

const groups = [
  {
    id: 'help',
    name: 'help',
    description: 'Link to this documentation in the control panel',
    subcommands: [
      {
        name: 'docs',
        path: 'help docs',
        description: 'Get the full mod commands documentation URL (ephemeral; requires web login + Staff/Mod to open).',
        details: 'Uses your configured `PUBLIC_BASE_URL` and path `/modhelp`.',
        staffGated: false,
        options: [],
      },
    ],
  },
  {
    id: 'blacklist',
    name: 'blacklist',
    description: 'Invite blacklist (global targets)',
    subcommands: [
      {
        name: 'add-guild',
        path: 'blacklist add-guild',
        description: 'Blacklist a target guild by invite URL/code or by guild id',
        details: 'Supply either `invite` (URL/code, which will be resolved to a guild id) or `guild_id` directly. `name` is only used as a fallback label when adding by id and the bot cannot resolve it.',
        staffGated: true,
        options: [
          { name: 'invite', type: 'string', required: false, description: 'Invite URL or code (resolves the guild id)' },
          { name: 'guild_id', type: 'string', required: false, description: 'Guild id (snowflake) to blacklist directly' },
          { name: 'name', type: 'string', required: false, description: 'Optional guild name when adding by id' },
          { name: 'reason', type: 'string', required: false, description: 'Reason' },
        ],
      },
      {
        name: 'add-invite',
        path: 'blacklist add-invite',
        description: 'Blacklist a raw invite code',
        staffGated: true,
        options: [
          { name: 'code', type: 'string', required: true, description: 'Invite code' },
          { name: 'reason', type: 'string', required: false, description: 'Reason' },
        ],
      },
      {
        name: 'remove',
        path: 'blacklist remove',
        description: 'Remove by invite code or target guild id',
        staffGated: true,
        options: [{ name: 'value', type: 'string', required: true, description: 'Code or guild id' }],
      },
      {
        name: 'list',
        path: 'blacklist list',
        description: 'List blacklisted guilds and codes (first 15)',
        staffGated: true,
        options: [],
      },
      {
        name: 'check',
        path: 'blacklist check',
        description: 'Dry run: is this invite blacklisted?',
        staffGated: true,
        options: [{ name: 'invite', type: 'string', required: true, description: 'Invite URL or code' }],
      },
    ],
  },
  {
    id: 'review',
    name: 'review',
    description: 'Image / invite review channels and thresholds',
    subcommands: [
      {
        name: 'set',
        path: 'review set',
        description: 'Update review settings (provide any fields to change)',
        details: 'Channels: text or announcement. Integers: min 0 for age and message counts.',
        staffGated: true,
        options: [
          { name: 'image_review_channel', type: 'channel', required: false, description: 'Channel for flagged images' },
          { name: 'invite_queue_channel', type: 'channel', required: false, description: 'Channel for pending invite buttons' },
          { name: 'min_account_age_days', type: 'integer', required: false, description: 'Min account age (days) for image trust' },
          { name: 'min_join_age_days', type: 'integer', required: false, description: 'Min days in server for image trust' },
          { name: 'min_messages_for_image_trust', type: 'integer', required: false, description: 'Min messages for trusted path (skip scam scan). Below threshold: OCR/pHash runs; clean results are not queued; partial scan failures still go to image_review_channel' },
          { name: 'mod_log_ping_role', type: 'role', required: false, description: 'Role pinged on mod log posts (invite/link/scam alerts)' },
          { name: 'mod_log_ping_clear', type: 'boolean', required: false, description: 'True to clear mod log role ping' },
        ],
      },
      {
        name: 'view',
        path: 'review view',
        description: 'Show current review settings',
        staffGated: true,
        options: [],
      },
      {
        name: 'approve-user',
        path: 'review approve-user',
        description: 'Bypass image review for a member',
        staffGated: true,
        options: [{ name: 'user', type: 'user', required: true, description: 'User' }],
      },
      {
        name: 'revoke-user',
        path: 'review revoke-user',
        description: 'Remove image review bypass',
        staffGated: true,
        options: [{ name: 'user', type: 'user', required: true, description: 'User' }],
      },
    ],
  },
  {
    id: 'warnings',
    name: 'warnings',
    description: 'Warnings',
    subcommands: [
      {
        name: 'warn',
        path: 'warnings warn',
        description: 'Issue a warning',
        options: [
          { name: 'user', type: 'user', required: true, description: 'User' },
          { name: 'reason', type: 'string', required: false, description: 'Reason' },
        ],
      },
      {
        name: 'warnings',
        path: 'warnings warnings',
        description: 'List warnings for a user',
        options: [
          { name: 'user', type: 'user', required: true, description: 'User' },
          { name: 'page', type: 'integer', required: false, description: 'Page', min: 1 },
        ],
      },
      {
        name: 'delwarn',
        path: 'warnings delwarn',
        description: 'Delete a warning by id',
        options: [{ name: 'warn_id', type: 'string', required: true, description: '12-char warning id' }],
      },
    ],
  },
  {
    id: 'bans',
    name: 'bans',
    description: 'Bans',
    subcommands: [
      {
        name: 'list',
        path: 'bans list',
        description: 'List bans',
        options: [{ name: 'page', type: 'integer', required: false, description: 'Page number', min: 1 }],
      },
      {
        name: 'unban',
        path: 'bans unban',
        description: 'Unban a user',
        options: [
          { name: 'user', type: 'user', required: false, description: 'User' },
          { name: 'userid', type: 'string', required: false, description: 'Raw user id' },
        ],
      },
    ],
  },
  {
    id: 'cage',
    name: 'cage',
    description: 'Cage roles',
    subcommands: [
      {
        name: 'apply',
        path: 'cage apply',
        description: 'Apply a cage',
        details: 'Duration examples: 1h, 1d (as accepted by the handler).',
        options: [
          { name: 'user', type: 'user', required: true, description: 'User' },
          { name: 'reason', type: 'string', required: true, description: 'Reason' },
          {
            name: 'cage_type',
            type: 'string (choice)',
            required: true,
            description: 'Cage role type',
            choices: [
              { name: 'Cage-OnTopic', value: '672595882562158592' },
              { name: 'Cage-Porn', value: '443850934850945054' },
              { name: 'Cage Memes', value: '790681121926938674' },
              { name: 'Cage VC', value: '985741349267570718' },
              { name: 'Server Cage', value: '330806236821848065' },
            ],
          },
          { name: 'duration', type: 'string', required: false, description: 'e.g. 1h, 1d' },
        ],
      },
      {
        name: 'remove',
        path: 'cage remove',
        description: 'Remove cage',
        options: [{ name: 'user', type: 'user', required: true, description: 'User' }],
      },
      {
        name: 'list',
        path: 'cage list',
        description: 'List caged users',
        options: [],
      },
    ],
  },
  {
    id: 'xp',
    name: 'xp',
    description: 'XP administration',
    subcommands: [
      {
        name: 'settings',
        path: 'xp settings',
        description: 'Change server XP settings',
        options: [
          { name: 'messages_per_xp', type: 'string', required: false, description: 'Messages per XP' },
          { name: 'xp_multiplier', type: 'string', required: false, description: 'XP multiplier' },
          { name: 'min_xp_per_message', type: 'string', required: false, description: 'Min XP per gain' },
          { name: 'max_xp_per_message', type: 'string', required: false, description: 'Max XP per gain' },
          { name: 'message_xp_cooldown_sec', type: 'string', required: false, description: 'Seconds between message XP per channel (default 60)' },
          { name: 'double_xp_days', type: 'string (choice)', required: false, description: 'Double XP days preset', choices: doubleXpDayChoices },
        ],
      },
      {
        name: 'user',
        path: 'xp user',
        description: 'Adjust user XP',
        options: [
          {
            name: 'option',
            type: 'string (choice)',
            required: true,
            description: 'XP adjustment action',
            choices: [
              { name: 'Add XP', value: 'add_xp' },
              { name: 'Remove XP', value: 'remove_xp' },
              { name: 'Set XP', value: 'set_xp' },
              { name: 'Set Level', value: 'set_level' },
            ],
          },
          { name: 'target', type: 'user', required: true, description: 'User' },
          { name: 'amount', type: 'integer', required: true, description: 'Amount' },
        ],
      },
      {
        name: 'doublexp',
        path: 'xp doublexp',
        description: 'Toggle double XP',
        options: [],
      },
      {
        name: 'import_rank',
        path: 'xp import_rank',
        description: 'OCR import rank from image URL',
        options: [
          { name: 'url', type: 'string', required: true, description: 'Image URL' },
          { name: 'target', type: 'user', required: true, description: 'User' },
        ],
      },
    ],
  },
  {
    id: 'server',
    name: 'server',
    description: 'Guild settings and utilities',
    subcommands: [
      {
        name: 'settings',
        path: 'server settings',
        description: 'Toggle server systems',
        staffGated: true,
        options: [
          {
            name: 'option',
            type: 'string (choice)',
            required: true,
            description: 'Server system to toggle',
            choices: [
              { name: 'Enable XP System', value: 'xp_system' },
              { name: 'Enable Warning System', value: 'warning_system' },
              { name: 'Enable Image Archive', value: 'image_archive' },
              { name: 'Enable Level Up Message', value: 'level_up_message' },
            ],
          },
          { name: 'level_up_channel', type: 'channel', required: false, description: 'Level up channel' },
          { name: 'warning_channel', type: 'channel', required: false, description: 'Warning / mod log channel' },
        ],
      },
      {
        name: 'channel_settings',
        path: 'server channel_settings',
        description: 'Paginated command_settings list',
        staffGated: true,
        options: [{ name: 'page', type: 'integer', required: false, description: 'Page number', min: 1 }],
      },
      {
        name: 'channel_stats',
        path: 'server channel_stats',
        description: 'Channel statistics',
        staffGated: true,
        options: [
          { name: 'date', type: 'string', required: false, description: 'Single date (YYYY-MM-DD or similar)' },
          { name: 'month', type: 'integer', required: false, description: 'Month (1–12), use with year', min: 1, max: 12 },
          { name: 'year', type: 'integer', required: false, description: 'Year (e.g. 2026), use with month' },
        ],
      },
      {
        name: 'copy_channel',
        path: 'server copy_channel',
        description: 'Duplicate a channel',
        staffGated: true,
        options: [
          { name: 'to_copy', type: 'channel', required: true, description: 'Source channel (text, voice, category, announcement, stage, forum, media)' },
          { name: 'new_name', type: 'string', required: true, description: 'Name for the new channel', minLength: 1, maxLength: 100 },
        ],
      },
      {
        name: 'update_command_settings',
        path: 'server update_command_settings',
        description: 'Set allowed channel for a command',
        details:
          'Type to search `command_settings` (autocomplete). Pick a command, then set the channel. Requires Administrator.',
        options: [
          { name: 'channel', type: 'channel', required: true, description: 'Target channel' },
          { name: 'command', type: 'string', required: true, description: 'Autocomplete: search by command name or hash' },
        ],
      },
    ],
  },
  {
    id: 'global',
    name: 'global',
    description: 'Global command lock',
    subcommands: [
      {
        name: 'lock_on',
        path: 'global lock_on',
        description: 'Name says lock on; effect is **turn global lock off** (commands work everywhere, subject to per-command settings).',
        details: 'Requires Administrator or staff role. Confusing naming: prefer reading the bot reply to confirm state.',
        staffGated: true,
        options: [],
      },
      {
        name: 'lock_off',
        path: 'global lock_off',
        description: 'Name says lock off; effect is **turn global lock on** (whitelist only).',
        staffGated: true,
        options: [],
      },
      {
        name: 'whitelist',
        path: 'global whitelist',
        description: 'Set whitelist channel (used when lock is in whitelist-only mode)',
        staffGated: true,
        options: [{ name: 'channel', type: 'channel', required: true, description: 'Channel' }],
      },
    ],
  },
];

module.exports = {
  inDiscordPermissionNote,
  doubleXpDayChoices,
  modCommandGroups: groups,
};
