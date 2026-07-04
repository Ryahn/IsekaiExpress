const BaseEvent = require('../../utils/structures/BaseEvent');
const { handleReactionChange } = require('../../../../libs/starboardManager');
const { isConfiguredGuild, logUnexpectedGuildOnce } = require('../../utils/singleGuildGuard');

module.exports = class MessageReactionRemoveEvent extends BaseEvent {
  constructor() {
    super('messageReactionRemove');
  }

  async run(client, reaction, user) {
    if (!reaction.message.guild) return;
    if (!isConfiguredGuild(client, reaction.message.guild.id)) {
      logUnexpectedGuildOnce(client, reaction.message.guild.id, 'messageReactionRemove');
      return;
    }

    try {
      if (reaction.partial) {
        await reaction.fetch();
      }
      await handleReactionChange(client, reaction, user, false);
    } catch (error) {
      client.logger.error('Starboard messageReactionRemove error:', error);
    }
  }
};
