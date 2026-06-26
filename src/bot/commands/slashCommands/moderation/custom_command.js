const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');
const {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { requireStaff } = require('../../../utils/permissionGuards');

const CONTENT_LIMIT = 4000;
const NAME_LIMIT = 64;
const ADD_MODAL_ID = 'custom_command:add';
const EDIT_MODAL_PREFIX = 'custom_command:edit:';

function truncate(value, max = 300) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function formatUnix(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  return `<t:${Math.floor(n)}:f>`;
}

function buildCommandModal({ customId, title, name = '', content = '' }) {
  const nameInput = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Command name')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(NAME_LIMIT)
    .setRequired(true);

  if (name) {
    nameInput.setValue(String(name));
  }

  const contentInput = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('Command content')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(CONTENT_LIMIT)
    .setRequired(true);

  if (content) {
    contentInput.setValue(String(content));
  }

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(contentInput),
    );
}

function getModalValues(interaction) {
  return {
    name: interaction.fields.getTextInputValue('name'),
    content: interaction.fields.getTextInputValue('content'),
  };
}

async function handleModalResult(interaction, result, successMessage) {
  if (!result.ok) {
    return interaction.reply({
      content: result.message || 'Could not save the custom command.',
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: successMessage(result.command),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCustomCommandModalSubmit(client, interaction) {
  if (!interaction.customId?.startsWith('custom_command:')) return false;
  if (!(await requireStaff(client, interaction))) return true;

  const { name, content } = getModalValues(interaction);

  if (interaction.customId === ADD_MODAL_ID) {
    const result = await client.db.createCustomCommand({
      name,
      content,
      userId: interaction.user.id,
    });
    await handleModalResult(
      interaction,
      result,
      (command) => `Custom command \`${command.name}\` created with id \`${command.id}\`.`,
    );
    return true;
  }

  if (interaction.customId.startsWith(EDIT_MODAL_PREFIX)) {
    const identifier = interaction.customId.slice(EDIT_MODAL_PREFIX.length);
    const result = await client.db.updateCustomCommand({
      identifier,
      name,
      content,
      userId: interaction.user.id,
    });
    await handleModalResult(
      interaction,
      result,
      (command) => `Custom command \`${command.name}\` updated.`,
    );
    return true;
  }

  return false;
}

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('custom_command')
    .setDescription('Manage prefix custom commands')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a custom prefix command')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Command name, without the prefix')
            .setRequired(true)
            .setMaxLength(NAME_LIMIT),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a custom prefix command')
        .addStringOption((opt) =>
          opt
            .setName('identifier')
            .setDescription('Command id or name')
            .setRequired(true)
            .setMaxLength(NAME_LIMIT),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('get_info')
        .setDescription('Show information about a custom prefix command')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Command id or name')
            .setRequired(true)
            .setMaxLength(NAME_LIMIT),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit a custom prefix command')
        .addStringOption((opt) =>
          opt
            .setName('identifier')
            .setDescription('Command id or name')
            .setRequired(true)
            .setMaxLength(NAME_LIMIT),
        ),
    ),

  async execute(client, interaction) {
    if (!(await requireStaff(client, interaction))) return;

    const sub = interaction.options.getSubcommand(true);

    if (sub === 'add') {
      const name = interaction.options.getString('name', true);
      const nameCheck = client.db.validateCustomCommandName(name);
      if (!nameCheck.ok) {
        return interaction.reply({ content: nameCheck.message, flags: MessageFlags.Ephemeral });
      }

      return interaction.showModal(
        buildCommandModal({
          customId: ADD_MODAL_ID,
          title: 'Add Custom Command',
          name: nameCheck.name,
        }),
      );
    }

    if (sub === 'edit') {
      const identifier = interaction.options.getString('identifier', true);
      const command = await client.db.getCustomCommandByIdentifier(identifier);
      if (!command) {
        return interaction.reply({
          content: 'Custom command not found.',
          flags: MessageFlags.Ephemeral,
        });
      }
      if (String(command.name || '').length > NAME_LIMIT) {
        return interaction.reply({
          content:
            'That command name is longer than Discord modals can edit safely. Please edit it from the web panel.',
          flags: MessageFlags.Ephemeral,
        });
      }
      if (String(command.content || '').length > CONTENT_LIMIT) {
        return interaction.reply({
          content:
            'That command content is longer than Discord modals can edit safely. Please edit it from the web panel.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.showModal(
        buildCommandModal({
          customId: `${EDIT_MODAL_PREFIX}${command.id}`,
          title: 'Edit Custom Command',
          name: command.name,
          content: command.content,
        }),
      );
    }

    if (sub === 'remove') {
      const identifier = interaction.options.getString('identifier', true);
      const result = await client.db.deleteCustomCommand(identifier);
      if (!result.ok) {
        return interaction.reply({
          content: result.message || 'Custom command not found.',
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({
        content: `Custom command \`${result.command.name}\` (id \`${result.command.id}\`) removed.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'get_info') {
      const identifier = interaction.options.getString('name', true);
      const command = await client.db.getCustomCommandByIdentifier(identifier);
      if (!command) {
        return interaction.reply({
          content: 'Custom command not found.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        content: [
          `**${command.name}**`,
          `ID: \`${command.id}\``,
          `Usage: \`${command.usage || 0}\``,
          `Created: ${formatUnix(command.created_at)}`,
          `Updated: ${formatUnix(command.updated_at)}`,
          `Content: ${truncate(command.content) || '(empty)'}`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  handleCustomCommandModalSubmit,
  buildCommandModal,
};
