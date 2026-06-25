const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const {
  hasGuildAdminOrStaffRole,
  hasGuildAdminOrModRole,
} = require('./guildPrivileges');

/**
 * Send an ephemeral denial without ever throwing or double-replying.
 *
 * The `mod` command defers publicly (interactionCreate.js calls `deferReply()` with no
 * ephemeral flag), so a plain `editReply({ flags: Ephemeral })` would stay PUBLIC — the
 * ephemeral flag is ignored once a non-ephemeral reply is acknowledged. To keep denials
 * private we delete the public placeholder and follow up ephemerally in that case.
 *
 * @param {import('discord.js').RepliableInteraction} interaction
 * @param {string} content
 */
async function denyEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred && interaction.ephemeral === false) {
      // Public defer already acknowledged — cannot downgrade it to ephemeral in place.
      await interaction.deleteReply().catch(() => {});
      await interaction.followUp(payload);
    } else if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (_) {
    // Last-ditch fallback; swallow so a denial can never crash the handler.
    try {
      await interaction.followUp(payload);
    } catch (__) {
      /* ignore */
    }
  }
}

/**
 * Resolve the caller's GuildMember from any repliable interaction. Returns null when the
 * interaction is not in a guild or the member could not be resolved.
 * @param {import('discord.js').RepliableInteraction} interaction
 */
function getCallerMember(interaction) {
  if (!interaction.inGuild || !interaction.inGuild()) return null;
  return interaction.member || null;
}

/**
 * Internal: run a role predicate against the CALLER (never the target), deny ephemerally on fail.
 * @returns {Promise<boolean>} true when allowed (caller may proceed)
 */
async function guard(interaction, predicate, denialMessage) {
  const member = getCallerMember(interaction);
  if (!member) {
    await denyEphemeral(interaction, 'This action can only be used in a server.');
    return false;
  }
  let ok = false;
  try {
    ok = Boolean(predicate(member));
  } catch (_) {
    ok = false;
  }
  if (!ok) {
    await denyEphemeral(interaction, denialMessage);
    return false;
  }
  return true;
}

/**
 * Staff lane: Guild Administrator or the configured staff role.
 * Use for server/guild configuration changes that are not destructive moderation.
 * @returns {Promise<boolean>}
 */
function requireStaff(client, interaction) {
  const staffRoleId = client.config?.roles?.staff;
  return guard(
    interaction,
    (member) => hasGuildAdminOrStaffRole(member, staffRoleId),
    'You need Administrator permission or the configured staff role to do that.',
  );
}

/**
 * Moderator lane: Guild Administrator, the configured staff role, or the configured mod role.
 * Use for moderation/XP actions against users (warn, cage, adjust XP).
 * @returns {Promise<boolean>}
 */
function requireModerator(client, interaction) {
  const staffRoleId = client.config?.roles?.staff;
  const modRoleId = client.config?.roles?.mod;
  return guard(
    interaction,
    (member) => hasGuildAdminOrModRole(member, staffRoleId, modRoleId),
    'You need to be a moderator (Administrator, staff, or mod role) to do that.',
  );
}

/**
 * Guild manager lane: Guild Administrator, the Manage Server permission, or the staff role.
 * Use for server-wide configuration toggles (XP system, level-up, image archive, warnings).
 * @returns {Promise<boolean>}
 */
function requireGuildManager(client, interaction) {
  const staffRoleId = client.config?.roles?.staff;
  return guard(
    interaction,
    (member) =>
      member.permissions?.has(PermissionFlagsBits.ManageGuild) ||
      hasGuildAdminOrStaffRole(member, staffRoleId),
    'You need Manage Server permission, Administrator, or the configured staff role to do that.',
  );
}

module.exports = {
  denyEphemeral,
  requireStaff,
  requireModerator,
  requireGuildManager,
};
