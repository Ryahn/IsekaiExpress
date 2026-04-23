const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cards')
        .setDescription('List cards with pagination')
		.addStringOption(option => option.setName('search').setDescription('Search for a card by name, class, rarity, class, or type').setRequired(false)),

    async execute(client, interaction) {
        

        let page = 1;
        const pageSize = 8;
        const timeout = 600000; // 10 minutes timeout
        let lastInteractionTime = Date.now();
		const search = interaction.options.getString('search') || '';

		function capitalizeFirstLetter(string) {
			return string.charAt(0).toUpperCase() + string.slice(1);
		  }

		const searchScope = (qb) => {
			if (!search) return qb;
			return qb.where(function whereSearch() {
				this.where('name', 'like', `%${search}%`)
					.orWhere('class', 'like', `%${capitalizeFirstLetter(search)}%`)
					.orWhere('rarity', 'like', `%${search.toUpperCase()}%`)
					.orWhere('image_url', 'like', `%${search.toLowerCase()}%`);
			});
		};

		const fetchCards = async (page) => {
			const offset = (page - 1) * pageSize;
			const q = searchScope(client.db.query('card_data').select('*'));
			return q
				.orderBy('created_at', 'desc')
				.offset(offset)
				.limit(pageSize);
		};

        const totalRow = await searchScope(
			client.db.query('card_data').count('* as count')
		).first();
        const totalCount = Number(totalRow ? totalRow.count : 0);
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

        const createCardEmbed = async (page) => {
            const cards = await fetchCards(page);
            if (!cards.length) {
                return null;
            }

            const embed = new EmbedBuilder()
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
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page <= 1),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages),
                    new ButtonBuilder()
                        .setCustomId('cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
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
