const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const crypto = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cards')
        .setDescription('List cards with pagination')
		.addStringOption(option => option.setName('search').setDescription('Search for a card by name, class, rarity, class, or type').setRequired(false)),

    async execute(client, interaction) {
        const hash = crypto.createHash('md5').update(module.exports.data.name).digest('hex');
        
        const allowedChannel = await client.db.getAllowedChannel(hash);
        const guild = client.guilds.cache.get(interaction.guild.id);
        const member = await guild.members.fetch(interaction.user.id);
        const roles = member.roles.cache.map(role => role.id);

        if (allowedChannel && (allowedChannel.channel_id === 'all' || allowedChannel.channel_id !== interaction.channel.id)) {
            if (!roles.some(role => client.allowed.includes(role))) {
                return interaction.reply({ 
                    content: `This command is not allowed in this channel. Please use in <#${allowedChannel.channel_id}>`, 
                    ephemeral: true 
                });
            }
        }

        let page = 1;
        const pageSize = 8;
        const timeout = 600000; // 10 minutes timeout
        let lastInteractionTime = Date.now();
		const search = interaction.options.getString('search') || '';

		function capitalizeFirstLetter(string) {
			return string.charAt(0).toUpperCase() + string.slice(1);
		  }

		const fetchCards = async (page) => {
			const offset = (page - 1) * pageSize;
			return await client.db.query('card_data')
				.select('*')
				.where('name', 'like', `%${search}%`)
				.orWhere('class', 'like', `%${capitalizeFirstLetter(search)}%`)
				.orWhere('rarity', 'like', `%${search.toUpperCase()}%`)
				.orWhere('image_url', 'like', `%${search.toLowerCase()}%`)
				.orderBy('created_at', 'desc')
				.offset(offset)
				.limit(pageSize);
		};

        const totalCards = await client.db.query('card_data')
            .count('* as count')
            .first();
        const totalPages = Math.ceil(totalCards.count / pageSize);

        const createCardEmbed = async (page) => {
            const cards = await fetchCards(page);
            if (!cards.length) {
                return null;
            }

            const embed = new MessageEmbed()
                .setTitle(`Cards - Page ${page}`)
                .setDescription(`Listing cards with pagination\n\`\`\`${client.config.emojis.type.trim()}: Type, ${client.config.emojis.level.trim()}: Level, ${client.config.emojis.power.trim()}: Power, ${client.config.emojis.class.trim()}: Class, ${client.config.emojis.star.trim()}: Stars\`\`\``);

            cards.forEach(card => {
                const type = card.image_url.split('/')[4];
                embed.addFields(
                    { name: `${card.name} (${card.rarity})`, value: `
                    ${client.config.emojis.type.trim()}: ${type} ${client.config.emojis.level.trim()}: ${card.level} ${client.config.emojis.power.trim()}: ${card.power} ${client.config.emojis.class.trim()}: ${card.class} ${client.config.emojis.star.trim()}: ${card.stars}\n
                    **ID:** ${card.uuid}` }
                );
            });

            return embed;
        };

        const embed = await createCardEmbed(page);
        if (!embed) {
            return interaction.reply({
                content: 'No cards found.',
                ephemeral: true
            });
        }

        const createButtons = () => {
            return new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId('previous')
                        .setLabel('Previous')
                        .setStyle('PRIMARY')
                        .setDisabled(page <= 1),
                    new MessageButton()
                        .setCustomId('next')
                        .setLabel('Next')
                        .setStyle('PRIMARY')
                        .setDisabled(page >= totalPages),
                    new MessageButton()
                        .setCustomId('cancel')
                        .setLabel('Cancel')
                        .setStyle('DANGER')
                );
        };

        const message = await interaction.reply({
            embeds: [embed],
            components: [createButtons()],
            fetchReply: true
        });

        const resetCollector = () => {
            lastInteractionTime = Date.now();
        };

        const checkTimeout = async () => {
            const elapsed = Date.now() - lastInteractionTime;
            if (elapsed >= timeout) {
                await message.edit({
                    components: []
                });
                clearInterval(interval);
            }
        };

        const interval = setInterval(checkTimeout, 5000); // Check every 5 seconds if timeout is exceeded

        const collector = message.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: timeout });

        collector.on('collect', async i => {
            if (i.customId === 'next' && page < totalPages) {
                page++;
            } else if (i.customId === 'previous' && page > 1) {
                page--;
            } else if (i.customId === 'cancel') {
                await i.update({
                    content: 'Operation cancelled.',
                    embeds: [],
                    components: []
                });
                collector.stop();
                return;
            }

            const updatedEmbed = await createCardEmbed(page);

            if (updatedEmbed) {
                await i.update({
                    embeds: [updatedEmbed],
                    components: [createButtons()]
                });
            }

            resetCollector(); // Reset the last interaction time
        });

        collector.on('end', () => {
            clearInterval(interval); // Clear the interval on end
            message.edit({
                components: []
            });
        });
    }
};
