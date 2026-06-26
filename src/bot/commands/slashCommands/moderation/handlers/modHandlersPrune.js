const { PermissionFlagsBits } = require('discord.js');
const { denyEphemeral, requireModerator } = require('../../../../utils/permissionGuards');

const DEFAULT_PRUNE_LIMIT = 10;
const MAX_PRUNE_LIMIT = 50;
const FETCH_LIMIT = 100;
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function isBulkDeleteEligible(message, now = Date.now()) {
  return now - message.createdTimestamp < BULK_DELETE_MAX_AGE_MS;
}

function matchesPruneType(message, type) {
  switch (type) {
    case 'all':
      return true;
    case 'bot':
      return Boolean(message.author?.bot);
    case 'user':
      return !message.author?.bot;
    case 'embed':
      return message.embeds?.length > 0;
    case 'attachment':
      return message.attachments?.size > 0;
    default:
      return false;
  }
}

function matchesPruneFilters(message, type, targetUser) {
  if (!matchesPruneType(message, type)) return false;
  if (!targetUser) return true;
  return message.author?.id === targetUser.id;
}

function isProtectedInteractionReply(message, interactionReplyId) {
  return Boolean(interactionReplyId && message.id === interactionReplyId);
}

async function resolveBotMember(interaction) {
  if (interaction.guild.members.me) return interaction.guild.members.me;
  return interaction.guild.members.fetchMe();
}

async function fetchInteractionReplyId(interaction, channel) {
  if (channel.id !== interaction.channelId) return null;

  try {
    const reply = await interaction.fetchReply();
    return reply?.id ?? null;
  } catch (_) {
    return null;
  }
}

async function sendPruneReply(interaction, payload) {
  try {
    await interaction.editReply(payload);
  } catch (error) {
    if (error?.code !== 10008) throw error;
    await interaction.followUp(payload);
  }
}

async function requireManageMessages(interaction, channel, member, subject) {
  const permissions = channel.permissionsFor(member);
  if (permissions?.has(PermissionFlagsBits.ManageMessages)) return true;

  await denyEphemeral(interaction, `${subject} needs Manage Messages in ${channel}.`);
  return false;
}

function formatPruneSummary({ deletedCount, requestedCount, channel, type, targetUser, skippedOldCount, matchedCount }) {
  const filters = [`type: \`${type}\``];
  if (targetUser) filters.push(`user: ${targetUser}`);

  const notes = [];
  if (deletedCount < requestedCount) {
    notes.push(`only ${matchedCount} matching recent message${matchedCount === 1 ? '' : 's'} found`);
  }
  if (skippedOldCount > 0) {
    notes.push(`${skippedOldCount} matching message${skippedOldCount === 1 ? '' : 's'} skipped because Discord cannot bulk-delete messages older than 14 days`);
  }

  const noteText = notes.length ? ` (${notes.join('; ')})` : '';
  return `Deleted ${deletedCount} message${deletedCount === 1 ? '' : 's'} from ${channel} (${filters.join(', ')})${noteText}.`;
}

async function pruneExecute(client, interaction) {
  if (!(await requireModerator(client, interaction))) return;

  const channel = interaction.options.getChannel('channel', true);
  const type = interaction.options.getString('type', true);
  const requestedCount = interaction.options.getInteger('number') ?? DEFAULT_PRUNE_LIMIT;
  const targetUser = interaction.options.getUser('user');

  if (!channel.isTextBased?.() || !channel.bulkDelete) {
    await denyEphemeral(interaction, 'That channel does not support message pruning.');
    return;
  }

  if (requestedCount < 1 || requestedCount > MAX_PRUNE_LIMIT) {
    await denyEphemeral(interaction, `Please choose between 1 and ${MAX_PRUNE_LIMIT} messages.`);
    return;
  }

  if (!(await requireManageMessages(interaction, channel, interaction.member, 'You'))) return;

  let botMember;
  try {
    botMember = await resolveBotMember(interaction);
  } catch (error) {
    client.logger.error('Could not resolve bot member for prune command:', error);
    await sendPruneReply(interaction, 'Could not verify my channel permissions. Please try again.');
    return;
  }

  if (!(await requireManageMessages(interaction, channel, botMember, 'I'))) return;

  try {
    const interactionReplyId = await fetchInteractionReplyId(interaction, channel);
    const fetchedMessages = await channel.messages.fetch({ limit: FETCH_LIMIT });
    const now = Date.now();
    let skippedOldCount = 0;
    const matchingMessages = fetchedMessages.filter((message) => {
      if (isProtectedInteractionReply(message, interactionReplyId)) return false;
      if (!matchesPruneFilters(message, type, targetUser)) return false;
      if (isBulkDeleteEligible(message, now)) return true;
      skippedOldCount += 1;
      return false;
    });
    const messagesToDelete = matchingMessages.first(requestedCount);

    if (messagesToDelete.length === 0) {
      const oldMessageNote =
        skippedOldCount > 0
          ? ` ${skippedOldCount} matching message${skippedOldCount === 1 ? ' was' : 's were'} too old for Discord bulk delete.`
          : '';
      await sendPruneReply(interaction, `No matching recent messages found in ${channel}.${oldMessageNote}`);
      return;
    }

    const deletedMessages = await channel.bulkDelete(messagesToDelete, true);
    await sendPruneReply(
      interaction,
      formatPruneSummary({
        deletedCount: deletedMessages.size,
        requestedCount,
        channel,
        type,
        targetUser,
        skippedOldCount,
        matchedCount: matchingMessages.size,
      }),
    );
  } catch (error) {
    client.logger.error('Error executing prune command:', error);
    await sendPruneReply(interaction, 'An error occurred while pruning messages.');
  }
}

module.exports = {
  pruneExecute,
  isProtectedInteractionReply,
  matchesPruneFilters,
  matchesPruneType,
  isBulkDeleteEligible,
};
