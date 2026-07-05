const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { fetchImageForInteraction } = require('../../../utils/imgApi');
const config = require('../../../../../config');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('poke')
        .setDescription("poke poke poke poke poke")
        .addUserOption(option => option.setName('target').setDescription('The user you want to poke')),

    async execute(client, interaction) {

        
        
        const { getRandomColor } = client.utils;
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'poke');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
        try {

            let targetUser = interaction.options.getUser('target');

            if (!config.imgApi.apiKey) {
                return interaction.editReply({
                    content: 'This command needs `IMG_API_KEY` in the environment.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const { url: img } = await fetchImageForInteraction(client, { category: 'sfw', type: 'poke' });

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
            'a husbando'];
        let random = Math.floor(Math.random() * people.length);
       

        let pokeTarget = targetUser ? `${targetUser}` : people[random];
        const embed = new EmbedBuilder()
            .setDescription(`${interaction.user} pokes ${pokeTarget}`)
            .setColor(`#${getRandomColor()}`)
            .setImage(img);

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        client.logger.error('Error executing the poke command:', error);
        if (!interaction.replied) {
            await interaction.editReply('Something went wrong.');
        }
    }
    },
};