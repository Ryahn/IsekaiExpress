const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('fuck')
        .setDescription('bang someone really hard')
        .addUserOption(option => option.setName('target').setDescription('the person you want to bang').setRequired(true)),

    async execute(client, interaction) {

        

        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'fuck');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        
        const { getRandomColor } = client.utils;
        try {

            const user = interaction.options.getUser('target');


            if (interaction.channel.nsfw) {
                const response = await client.rateLimitHandler.executeWithRateLimit('eckigerluca-api', async () => {
                    return await fetch('https://eckigerluca.com/api/fuck');
                });
                const data = await response.json();

                const embed = new EmbedBuilder()
                    .setDescription(`${interaction.user} bangs the shit out of ${user}`)
                    .setColor(`#${getRandomColor()}`)
                    .setImage(data.image);
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply('This command can only be used in NSFW channels!');
            }
        } catch (error) {
            client.logger.error('Error executing the fuck command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};