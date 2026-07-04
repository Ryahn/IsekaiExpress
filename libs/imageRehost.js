const axios = require('axios');
const config = require('../config');

const URL_PATTERN = /https?:\/\/[^\s~<>)\]}"']+/gi;
const MEDIA_EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|webm|mp4|mov|m4v)(\?|$)/i;

const DIRECT_HOST_PATTERNS = [
  /(?:^|\.)cdn\.discordapp\.com$/i,
  /(?:^|\.)media\.discordapp\.net$/i,
  /(?:^|\.)media\.giphy\.com$/i,
  /(?:^|\.)media\d*\.tenor\.com$/i,
  /(?:^|\.)c\.tenor\.com$/i,
  /(?:^|\.)i\.imgur\.com$/i,
  /(?:^|\.)thumbs\.gfycat\.com$/i,
];

const DOWNLOAD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,video/webm,video/mp4,video/*,*/*;q=0.8',
};

const DISCORD_ATTACHMENT_PATH = /^\/attachments\/(\d+)\/(\d+)\/([^/?#]+)/;
const DISCORD_CDN_HOST = /(?:^|\.)cdn\.discordapp\.com$|(?:^|\.)media\.discordapp\.net$/i;

function getRehostConfig(overrides = {}) {
  const base = config.imageRehost || {};
  return {
    enabled: overrides.enabled ?? base.enabled,
    uploadUrl: overrides.uploadUrl ?? base.uploadUrl,
    uploadKey: overrides.uploadKey ?? base.uploadKey,
    fileField: overrides.fileField ?? base.fileField,
    urlJsonPath: overrides.urlJsonPath ?? base.urlJsonPath,
    skipHosts: overrides.skipHosts ?? base.skipHosts ?? [],
    concurrency: overrides.concurrency ?? base.concurrency ?? 3,
    maxBytes: overrides.maxBytes ?? base.maxBytes ?? 25 * 1024 * 1024,
  };
}

function isRehostConfigured(cfg = getRehostConfig()) {
  return Boolean(cfg.enabled && cfg.uploadUrl && cfg.uploadKey);
}

function normalizeUrl(raw) {
  let url = String(raw || '').trim();
  while (/[&)\]}"'.,]$/.test(url)) {
    url = url.slice(0, -1);
  }
  return url;
}

