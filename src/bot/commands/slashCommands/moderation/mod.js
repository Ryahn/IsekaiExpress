const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');
const { ChannelType } = require('discord.js');
const DOUBLE_XP_CHOICES = require('./xpDoubleXpChoices');
const {
  augmentUpdateCommandSubcommand,
  updateCommandSettingsExecute,
} = require('./handlers/updateCommandSettingsBuilder');
const { warnExecute, warningsListExecute, delwarnExecute } = require('./handlers/modHandlersWarnings');
const { bansListExecute, unbanExecute } = require('./handlers/modHandlersBans');
const { cageApplyExecute, cageRemoveExecute, cageListExecute } = require('./handlers/modHandlersCage');
const {
  xpSettingsExecute,
  xpUserExecute,
  xpDoubleExecute,
  xpImportRankExecute,
} = require('./handlers/modHandlersXp');
const {
  serverSettingsExecute,
  channelSettingsExecute,
  channelStatsExecute,
  copyChannelExecute,
} = require('./handlers/modHandlersServer');
const {
  globalLockOnExecute,
  globalLockOffExecute,
  globalWhitelistExecute,
} = require('./handlers/modHandlersGlobal');
const {
  blacklistAddGuildExecute,
  blacklistAddInviteExecute,
  blacklistRemoveExecute,
  blacklistListExecute,
  blacklistCheckExecute,
} = require('./handlers/modHandlersBlacklist');
const {
  blacklistAddImageTextExecute,
  blacklistAddImageHashExecute,
  blacklistListImageTextExecute,
  blacklistListImageHashesExecute,
} = require('./handlers/modHandlersScamImageBlacklist');
const {
  reviewSetExecute,
  reviewViewExecute,
  reviewApproveUserExecute,
  reviewRevokeUserExecute,
} = require('./handlers/modHandlersReview');
const { helpDocsExecute } = require('./handlers/modHandlersHelp');

