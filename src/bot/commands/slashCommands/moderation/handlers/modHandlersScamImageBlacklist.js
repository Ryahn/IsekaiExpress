const { EmbedBuilder } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../../../../utils/guildPrivileges');
const { bustScamBlacklistCache, PHASH_BITS } = require('../../../../../../libs/scamImageScan');

async function assertStaff(interaction, client) {
  if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
    await interaction.editReply({ content: 'You need the staff role or Administrator.', ephemeral: true });
    return false;
  }
  return true;
}

async function blacklistAddImageTextExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const pattern = interaction.options.getString('pattern', true).trim();
  const type = interaction.options.getString('type', true);
  if (!pattern) {
    return interaction.editReply({ content: 'Pattern required.', ephemeral: true });
  }
  if (!['keyword', 'domain', 'regex'].includes(type)) {
    return interaction.editReply({ content: 'Invalid type.', ephemeral: true });
  }
  if (type === 'regex') {
    try {
      new RegExp(pattern, 'i');
    } catch {
      return interaction.editReply({ content: 'Invalid regex.', ephemeral: true });
    }
  }
  try {
    await client.db.insertImageTextBlacklist({
      pattern,
      pattern_type: type,
      added_by: interaction.user.id,
    });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
      return interaction.editReply({ content: 'That pattern + type already exists.', ephemeral: true });
    }
    throw e;
  }
  bustScamBlacklistCache();
  await interaction.editReply(`Added image text rule \`${type}\`: \`${pattern.slice(0, 200)}\``);
}

async function blacklistAddImageHashExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const att = interaction.options.getAttachment('image', true);
  const description = interaction.options.getString('description');
  const ct = att.contentType || '';
  const name = (att.name || '').toLowerCase();
  const okMime = ct.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name);
  if (!okMime) {
    return interaction.editReply({ content: 'Attach a PNG, JPEG, or WebP image.', ephemeral: true });
  }
  const imghash = require('imghash');
  const axios = require('axios');
  let buf;
  try {
    const res = await axios.get(att.url, { responseType: 'arraybuffer', timeout: 25000, maxContentLength: 12 * 1024 * 1024 });
    buf = Buffer.from(res.data);
  } catch (e) {
    return interaction.editReply({ content: `Could not download attachment: ${e.message}`, ephemeral: true });
  }
  let phash;
  try {
    phash = await imghash.hash(buf, PHASH_BITS);
  } catch (e) {
    return interaction.editReply({ content: `Could not hash image: ${e.message}`, ephemeral: true });
  }
  await client.db.insertImageHashBlacklist({
    phash,
    description: description || att.name || null,
    added_by: interaction.user.id,
  });
  bustScamBlacklistCache();
  await interaction.editReply(`Stored pHash \`${phash}\` (${PHASH_BITS} bits).`);
}

async function blacklistListImageTextExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const rows = await client.db.listImageTextBlacklist(25);
  const embed = new EmbedBuilder()
    .setTitle('Image text blacklist (latest 25)')
    .setColor(0xe74c3c)
    .setDescription(
      rows.length ? rows.map((r) => `\`${r.id}\` [${r.pattern_type}] ${r.pattern}`).join('\n') : '—',
    );
  await interaction.editReply({ embeds: [embed] });
}

async function blacklistListImageHashesExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const rows = await client.db.listImageHashBlacklist(25);
  const embed = new EmbedBuilder()
    .setTitle('Image pHash blacklist (latest 25)')
    .setColor(0xe74c3c)
    .setDescription(
      rows.length
        ? rows.map((r) => `\`${r.id}\` \`${r.phash}\`${r.description ? ` — ${r.description}` : ''}`).join('\n')
        : '—',
    );
  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  blacklistAddImageTextExecute,
  blacklistAddImageHashExecute,
  blacklistListImageTextExecute,
  blacklistListImageHashesExecute,
};
