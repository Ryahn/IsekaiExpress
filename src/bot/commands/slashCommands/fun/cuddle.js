const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('cuddle')
        .setDescription("that's lewd")
        .addUserOption(option => option.setName('target').setDescription('The user you want to cuddle with')),

    async execute(client, interaction) {

        
        
        const { getRandomColor } = client.utils;

        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'cuddle');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true
            });
        }

        try {
            await interaction.deferReply();
            let targetUser = interaction.options.getUser('target');

            // Use rate limiting for the API call
            const img = await client.rateLimitHandler.executeWithRateLimit('nekos-best-api', async () => {
                const response = await fetchRandom('cuddle');
                return response.results[0].url;
            });

            let people = [
                'a random person',
                'OEJ',
                'M4zy',
                'Astolfokyun1',
                'Ryahn',
                'Sam',
                'a furry',
                'a 12 foot dildo',
                'a dakimakura',
                'a waifu',
                'a husbando'
            ];
            let random = Math.floor(Math.random() * people.length);

            let cuddleTarget = targetUser ? `${targetUser}` : people[random];
            const embed = new EmbedBuilder()
                .setDescription(`${interaction.user} cuddles ${cuddleTarget}`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the cuddle command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};