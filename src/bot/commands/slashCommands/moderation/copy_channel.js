const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../../../utils/guildPrivileges');

/**
 * @param {import('discord.js').GuildForumTag} tag
 * @returns {import('discord.js').GuildForumTagData}
 */
function forumTagToData(tag) {
    return {
        name: tag.name,
        moderated: tag.moderated,
        emoji: tag.emoji
            ? { id: tag.emoji.id, name: tag.emoji.name }
            : null,
    };
}

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('copy_channel')
        .setDescription('Duplicate a channel (permissions and settings, not message history or pins).')
        .addChannelOption((opt) =>
            opt
                .setName('to_copy')
                .setDescription('The channel to duplicate')
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
        .addStringOption((opt) =>
            opt
                .setName('new_name')
                .setDescription('Name for the new channel')
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(100),
        ),

    async execute(client, interaction) {
        if (!interaction.inGuild()) {
            return interaction.editReply({ content: 'This command can only be used in a server.', ephemeral: true });
        }
        if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
            return interaction.editReply({
                content: 'You need Administrator permission or the configured staff role.',
                ephemeral: true,
            });
        }

        const source = interaction.options.getChannel('to_copy', true);
        const newName = interaction.options.getString('new_name', true).trim();

        if (!newName) {
            return interaction.editReply({ content: 'Channel name cannot be empty.', ephemeral: true });
        }
        if (source.isThread()) {
            return interaction.editReply({ content: 'You can only copy server channels, not threads.', ephemeral: true });
        }
        if (source.guildId !== interaction.guildId) {
            return interaction.editReply({ content: 'The channel must be in this server.', ephemeral: true });
        }

        const isVoice = source.type === ChannelType.GuildVoice || source.type === ChannelType.GuildStageVoice;
        const me = interaction.client.user;
        const perms = source.permissionsFor(me);
        if (!perms) {
            return interaction.editReply({
                content: 'Could not read permissions for that channel. Ensure the bot is in the server.',
                ephemeral: true,
            });
        }
        const required = isVoice
            ? (PermissionFlagsBits.ManageChannels | PermissionFlagsBits.Connect)
            : (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels);
        if (!perms.has(required)) {
            return interaction.editReply({
                content: `I need **Manage Channels** and **${isVoice ? 'Connect' : 'View Channel'}** on that channel to duplicate it.`,
                ephemeral: true,
            });
        }

        const reason = `Channel copy from #${source.name} (requested by ${interaction.user.tag})`;

        try {
            const created = await source.clone({ name: newName, reason });

            if (source.isThreadOnly()) {
                const edit = {};
                if (source.availableTags?.length) {
                    edit.availableTags = source.availableTags.map(forumTagToData);
                }
                if (source.defaultReactionEmoji) {
                    const d = source.defaultReactionEmoji;
                    if (d.id != null || d.name != null) {
                        edit.defaultReactionEmoji = { id: d.id, name: d.name };
                    }
                }
                if (source.defaultSortOrder != null) {
                    edit.defaultSortOrder = source.defaultSortOrder;
                }
                if (source.defaultForumLayout != null) {
                    edit.defaultForumLayout = source.defaultForumLayout;
                }
                if (source.defaultThreadRateLimitPerUser != null) {
                    edit.defaultThreadRateLimitPerUser = source.defaultThreadRateLimitPerUser;
                }
                if (source.defaultAutoArchiveDuration != null) {
                    edit.defaultAutoArchiveDuration = source.defaultAutoArchiveDuration;
                }
                if (Object.keys(edit).length > 0) {
                    await created.edit({ ...edit, reason });
                }
            }

            return interaction.editReply({ content: `Created ${created} — duplicate of <#${source.id}> as **${newName}**.` });
        } catch (err) {
            client.logger.error('copy_channel error:', err);
            const code = err?.code;
            if (code === 50013) {
                return interaction.editReply({ content: 'I do not have permission to create or edit that channel.', ephemeral: true });
            }
            if (code === 30016) {
                return interaction.editReply({ content: 'This server has reached the maximum number of channels.', ephemeral: true });
            }
            return interaction.editReply({
                content: 'Failed to copy the channel. Check the bot can manage channels and the name is valid.',
                ephemeral: true,
            });
        }
    },
};
