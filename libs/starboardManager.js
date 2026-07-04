const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { reactionEmojiMatches } = require('./starboardSettings');
const { hasStarboardRole } = require('./starboardAuth');

const CONTENT_LIMIT = 2000;
const DESCRIPTION_LIMIT = 4096;

async function fetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  return channel && channel.isTextBased?.() ? channel : null;
}

function isImageAttachment(attachment) {
  const type = attachment.contentType || '';
  if (type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(attachment.name || attachment.url || '');
}

function buildStarboardPayload(sourceMessage, starCount) {
  const channelName = sourceMessage.channel?.name || 'unknown';
  const author = sourceMessage.author;
  const jumpUrl = sourceMessage.url;

  const descriptionParts = [
    `**[Jump to message](${jumpUrl})** in <#${sourceMessage.channel.id}>`,
  ];

  if (sourceMessage.content) {
    descriptionParts.push(sourceMessage.content.slice(0, CONTENT_LIMIT));
  }

  const attachments = [...sourceMessage.attachments.values()];
  const imageAttachments = attachments.filter(isImageAttachment);
  const otherAttachments = attachments.filter((a) => !isImageAttachment(a));

  if (otherAttachments.length) {
    descriptionParts.push(
      otherAttachments.map((a) => `[${a.name || 'attachment'}](${a.url})`).join('\n'),
    );
  }

  const description = descriptionParts.join('\n\n').slice(0, DESCRIPTION_LIMIT) || '*No text content*';

  const headerEmbed = new EmbedBuilder()
    .setAuthor({
      name: author?.tag || 'Unknown user',
      iconURL: author?.displayAvatarURL?.() || undefined,
    })
    .setDescription(description)
    .setFooter({ text: `⭐ ${starCount} | #${channelName}` })
    .setTimestamp(sourceMessage.createdAt);

  if (imageAttachments.length) {
    headerEmbed.setImage(imageAttachments[0].url);
  }

  const copiedEmbeds = (sourceMessage.embeds || [])
    .slice(0, 9)
    .map((embed) => EmbedBuilder.from(embed));

  const embeds = [headerEmbed, ...copiedEmbeds].slice(0, 10);

  return {
    content: author ? `<@${author.id}>` : null,
    embeds,
  };
}

async function getStarCount(message, settings) {
  let fullMessage = message;
  if (fullMessage.partial) {
    fullMessage = await fullMessage.fetch();
  }

  let reaction = fullMessage.reactions.cache.find((r) => reactionEmojiMatches(r.emoji, settings.emoji));
  if (!reaction) return 0;

  if (reaction.partial) {
    reaction = await reaction.fetch();
  }

  return reaction.count || 0;
}

async function deleteStarboardPost(client, guild, entry, settings) {
  const starboardChannel = await fetchTextChannel(guild, settings?.channelId);
  if (starboardChannel && entry.starboard_message_id) {
    const msg = await starboardChannel.messages.fetch(entry.starboard_message_id).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }

  await client.db.deleteStarboardEntry(guild.id, entry.source_message_id);
}

async function updateStarboardPost(client, guild, entry, sourceMessage, settings, starCount) {
  const starboardChannel = await fetchTextChannel(guild, settings.channelId);
  if (!starboardChannel) return;

  const starboardMessage = await starboardChannel.messages.fetch(entry.starboard_message_id).catch(() => null);
  if (!starboardMessage) {
    await client.db.deleteStarboardEntry(guild.id, sourceMessage.id);
    return;
  }

  const payload = buildStarboardPayload(sourceMessage, starCount);
  await starboardMessage.edit(payload);

  await client.db.upsertStarboardEntry({
    guildId: guild.id,
    sourceChannelId: sourceMessage.channel.id,
    sourceMessageId: sourceMessage.id,
    starboardMessageId: starboardMessage.id,
    starCount,
  });
}

async function createStarboardPost(client, guild, sourceMessage, settings, starCount) {
  const starboardChannel = await fetchTextChannel(guild, settings.channelId);
  if (!starboardChannel) return null;

  const me = guild.members.me;
  const perms = starboardChannel.permissionsFor(me);
  if (
    !perms?.has(PermissionFlagsBits.ViewChannel) ||
    !perms?.has(PermissionFlagsBits.SendMessages) ||
    !perms?.has(PermissionFlagsBits.EmbedLinks)
  ) {
    client.logger.warn('Starboard channel missing required bot permissions.');
    return null;
  }

  const payload = buildStarboardPayload(sourceMessage, starCount);
  const sent = await starboardChannel.send(payload);

  await client.db.upsertStarboardEntry({
    guildId: guild.id,
    sourceChannelId: sourceMessage.channel.id,
    sourceMessageId: sourceMessage.id,
    starboardMessageId: sent.id,
    starCount,
  });

  return sent;
}

async function syncStarboard(client, guild, sourceMessage, settings, starCount) {
  const entry = await client.db.getStarboardEntry(guild.id, sourceMessage.id);
  const threshold = settings.threshold;

  if (starCount < threshold) {
    if (entry) {
      await deleteStarboardPost(client, guild, entry, settings);
    }
    return;
  }

  if (entry) {
    if (Number(entry.star_count) === starCount) return;
    await updateStarboardPost(client, guild, entry, sourceMessage, settings, starCount);
    return;
  }

  await createStarboardPost(client, guild, sourceMessage, settings, starCount);
}

async function handleReactionChange(client, reaction, user, added) {
  if (!reaction.message.guild || user.bot) return;

  const guild = reaction.message.guild;
  const settings = await client.db.getStarboardSettings(guild.id);

  if (!settings.enabled || !settings.emoji || !settings.channelId) return;
  if (!reactionEmojiMatches(reaction.emoji, settings.emoji)) return;

  if (String(reaction.message.channel.id) === String(settings.channelId)) return;

  let message = reaction.message;
  if (message.partial) {
    message = await message.fetch().catch(() => null);
  }
  if (!message || message.author?.bot) return;

  const member =
    message.guild.members.cache.get(user.id) ||
    (await message.guild.members.fetch(user.id).catch(() => null));

  if (added) {
    if (user.id === message.author.id) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    if (!hasStarboardRole(client, member, settings)) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }
  }

  const starCount = await getStarCount(message, settings);
  await syncStarboard(client, guild, message, settings, starCount);
}

/**
 * Manually post or refresh a message on the starboard, bypassing the star threshold.
 * @returns {{ starCount: number, updated: boolean }}
 */
async function manualAddToStarboard(client, guild, sourceMessage, settings) {
  if (!settings.enabled) {
    throw new Error('The starboard is not enabled.');
  }
  if (!settings.channelId) {
    throw new Error('No starboard channel is configured.');
  }
  if (String(sourceMessage.channel.id) === String(settings.channelId)) {
    throw new Error('Cannot add a message from the starboard channel itself.');
  }

  let starCount = settings.emoji ? await getStarCount(sourceMessage, settings) : 0;
  if (starCount < settings.threshold) {
    starCount = settings.threshold;
  }

  const entry = await client.db.getStarboardEntry(guild.id, sourceMessage.id);
  if (entry) {
    await updateStarboardPost(client, guild, entry, sourceMessage, settings, starCount);
    return { starCount, updated: true };
  }

  const sent = await createStarboardPost(client, guild, sourceMessage, settings, starCount);
  if (!sent) {
    throw new Error('Could not post to the starboard channel. Check bot permissions.');
  }

  return { starCount, updated: false };
}

module.exports = {
  buildStarboardPayload,
  getStarCount,
  handleReactionChange,
  syncStarboard,
  manualAddToStarboard,
};
