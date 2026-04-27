/**
 * /mod help docs — link to the web mod command reference (ephemeral; site enforces Staff/Mod).
 */
async function helpDocsExecute(client, interaction) {
  const publicBase = String(client.config.url || '').replace(/\/$/, '') || 'http://localhost:3000';
  const href = `${publicBase}/modhelp`;
  return interaction.editReply({
    content: [
      `**Mod commands documentation (web)**\n${href}`,
      'Log in to the control panel with Discord. This page is only for users with the configured **Staff** or **Mod** role.',
    ].join('\n'),
    ephemeral: true,
  });
}

module.exports = { helpDocsExecute };
