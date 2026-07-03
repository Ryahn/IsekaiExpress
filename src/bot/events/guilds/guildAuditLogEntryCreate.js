const BaseEvent = require('../../utils/structures/BaseEvent');
const { isConfiguredGuild, logUnexpectedGuildOnce } = require('../../utils/singleGuildGuard');
const { recordFromAuditLog } = require('../../../../libs/moderationActionLog');

module.exports = class GuildAuditLogEntryCreateEvent extends BaseEvent {
  constructor() {
    super('guildAuditLogEntryCreate');
  }

  async run(client, auditLogEntry) {
    const guildId = auditLogEntry.guild?.id;
    if (!isConfiguredGuild(client, guildId)) {
      logUnexpectedGuildOnce(client, guildId, 'guildAuditLogEntryCreate');
      return;
    }

    try {
      await recordFromAuditLog(client, auditLogEntry);
    } catch (error) {
      client.logger.error('guildAuditLogEntryCreate moderation log failed', error);
    }
  }
};
