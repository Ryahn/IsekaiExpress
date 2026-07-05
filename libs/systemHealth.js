const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const db = require('../database/knex');
const { getArchiveRoot } = require('./starboardArchive');

const ARCHIVE_WALK_MAX_FILES = 50_000;

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeUnix(ts) {
  const value = Number(ts);
  if (!value) return 'Never';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - value);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

async function walkArchiveStats(root, maxFiles = ARCHIVE_WALK_MAX_FILES) {
  let entryCount = 0;
  let totalBytes = 0;
  let filesVisited = 0;
  let truncated = false;

  async function walk(dir) {
    if (filesVisited >= maxFiles) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (filesVisited >= maxFiles) {
        truncated = true;
        return;
      }

      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }

      filesVisited += 1;
      if (entry.name === 'manifest.json') {
        entryCount += 1;
      }

      try {
        const stat = await fs.stat(abs);
        totalBytes += Number(stat.size) || 0;
      } catch {
        /* ignore unreadable files */
      }
    }
  }

  await walk(root);
  return { entryCount, totalBytes, truncated };
}

async function getPhishSyncState() {
  try {
    const row = await db('app_state').where({ id: 1 }).first();
    if (!row) {
      return {
        enabled: Boolean(config.phishGg?.dailySyncEnabled),
        lastSyncAt: null,
        lastSyncStatus: null,
        lastSyncSummary: null,
      };
    }

    let summary = null;
    if (row.phish_gg_last_sync_summary) {
      try {
        summary = JSON.parse(row.phish_gg_last_sync_summary);
      } catch {
        summary = { raw: row.phish_gg_last_sync_summary };
      }
    }

    return {
      enabled: Boolean(config.phishGg?.dailySyncEnabled),
      lastSyncAt: row.phish_gg_last_sync_at != null ? Number(row.phish_gg_last_sync_at) : null,
      lastSyncStatus: row.phish_gg_last_sync_status || null,
      lastSyncSummary: summary,
    };
  } catch {
    return {
      enabled: Boolean(config.phishGg?.dailySyncEnabled),
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncSummary: null,
      error: 'Could not read app_state',
    };
  }
}

async function recordPhishGgSyncState({ status, summary }) {
  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    phish_gg_last_sync_at: ts,
    phish_gg_last_sync_status: String(status || 'unknown').slice(0, 32),
    phish_gg_last_sync_summary: summary ? JSON.stringify(summary) : null,
  };

  const existing = await db('app_state').where({ id: 1 }).first();
  if (existing) {
    await db('app_state').where({ id: 1 }).update(payload);
    return;
  }

  await db('app_state').insert({
    id: 1,
    custom_commands_revision: 0,
    ...payload,
  });
}

async function getSystemHealth() {
  const imgApiConfigured = Boolean(config.imgApi?.apiKey);
  const starboardEnabled = Boolean(config.starboardArchive?.enabled);

  let mysqlOk = false;
  try {
    await db.raw('SELECT 1');
    mysqlOk = true;
  } catch {
    mysqlOk = false;
  }

  let starboardArchive = {
    enabled: starboardEnabled,
    entryCount: 0,
    totalBytes: 0,
    totalBytesLabel: '0 B',
    truncated: false,
    error: null,
  };

  if (starboardEnabled) {
    try {
      const stats = await walkArchiveStats(getArchiveRoot());
      starboardArchive = {
        enabled: true,
        entryCount: stats.entryCount,
        totalBytes: stats.totalBytes,
        totalBytesLabel: formatBytes(stats.totalBytes),
        truncated: stats.truncated,
        error: null,
      };
    } catch (error) {
      starboardArchive.error = error instanceof Error ? error.message : String(error);
    }
  }

  const phishGg = await getPhishSyncState();

  return {
    mysql: { ok: mysqlOk },
    imgApi: { configured: imgApiConfigured },
    starboardArchive,
    phishGg: {
      ...phishGg,
      lastSyncRelative: formatRelativeUnix(phishGg.lastSyncAt),
    },
  };
}

module.exports = {
  formatBytes,
  formatRelativeUnix,
  getPhishSyncState,
  recordPhishGgSyncState,
  getSystemHealth,
};
