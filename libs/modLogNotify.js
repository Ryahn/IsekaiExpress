/**
 * Optional role ping for posts to the guild mod log channel (modLogId).
 * @param {object} cfg Row from getGuildConfigurable (expects mod_log_ping_role_id)
 * @param {import('discord.js').MessageCreateOptions} options Arguments for TextChannel.send
 * @returns {import('discord.js').MessageCreateOptions}
 */
function withModLogRolePing(cfg, options = {}) {
  const roleId = cfg?.mod_log_ping_role_id != null ? String(cfg.mod_log_ping_role_id).trim() : '';
  if (!roleId) {
    return { ...options };
  }
  const ping = `<@&${roleId}>`;
  const base = options.content != null && String(options.content).length ? String(options.content) : '';
  const content = base ? `${ping}\n${base}` : ping;
  return {
    ...options,
    content,
    allowedMentions: { roles: [roleId] },
  };
}

module.exports = { withModLogRolePing };