function extractUrls(content) {
  const matches = String(content || '').match(URL_PATTERN) || [];
  const seen = new Set();
  const urls = [];
  for (const match of matches) {
    const url = normalizeUrl(match);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathFromUrl(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

function isSkipHost(url, skipHosts) {
  const host = hostFromUrl(url);
  return skipHosts.some((skip) => host === skip || host.endsWith('.' + skip));
}

function isIndirectHost(url) {
  const host = hostFromUrl(url);
  const path = pathFromUrl(url);

  if (/^c\.tenor\.com$/i.test(host)) return false;
  if (/^i\.imgur\.com$/i.test(host)) return false;
  if (/^thumbs\.gfycat\.com$/i.test(host)) return false;

  if (/(?:^|\.)youtube\.com$/i.test(host) || /(?:^|\.)youtu\.be$/i.test(host)) {
    return true;
  }

  if (/tenor\.com$/i.test(host) && /\/view\//i.test(path)) {
    return true;
  }

  if (/gfycat\.com$/i.test(host)) {
    return true;
  }

  if (/imgur\.com$/i.test(host)) {
    return true;
  }

  return false;
}

function isDirectImageCandidate(url) {
  if (MEDIA_EXT_PATTERN.test(url)) return true;
  const host = hostFromUrl(url);
  if (DIRECT_HOST_PATTERNS.some((re) => re.test(host))) return true;
  if (/\/attachments\//i.test(url)) return true;
  return false;
}

function isRehostableContentType(contentType, url = '') {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type.startsWith('image/') || type.startsWith('video/')) return true;
  if (!type || type === 'application/octet-stream') {
    return MEDIA_EXT_PATTERN.test(String(url || ''));
  }
  return false;
}

function classifyUrl(url, skipHosts) {
  if (!/^https?:\/\//i.test(url)) {
    return { status: 'flag_indirect', reason: 'invalid_url' };
  }
  if (isSkipHost(url, skipHosts)) {
    return { status: 'skip_hosted', reason: 'already_hosted' };
  }
  if (isIndirectHost(url)) {
    return { status: 'flag_indirect', reason: 'indirect_host' };
  }
  if (isDirectImageCandidate(url)) {
    return { status: 'candidate', reason: 'direct_image' };
  }
  return { status: 'candidate', reason: 'probe_required' };
}

function parseDiscordAttachmentUrl(url) {
  try {
    const parsed = new URL(url);
    if (!DISCORD_CDN_HOST.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(DISCORD_ATTACHMENT_PATH);
    if (!match) return null;
    return {
      channelId: match[1],
      attachmentId: match[2],
      filename: decodeURIComponent(match[3]),
    };
  } catch {
    return null;
  }
}

function discordAttachmentNeedsRefresh(url) {
  try {
    const parsed = new URL(url);
    return !parsed.searchParams.has('ex') || !parsed.searchParams.has('hm');
  } catch {
    return true;
  }
}

function findDiscordAttachment(attachments, filename, attachmentId = null) {
  if (attachmentId != null) {
    const id = String(attachmentId);
    const byId = (attachments || []).find((attachment) => String(attachment.id) === id);
    if (byId) return byId;
  }

  const target = filename.toLowerCase();
  return (attachments || []).find((attachment) => {
    const name = String(attachment.filename || '').toLowerCase();
    return name === target || decodeURIComponent(name) === target;
  }) || (attachments || []).find((attachment) => {
    const attachmentUrl = String(attachment.url || attachment.proxy_url || '');
    return attachmentUrl.includes(filename);
  });
}

function findAttachmentInMessages(messages, attachmentId, filename) {
  const id = String(attachmentId);
  for (const message of messages || []) {
    const match = findDiscordAttachment(message.attachments, filename, id);
    if (match) return match;
  }
  return null;
}

async function refreshDiscordAttachmentUrls(urls, botToken, logger) {
  if (!urls.length || !botToken) {
    return { ok: false, reason: 'discord_refresh_unavailable' };
  }

  try {
    const response = await axios.post(
      'https://discord.com/api/v10/attachments/refresh-urls',
      { attachment_urls: urls },
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );
    return { ok: true, data: response.data };
  } catch (error) {
    const status = error.response?.status;
    if (logger?.warn) {
      logger.warn(`Discord attachment refresh failed: ${error.message}`);
    }
    if (status === 403) {
      return { ok: false, reason: 'discord_channel_forbidden', error: error.message };
    }
    return { ok: false, reason: 'discord_refresh_failed', error: error.message, status };
  }
}

function pickRefreshedUrl(refreshData, originalUrl) {
  const entries = refreshData?.refreshed_urls;
  if (!Array.isArray(entries) || !entries.length) return null;
  const exact = entries.find((entry) => entry.original === originalUrl);
  return exact?.refreshed || entries[0]?.refreshed || null;
}

async function fetchDiscordMessagesAround(channelId, snowflakeId, botToken, logger, cache) {
  const cacheKey = `around:${channelId}:${snowflakeId}`;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const response = await axios.get(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        params: { around: snowflakeId, limit: 50 },
        headers: { Authorization: `Bot ${botToken}` },
        timeout: 15000,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );
    const result = { ok: true, messages: response.data };
    if (cache) cache.set(cacheKey, result);
    return result;
  } catch (error) {
    const status = error.response?.status;
    if (logger?.warn) {
      logger.warn(`Discord message search failed for ${channelId}/${snowflakeId}: ${error.message}`);
    }
    if (status === 404) {
      return { ok: false, reason: 'discord_channel_not_found', error: error.message };
    }
    if (status === 403) {
      return { ok: false, reason: 'discord_channel_forbidden', error: error.message };
    }
    return { ok: false, reason: 'discord_message_unavailable', error: error.message };
  }
}

async function resolveDiscordAttachmentUrl(url, botToken, logger, cache) {
  const parts = parseDiscordAttachmentUrl(url);
  if (!parts || !botToken) {
    return { ok: false, reason: 'discord_refresh_unavailable' };
  }

  const refreshCacheKey = `refresh:${url}`;
  if (cache?.has(refreshCacheKey)) {
    return cache.get(refreshCacheKey);
  }

  const refreshed = await refreshDiscordAttachmentUrls([url], botToken, logger);
  if (refreshed.ok) {
    const freshUrl = pickRefreshedUrl(refreshed.data, url);
    if (freshUrl) {
      const result = { ok: true, url: freshUrl };
      if (cache) cache.set(refreshCacheKey, result);
      return result;
    }
  }

  const searched = await fetchDiscordMessagesAround(
    parts.channelId,
    parts.attachmentId,
    botToken,
    logger,
    cache,
  );
  if (!searched.ok) {
    const result = refreshed.ok
      ? { ok: false, reason: 'discord_attachment_not_found' }
      : searched;
    if (cache) cache.set(refreshCacheKey, result);
    return result;
  }

  const attachment = findAttachmentInMessages(
    searched.messages,
    parts.attachmentId,
    parts.filename,
  );
  const freshUrl = attachment?.url || attachment?.proxy_url;
  if (!freshUrl) {
    const result = { ok: false, reason: 'discord_attachment_not_found' };
    if (cache) cache.set(refreshCacheKey, result);
    return result;
  }

  const result = { ok: true, url: freshUrl };
  if (cache) cache.set(refreshCacheKey, result);
  return result;
}

function resolveJsonPath(obj, dotPath) {
  const parts = String(dotPath || '').split('.').filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = current[part];
  }
  return typeof current === 'string' && current ? current : null;
}

function guessFilename(url, contentType) {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split('/').pop() || 'file';
    if (MEDIA_EXT_PATTERN.test(base)) return base.slice(0, 120);
  } catch {
    /* ignore */
  }
  const extMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
    'video/webm': '.webm',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-m4v': '.m4v',
  };
  const ext = extMap[contentType] || (contentType.startsWith('video/') ? '.webm' : '.png');
  const stem = contentType.startsWith('video/') ? 'video' : 'image';
  return `${stem}${ext}`;
}

