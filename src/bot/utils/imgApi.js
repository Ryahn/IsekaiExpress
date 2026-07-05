const axios = require('axios');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const path = require('path');
const config = require('../../../config');

const DEFAULT_BASE_URL = 'https://imgapi.zonies.xyz';
const REQUEST_TIMEOUT_MS = 15000;
const TYPES_CACHE_TTL_MS = 60 * 60 * 1000;

const typesCache = new Map();

const RANDOM_PEOPLE = [
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
  'a husbando',
];

function pickRandomPerson() {
  return RANDOM_PEOPLE[Math.floor(Math.random() * RANDOM_PEOPLE.length)];
}

function getBaseUrl() {
  return (config.imgApi?.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function getApiKey() {
  return config.imgApi?.apiKey || '';
}

function authHeaders(apiKey) {
  const key = apiKey || getApiKey();
  if (!key) return {};
  return { 'X-API-Key': key };
}

/** Rewrite localhost/private API image URLs to the public img API host for Discord embeds. */
function normalizeImageUrl(url, baseUrl) {
  const publicBase = (baseUrl || getBaseUrl()).replace(/\/$/, '');
  if (!url || typeof url !== 'string') return url;

  if (url.startsWith('/')) {
    return `${publicBase}${url}`;
  }

  try {
    const parsed = new URL(url);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (isLocal) {
      return `${publicBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return url;
  } catch {
    return url;
  }
}

function channelIsNsfw(channel) {
  if (!channel) return false;
  if (channel.isThread()) {
    return channel.parent?.nsfw === true;
  }
  return channel.nsfw === true;
}

async function resolveChannel(client, interaction) {
  let channel = interaction.channel;
  if (!channel && interaction.channelId) {
    channel = await client.channels.fetch(interaction.channelId).catch(() => null);
  }
  return channel;
}

async function fetchRandomImage({ category, type, apiKey, baseUrl } = {}) {
  const key = apiKey ?? getApiKey();
  const url = `${baseUrl || getBaseUrl()}/api/v1/image`;
  const { data } = await axios.get(url, {
    params: { category, type },
    headers: authHeaders(key),
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (!data || typeof data.url !== 'string' || !data.url) {
    throw new Error(`Unexpected response from Image API for ${category}/${type}`);
  }

  const resolvedBase = baseUrl || getBaseUrl();
  return {
    ...data,
    url: normalizeImageUrl(data.url, resolvedBase),
  };
}

async function fetchTypes({ category, apiKey, baseUrl } = {}) {
  const key = apiKey ?? getApiKey();
  const url = `${baseUrl || getBaseUrl()}/api/v1/types`;
  const { data } = await axios.get(url, {
    params: { category },
    headers: authHeaders(key),
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (!data || !Array.isArray(data.types)) {
    throw new Error(`Unexpected types response from Image API for ${category}`);
  }

  return data.types;
}

async function getCachedTypes(category, apiKey) {
  const key = apiKey ?? getApiKey();
  const cacheKey = `${category}:${key ? 'auth' : 'anon'}`;
  const cached = typesCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TYPES_CACHE_TTL_MS) {
    return cached.types;
  }

  const types = await fetchTypes({ category, apiKey: key });
  typesCache.set(cacheKey, { types, at: Date.now() });
  return types;
}

function filterAutocompleteTypes(types, query, limit = 25) {
  const q = String(query || '').trim().toLowerCase();
  const filtered = q
    ? types.filter((t) => t.toLowerCase().includes(q))
    : types.slice();
  return filtered.slice(0, limit).map((t) => ({ name: t.slice(0, 100), value: t.slice(0, 100) }));
}

async function fetchImageForInteraction(client, { category, type }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('IMG_API_KEY_MISSING');
  }

  return client.rateLimitHandler.executeWithRateLimit('img-api', () =>
    fetchRandomImage({ category, type, apiKey }),
  );
}

/**
 * @param {object} opts
 * @param {string} opts.name - Slash command name
 * @param {'sfw'|'nsfw'|'furry'} opts.category - Image API category
 * @param {string} opts.apiType - Image API type param
 * @param {string} opts.description
 * @param {(user: import('discord.js').User, target: string) => string} opts.action
 * @param {boolean} [opts.targetOption=false]
 * @param {boolean} [opts.targetRequired=false]
 * @param {boolean} [opts.nsfw=false]
 * @param {string} [opts.funCategory='fun']
 */
function createImgReactionCommand(opts) {
  const {
    name,
    category,
    apiType,
    description,
    action,
    targetOption = false,
    targetRequired = false,
    nsfw = false,
    funCategory = 'fun',
  } = opts;

  const builder = new SlashCommandBuilder().setName(name).setDescription(description);

  if (targetOption) {
    builder.addUserOption((option) => {
      option.setName('target').setDescription('The user to target');
      if (targetRequired) option.setRequired(true);
      return option;
    });
  }

  async function execute(client, interaction) {
    const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, name);
    if (cooldownTime) {
      return interaction.editReply({
        content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!getApiKey()) {
      return interaction.editReply({
        content: 'This command needs `IMG_API_KEY` in the environment.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (nsfw) {
      const channel = await resolveChannel(client, interaction);
      if (!channelIsNsfw(channel)) {
        return interaction.editReply('This command can only be used in NSFW channels!');
      }
    }

    const { getRandomColor } = client.utils;

    try {
      const data = await fetchImageForInteraction(client, { category, type: apiType });
      const targetUser = targetOption ? interaction.options.getUser('target') : null;
      const targetLabel = targetUser ? `${targetUser}` : pickRandomPerson();
      const embed = new EmbedBuilder()
        .setDescription(action(interaction.user, targetLabel))
        .setColor(`#${getRandomColor()}`)
        .setImage(data.url);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      client.logger.error(`Error executing the ${name} command:`, error);
      const payload = {
        content: 'Could not load the image (the external API may be down or changed).',
        flags: MessageFlags.Ephemeral,
      };
      try {
        await interaction.editReply(payload);
      } catch {
        await interaction.followUp(payload).catch(() => {});
      }
    }
  }

  return {
    category: funCategory === 'fun' ? path.basename(path.join(__dirname, '../commands/slashCommands/fun')) : funCategory,
    data: builder,
    execute,
  };
}

/**
 * Shared builder for /neko and /catgirl (optional still image instead of GIF).
 */
function createNekoCommand({ name, category, description, nsfw = false }) {
  const builder = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addBooleanOption((opt) =>
      opt.setName('image').setDescription('Return a still image instead of a GIF'),
    );

  async function execute(client, interaction) {
    const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, name);
    if (cooldownTime) {
      return interaction.editReply({
        content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!getApiKey()) {
      return interaction.editReply({
        content: 'This command needs `IMG_API_KEY` in the environment.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (nsfw) {
      const channel = await resolveChannel(client, interaction);
      if (!channelIsNsfw(channel)) {
        return interaction.editReply('This command can only be used in NSFW channels!');
      }
    }

    const { getRandomColor } = client.utils;
    const still = interaction.options.getBoolean('image') === true;
    const type = still ? 'neko/img' : 'neko/gif';

    try {
      const data = await fetchImageForInteraction(client, { category, type });
      const embed = new EmbedBuilder()
        .setDescription(`${interaction.user} shares a neko ${still ? 'image' : 'gif'}`)
        .setColor(`#${getRandomColor()}`)
        .setImage(data.url);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      client.logger.error(`Error executing the ${name} command:`, error);
      await interaction.editReply({
        content: 'Could not load the image (the external API may be down or changed).',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }

  return {
    category: path.basename(path.join(__dirname, '../commands/slashCommands/fun')),
    data: builder,
    execute,
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  RANDOM_PEOPLE,
  pickRandomPerson,
  channelIsNsfw,
  resolveChannel,
  fetchRandomImage,
  fetchTypes,
  getCachedTypes,
  filterAutocompleteTypes,
  fetchImageForInteraction,
  createImgReactionCommand,
  createNekoCommand,
  normalizeImageUrl,
};
