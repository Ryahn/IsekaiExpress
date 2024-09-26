const BaseEvent = require('../../utils/structures/BaseEvent');
const { getConnection } = require('../../../database/db');
const StateManager = require('../../utils/StateManager');
const path = require('path');



module.exports = class InteractionEvent extends BaseEvent {
    constructor() {
        super('interactionCreate');
    }
    async run (client, interaction) {

        if (!interaction.isCommand()) return;

        const command = client.slashCommands.get(interaction.commandName)
        if(!command) return;

        try {
            await command.execute(client, interaction)
        } catch (err) {
            console.log(err)

            await interaction.reply({
                content: `An error occurred while executing this command.`,
                ephemeral: true
            });
        }
    }
}