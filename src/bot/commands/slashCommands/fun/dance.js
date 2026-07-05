const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { fetchImageForInteraction } = require('../../../utils/imgApi');
const config = require('../../../../../config');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('dance')
        .setDescription("Keep On Ravin' Baby")
        .addUserOption(option => option.setName('target').setDescription('The user you want to dance with')),

    async execute(client, interaction) {
        
        
        const { getRandomColor } = client.utils;

        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'dance');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        try {

            let targetUser = interaction.options.getUser('target');

            // Use rate limiting for the API call
            if (!config.imgApi.apiKey) {
                return interaction.editReply({
                    content: 'This command needs `IMG_API_KEY` in the environment.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const { url: img } = await fetchImageForInteraction(client, { category: 'sfw', type: 'dance' });

            let people = ['with everyone',
                'with a random person',
                'with OEJ',
                'with M4zy',
                'with Astolfokyun1',
                'with Ryahn',
                'with Sam',
                'with a furry',
                'with a 12 foot dildo',
                'with a dakimakura',
                'with a waifu',
                'with a husbando'];
            let random = Math.floor(Math.random() * people.length);

            let danceTarget = targetUser ? `${targetUser}` : people[random];
            const embed = new EmbedBuilder()
                .setDescription(`${interaction.user} dances ${danceTarget}`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the dance command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};