const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');
   
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('stare')
        .setDescription("STaLKER!")
        .addUserOption(option => option.setName('target').setDescription('The user you want to stare at')),

    async execute(client, interaction) {

        
        
        const { getRandomColor } = client.utils;
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'stare');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        try {

            let targetUser = interaction.options.getUser('target');

            const response = await client.rateLimitHandler.executeWithRateLimit('nekos-best', async () => {
                return await fetchRandom('stare');
            });
            const data = await response.json();
            const img = data.results[0].url;

            let people = [
                'at random person',
                'at OEJ',
                'at M4zy',
                'at Astolfokyun1',
                'at Ryahn',
                'at Sam',
                'at furry',
                'at 12 foot dildo',
                'at dakimakura',
                'at waifu',
                'at husbando'];
            let random = Math.floor(Math.random() * people.length);
        

            let stareTarget = targetUser ? `${targetUser}` : people[random];

            const embed = new EmbedBuilder()
                .setDescription(`${interaction.user} stares ${stareTarget}`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the stare command:', error);
            await interaction.editReply('Something went wrong.');
        }
    },
};