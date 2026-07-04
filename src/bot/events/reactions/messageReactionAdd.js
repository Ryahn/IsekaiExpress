const BaseEvent = require('../../utils/structures/BaseEvent');
const { handleReactionChange } = require('../../../../libs/starboardManager');
const { isConfiguredGuild, logUnexpectedGuildOnce } = require('../../utils/singleGuildGuard');

module.exports = class MessageReactionAddEvent extends BaseEvent {
  constructor() {
    super('messageReactionAdd');
  }

  async run(client, reaction, user) {
    if (!reaction.message.guild) return;
    if (!isConfiguredGuild(client, reaction.message.guild.id)) {
      logUnexpectedGuildOnce(client, reaction.message.guild.id, 'messageReactionAdd');
      return;
    }

    try {
      if (reaction.partial) {
        await reaction.fetch();
      }
      await handleReactionChange(client, reaction, user, true);
    } catch (error) {
      client.logger.error('Starboard messageReactionAdd error:', error);
    }
  }
};