async function buildModData(client) {
  const b = new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Server moderation, invites, and review settings');

  b.addSubcommandGroup((g) =>
    g
      .setName('help')
      .setDescription('Web documentation and help')
      .addSubcommand((s) =>
        s
          .setName('docs')
          .setDescription('Open the full mod commands documentation on the web control panel'),
      ),
  );

  b.addSubcommandGroup((g) =>
    g
      .setName('blacklist')
      .setDescription('Invite blacklist (global targets)')
      .addSubcommand((s) =>
        s
          .setName('add-guild')
          .setDescription('Resolve an invite URL and blacklist the target guild')
          .addStringOption((o) => o.setName('invite').setDescription('Invite URL or code').setRequired(true))
          .addStringOption((o) => o.setName('reason').setDescription('Reason')),
      )
      .addSubcommand((s) =>
        s
          .setName('add-invite')
          .setDescription('Blacklist a raw invite code')
          .addStringOption((o) => o.setName('code').setDescription('Invite code').setRequired(true))
          .addStringOption((o) => o.setName('reason').setDescription('Reason')),
      )
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription('Remove by invite code or target guild id')
          .addStringOption((o) => o.setName('value').setDescription('Code or guild id').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('list').setDescription('List blacklisted guilds and codes (first 15)'))
      .addSubcommand((s) =>
        s
          .setName('check')
          .setDescription('Dry run: is this invite blacklisted?')
          .addStringOption((o) => o.setName('invite').setDescription('Invite URL or code').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('add-image-text')
          .setDescription('OCR text / domain pattern for scam image auto-enforcement')
          .addStringOption((o) => o.setName('pattern').setDescription('Pattern').setRequired(true))
          .addStringOption((o) =>
            o
              .setName('type')
              .setDescription('Match type')
              .setRequired(true)
              .addChoices(
                { name: 'keyword', value: 'keyword' },
                { name: 'domain', value: 'domain' },
                { name: 'regex', value: 'regex' },
              ),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName('add-image-hash')
          .setDescription('Add perceptual hash from a reference screenshot')
          .addAttachmentOption((o) =>
            o.setName('image').setDescription('Reference image (PNG/JPEG/WebP)').setRequired(true),
          )
          .addStringOption((o) => o.setName('description').setDescription('Optional label')),
      )
      .addSubcommand((s) => s.setName('list-image-text').setDescription('List OCR blacklist patterns (latest 25)'))
      .addSubcommand((s) => s.setName('list-image-hashes').setDescription('List image pHash entries (latest 25)')),
  );

  b.addSubcommandGroup((g) =>
    g
      .setName('review')
      .setDescription('Image / invite review channels and thresholds')
      .addSubcommand((s) =>
        s
          .setName('set')
          .setDescription('Update review settings (provide any fields to change)')
          .addChannelOption((o) =>
            o
              .setName('image_review_channel')
              .setDescription('Channel for flagged images')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
          )
          .addChannelOption((o) =>
            o
              .setName('invite_queue_channel')
              .setDescription('Channel for pending invite buttons')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
          )
          .addIntegerOption((o) =>
            o.setName('min_account_age_days').setDescription('Min account age (days) for image trust').setMinValue(0),
          )
          .addIntegerOption((o) =>
            o.setName('min_join_age_days').setDescription('Min days in server for image trust').setMinValue(0),
          )
          .addIntegerOption((o) =>
            o
              .setName('min_messages_for_image_trust')
              .setDescription('Min messages in this server (required with age gates; all must pass to skip review)')
              .setMinValue(0),
          )
          .addRoleOption((o) =>
            o
              .setName('mod_log_ping_role')
              .setDescription('Role to ping when posting to the mod log channel (blacklist / scam alerts)'),
          )
          .addBooleanOption((o) =>
            o
              .setName('mod_log_ping_clear')
              .setDescription('Set true to stop pinging a role on mod log posts'),
          ),
      )
      .addSubcommand((s) => s.setName('view').setDescription('Show current review settings'))
      .addSubcommand((s) =>
        s
          .setName('approve-user')
          .setDescription('Bypass image review for a member')
          .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('revoke-user')
          .setDescription('Remove image review bypass')
          .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
      ),
  );

  b.addSubcommandGroup((g) =>
    g
      .setName('warnings')
      .setDescription('Warnings')
      .addSubcommand((s) =>
        s
          .setName('warn')
          .setDescription('Issue a warning')
          .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
          .addStringOption((o) => o.setName('reason').setDescription('Reason')),
      )
      .addSubcommand((s) =>
        s
          .setName('warnings')
          .setDescription('List warnings for a user')
          .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
          .addIntegerOption((o) => o.setName('page').setDescription('Page').setMinValue(1)),
      )
      .addSubcommand((s) =>
        s
          .setName('delwarn')
          .setDescription('Delete a warning by id')
          .addStringOption((o) => o.setName('warn_id').setDescription('12-char warning id').setRequired(true)),
      ),
  );

  b.addSubcommandGroup((g) =>
    g
      .setName('bans')
      .setDescription('Bans')
      .addSubcommand((s) =>
        s
          .setName('list')
          .setDescription('List bans')
          .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
      )
      .addSubcommand((s) =>
        s
          .setName('unban')
          .setDescription('Unban a user')
          .addUserOption((o) => o.setName('user').setDescription('User'))
          .addStringOption((o) => o.setName('userid').setDescription('Raw user id')),
      ),
  );

  b.addSubcommandGroup((g) =>
    g
      .setName('cage')
      .setDescription('Cage roles')
      .addSubcommand((s) =>
        s
          .setName('apply')
          .setDescription('Apply a cage')
          .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
          .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
          .addStringOption((o) =>
            o
              .setName('cage_type')
              .setDescription('Cage role type')
              .setRequired(true)
              .addChoices(
                { name: 'Cage-OnTopic', value: '672595882562158592' },
                { name: 'Cage-Porn', value: '443850934850945054' },
                { name: 'Cage Memes', value: '790681121926938674' },
                { name: 'Cage VC', value: '985741349267570718' },
                { name: 'Server Cage', value: '330806236821848065' },
              ),
          )
          .addStringOption((o) => o.setName('duration').setDescription('e.g. 1h, 1d')),
      )
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription('Remove cage')
          .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('list').setDescription('List caged users')),
  );

  b.addSubcommandGroup((g) =>
    g
      .setName('xp')
      .setDescription('XP administration')
      .addSubcommand((s) =>
        s
          .setName('settings')
          .setDescription('Change server XP settings')
          .addStringOption((o) => o.setName('messages_per_xp').setDescription('Messages per XP'))
          .addStringOption((o) => o.setName('xp_multiplier').setDescription('XP multiplier'))
          .addStringOption((o) => o.setName('min_xp_per_message').setDescription('Min XP per gain'))
          .addStringOption((o) => o.setName('max_xp_per_message').setDescription('Max XP per gain'))
          .addStringOption((o) =>
            o
              .setName('message_xp_cooldown_sec')
              .setDescription('Seconds between message XP grants, per channel (default 60)'),
          )
          .addStringOption((o) =>
            o
              .setName('double_xp_days')
              .setDescription('Double XP days preset')
              .addChoices(...DOUBLE_XP_CHOICES),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName('user')
          .setDescription('Adjust user XP')
          .addStringOption((o) =>
            o
              .setName('option')
              .setDescription('XP adjustment action')
              .setRequired(true)
              .addChoices(
                { name: 'Add XP', value: 'add_xp' },
                { name: 'Remove XP', value: 'remove_xp' },
                { name: 'Set XP', value: 'set_xp' },
                { name: 'Set Level', value: 'set_level' },
              ),
          )
          .addUserOption((o) => o.setName('target').setDescription('User').setRequired(true))
          .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('doublexp').setDescription('Toggle double XP'))
      .addSubcommand((s) =>
        s
          .setName('import_rank')
          .setDescription('OCR import rank from image URL')
          .addStringOption((o) => o.setName('url').setDescription('Image URL').setRequired(true))
          .addUserOption((o) => o.setName('target').setDescription('User').setRequired(true)),
      ),
  );

  b.addSubcommandGroup((g) =>
    g
      .setName('server')
      .setDescription('Guild settings and utilities')
      .addSubcommand((s) =>
        s
          .setName('settings')
          .setDescription('Toggle server systems')
          .addStringOption((o) =>
            o
              .setName('option')
              .setDescription('Server system to toggle')
              .setRequired(true)
              .addChoices(
                { name: 'Enable XP System', value: 'xp_system' },
                { name: 'Enable Warning System', value: 'warning_system' },
                { name: 'Enable Image Archive', value: 'image_archive' },
                { name: 'Enable Level Up Message', value: 'level_up_message' },
              ),
          )
          .addChannelOption((o) => o.setName('level_up_channel').setDescription('Level up channel'))
          .addChannelOption((o) => o.setName('warning_channel').setDescription('Warning / mod log channel')),
      )
      .addSubcommand((s) =>
        s
          .setName('channel_settings')
          .setDescription('Paginated command_settings list')
          .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
      )
      .addSubcommand((s) =>
        s
          .setName('channel_stats')
          .setDescription('Channel statistics')
          .addStringOption((o) => o.setName('date').setDescription('Single date (YYYY-MM-DD or similar)'))
          .addIntegerOption((o) =>
            o.setName('month').setDescription('Month (1–12), use with year').setMinValue(1).setMaxValue(12),
          )
          .addIntegerOption((o) => o.setName('year').setDescription('Year (e.g. 2026), use with month')),
      )
      .addSubcommand((s) =>
        s
          .setName('copy_channel')
          .setDescription('Duplicate a channel')
          .addChannelOption((o) =>
            o
              .setName('to_copy')
              .setDescription('Source channel')
              .setRequired(true)
              .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildVoice,
                ChannelType.GuildCategory,
                ChannelType.GuildAnnouncement,
                ChannelType.GuildStageVoice,
                ChannelType.GuildForum,
                ChannelType.GuildMedia,
              ),
          )
          .addStringOption((o) =>
            o
              .setName('new_name')
              .setDescription('Name for the new channel')
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(100),
          ),
      )
      .addSubcommand((sub) => {
        sub
          .setName('update_command_settings')
          .setDescription('Set allowed channel for a command')
          .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true));
        augmentUpdateCommandSubcommand(sub);
        return sub;
      }),
  );

  b.addSubcommandGroup((g) =>
    g
      .setName('global')
      .setDescription('Global command lock')
      .addSubcommand((s) => s.setName('lock_on').setDescription('Turn global lock off (commands everywhere)'))
      .addSubcommand((s) =>
        s
          .setName('lock_off')
          .setDescription('Turn global lock on (whitelist only)'),
      )
      .addSubcommand((s) =>
        s
          .setName('whitelist')
          .setDescription('Set whitelist channel')
          .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true)),
      ),
  );

  return b;
}