async function downloadImage(url, maxBytes, logger) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      headers: DOWNLOAD_HEADERS,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!isRehostableContentType(contentType, url)) {
      if (logger?.warn) {
        logger.warn(`Image rehost download for ${url} returned unsupported content-type: ${contentType || '(none)'}`);
      }
      return { ok: false, reason: 'unsupported_content_type', contentType };
    }
    return {
      ok: true,
      data: Buffer.from(response.data),
      contentType,
      filename: guessFilename(url, contentType),
    };
  } catch (error) {
    if (logger?.warn) {
      logger.warn(`Image rehost download failed for ${url}: ${error.message}`);
    }
    return { ok: false, reason: 'download_failed', error: error.message, status: error.response?.status };
  }
}

async function downloadWithDiscordRefresh(url, maxBytes, logger, discordCache) {
  const botToken = config.discord?.botToken;
  const discordMeta = parseDiscordAttachmentUrl(url);

  async function tryDownload(targetUrl) {
    return downloadImage(targetUrl, maxBytes, logger);
  }

  if (discordMeta && botToken && discordAttachmentNeedsRefresh(url)) {
    const refreshed = await resolveDiscordAttachmentUrl(url, botToken, logger, discordCache);
    if (refreshed.ok && refreshed.url) {
      const download = await tryDownload(refreshed.url);
      if (download.ok) return download;
    } else if (!refreshed.ok) {
      return {
        ok: false,
        reason: refreshed.reason,
        error: refreshed.error,
      };
    }
  }

  let download = await tryDownload(url);
  if (download.ok || !discordMeta || !botToken) {
    return download;
  }

  const refreshed = await resolveDiscordAttachmentUrl(url, botToken, logger, discordCache);
  if (refreshed.ok && refreshed.url) {
    download = await tryDownload(refreshed.url);
    if (download.ok) return download;
  }

  if (!refreshed.ok) {
    return {
      ok: false,
      reason: refreshed.reason || download.reason,
      error: refreshed.error || download.error,
    };
  }

  return download;
}

async function uploadImage(buffer, filename, cfg, logger) {
  const form = new FormData();
  form.append('key', cfg.uploadKey);
  form.append(cfg.fileField, new Blob([buffer]), filename);

  try {
    const response = await fetch(cfg.uploadUrl, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, reason: 'upload_failed', error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }
    const data = await response.json();
    const newUrl = resolveJsonPath(data, cfg.urlJsonPath);
    if (!newUrl) {
      return { ok: false, reason: 'upload_response_missing_url' };
    }
    return { ok: true, url: newUrl };
  } catch (error) {
    if (logger?.warn) {
      logger.warn(`Image rehost upload failed: ${error.message}`);
    }
    return { ok: false, reason: 'upload_failed', error: error.message };
  }
}

function replaceUrlsInContent(content, replacements) {
  let next = String(content || '');
  for (const [oldUrl, newUrl] of Object.entries(replacements)) {
    next = next.split(oldUrl).join(newUrl);
  }
  return next;
}