async function execute(client, interaction) {
  const group = interaction.options.getSubcommandGroup(true);
  const sub = interaction.options.getSubcommand(true);

  const dispatch = {
    'blacklist:add-guild': blacklistAddGuildExecute,
    'blacklist:add-invite': blacklistAddInviteExecute,
    'blacklist:remove': blacklistRemoveExecute,
    'blacklist:list': blacklistListExecute,
    'blacklist:check': blacklistCheckExecute,
    'blacklist:add-image-text': blacklistAddImageTextExecute,
    'blacklist:add-image-hash': blacklistAddImageHashExecute,
    'blacklist:list-image-text': blacklistListImageTextExecute,
    'blacklist:list-image-hashes': blacklistListImageHashesExecute,
    'review:set': reviewSetExecute,
    'review:view': reviewViewExecute,
    'review:approve-user': reviewApproveUserExecute,
    'review:revoke-user': reviewRevokeUserExecute,
    'warnings:warn': warnExecute,
    'warnings:warnings': warningsListExecute,
    'warnings:delwarn': delwarnExecute,
    'bans:list': bansListExecute,
    'bans:unban': unbanExecute,
    'cage:apply': cageApplyExecute,
    'cage:remove': cageRemoveExecute,
    'cage:list': cageListExecute,
    'xp:settings': xpSettingsExecute,
    'xp:user': xpUserExecute,
    'xp:doublexp': xpDoubleExecute,
    'xp:import_rank': xpImportRankExecute,
    'server:settings': serverSettingsExecute,
    'server:channel_settings': channelSettingsExecute,
    'server:channel_stats': channelStatsExecute,
    'server:copy_channel': copyChannelExecute,
    'server:update_command_settings': updateCommandSettingsExecute,
    'global:lock_on': globalLockOnExecute,
    'global:lock_off': globalLockOffExecute,
    'global:whitelist': globalWhitelistExecute,
    'help:docs': helpDocsExecute,
  };

  const key = `${group}:${sub}`;
  const fn = dispatch[key];
  if (!fn) {
    return interaction.editReply({ content: 'Unknown subcommand.', ephemeral: true });
  }
  return fn(client, interaction);
}

module.exports = {
  category: path.basename(__dirname),
  data: buildModData,
  execute,
};