async function processUrl(url, commandMeta, cfg, logger, discordCache) {
  const classification = classifyUrl(url, cfg.skipHosts);
  const base = {
    url,
    commandId: commandMeta.id,
    commandName: commandMeta.name,
    status: classification.status,
    reason: classification.reason,
  };

  if (classification.status === 'skip_hosted') {
    return { ...base, action: 'skipped' };
  }
  if (classification.status === 'flag_indirect') {
    return { ...base, action: 'flagged' };
  }

  const download = await downloadWithDiscordRefresh(url, cfg.maxBytes, logger, discordCache);
  if (!download.ok) {
    return {
      ...base,
      action: 'flagged',
      status: 'flag_indirect',
      reason: download.reason,
      detail: download.contentType || download.error,
    };
  }

  const upload = await uploadImage(download.data, download.filename, cfg, logger);
  if (!upload.ok) {
    return {
      ...base,
      action: 'flagged',
      status: 'flag_indirect',
      reason: upload.reason,
      detail: upload.error,
    };
  }

  return {
    ...base,
    action: 'replaced',
    status: 'replaced',
    reason: 'uploaded',
    newUrl: upload.url,
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function buildCommandResult(command, urlResults) {
  const replacements = {};
  const flagged = [];
  const skipped = [];
  const replaced = [];

  for (const result of urlResults) {
    if (result.action === 'replaced' && result.newUrl) {
      replacements[result.url] = result.newUrl;
      replaced.push(result);
    } else if (result.action === 'flagged') {
      flagged.push(result);
    } else if (result.action === 'skipped') {
      skipped.push(result);
    }
  }

  const newContent = Object.keys(replacements).length
    ? replaceUrlsInContent(command.content, replacements)
    : command.content;

  return {
    id: command.id,
    name: command.name,
    content: command.content,
    newContent,
    changed: newContent !== command.content,
    replacements,
    replaced,
    flagged,
    skipped,
    urls: urlResults,
  };
}

function summarizeResults(commandResults) {
  let candidates = 0;
  let flagged = 0;
  let skipped = 0;
  let replaced = 0;
  let changedCommands = 0;

  for (const cmd of commandResults) {
    if (cmd.changed) changedCommands += 1;
    for (const url of cmd.urls) {
      if (url.action === 'replaced' || url.status === 'replaced') {
        replaced += 1;
      } else if (url.action === 'flagged' || url.status === 'flag_indirect') {
        flagged += 1;
      } else if (url.action === 'skipped' || url.status === 'skip_hosted') {
        skipped += 1;
      } else if (url.action === 'candidate' || url.status === 'candidate') {
        candidates += 1;
      }
    }
  }

  return {
    candidates,
    flagged,
    skipped,
    replaced,
    changedCommands,
    totalCommands: commandResults.length,
  };
}

async function scanCommands(commands, options = {}) {
  const cfg = getRehostConfig(options);
  const commandResults = [];

  for (const command of commands) {
    const urls = extractUrls(command.content);
    const urlResults = urls.map((url) => {
      const classification = classifyUrl(url, cfg.skipHosts);
      return {
        url,
        commandId: command.id,
        commandName: command.name,
        status: classification.status,
        reason: classification.reason,
        action: classification.status === 'skip_hosted'
          ? 'skipped'
          : classification.status === 'flag_indirect'
            ? 'flagged'
            : 'candidate',
      };
    });
    commandResults.push(buildCommandResult(command, urlResults));
  }

  return {
    summary: summarizeResults(commandResults),
    commands: commandResults,
  };
}

async function rehostCommands(commands, options = {}) {
  const cfg = getRehostConfig(options);
  const dryRun = Boolean(options.dryRun);
  const logger = options.logger;
  const discordCache = new Map();
  const commandResults = [];

  for (const command of commands) {
    const urls = extractUrls(command.content);
    if (!urls.length) {
      commandResults.push(buildCommandResult(command, []));
      continue;
    }

    const urlResults = dryRun
      ? urls.map((url) => {
        const classification = classifyUrl(url, cfg.skipHosts);
        return {
          url,
          commandId: command.id,
          commandName: command.name,
          status: classification.status,
          reason: classification.reason,
          action: classification.status === 'skip_hosted'
            ? 'skipped'
            : classification.status === 'flag_indirect'
              ? 'flagged'
              : 'candidate',
        };
      })
      : await mapWithConcurrency(
        urls,
        cfg.concurrency,
        (url) => processUrl(url, { id: command.id, name: command.name }, cfg, logger, discordCache),
      );

    commandResults.push(buildCommandResult(command, urlResults));
  }

  const flaggedItems = [];
  for (const cmd of commandResults) {
    for (const item of cmd.flagged) {
      flaggedItems.push({
        commandId: cmd.id,
        commandName: cmd.name,
        url: item.url,
        reason: item.reason,
        detail: item.detail || null,
      });
    }
  }

  return {
    summary: summarizeResults(commandResults),
    commands: commandResults,
    flagged: flaggedItems,
  };
}

function buildFlaggedExport(flaggedItems) {
  return {
    generatedAt: new Date().toISOString(),
    items: flaggedItems,
  };
}

module.exports = {
  getRehostConfig,
  isRehostConfigured,
  extractUrls,
  normalizeUrl,
  classifyUrl,
  isRehostableContentType,
  parseDiscordAttachmentUrl,
  discordAttachmentNeedsRefresh,
  findDiscordAttachment,
  findAttachmentInMessages,
  pickRefreshedUrl,
  refreshDiscordAttachmentUrls,
  resolveJsonPath,
  replaceUrlsInContent,
  scanCommands,
  rehostCommands,
  buildFlaggedExport,
  downloadImage,
  downloadWithDiscordRefresh,
  uploadImage,
};
