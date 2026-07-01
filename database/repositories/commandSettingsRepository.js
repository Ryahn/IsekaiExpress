const crypto = require('crypto');
const db = require('../knex');

/** Match the original db.js nowUnix helper used by createCommandSettings. */
const nowUnix = () => Math.floor(Date.now() / 1000);
const CUSTOM_COMMAND_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function normalizeCustomCommandName(name) {
  return String(name || '').trim();
}

function validateCustomCommandName(name) {
  const normalized = normalizeCustomCommandName(name);
  if (!normalized) {
    return { ok: false, message: 'Command name is required.' };
  }
  if (!CUSTOM_COMMAND_NAME_PATTERN.test(normalized)) {
    return {
      ok: false,
      message: 'Command names can only contain letters, numbers, underscores, and hyphens, up to 64 characters.',
    };
  }
  return { ok: true, name: normalized };
}

function normalizeCustomCommandContent(content) {
  return String(content || '').trim();
}

function getCustomCommandHash(name) {
  return crypto.createHash('md5').update(normalizeCustomCommandName(name).toLowerCase()).digest('hex');
}

function parseCustomCommandIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  return /^\d+$/.test(value) ? { id: value } : { name: value };
}

function isDuplicateKeyError(error) {
  return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
}

function duplicateResult(command = null) {
  return {
    ok: false,
    reason: 'duplicate',
    message: command?.name
      ? `A custom command named "${command.name}" already exists.`
      : 'A custom command with that name already exists.',
    command,
  };
}

/**
 * Command channel settings + custom command content + app_state revision tracking.
 * Tables: command_settings, commands, app_state.
 * Behavior and return shapes preserved verbatim from the original database/db.js.
 */
const self = (module.exports = {
  createCommandSettings: async (name, hash, category = 'misc', channelId = '351435045921357824') => {
    await db.table('command_settings').insert({ name: name, hash: hash, channel_id: channelId, category: category, created_at: nowUnix(), updated_at: nowUnix() }).onConflict('hash').ignore();
  },

  getAllowedChannel: async (hash) => {
    const [rows] = await db.table('command_settings').select('channel_id').where({ hash: hash });
    return rows;
  },

  getCommandSettingsByHash: async (hash) => {
    const [rows] = await db.table('command_settings').select('*').where({ hash: hash });
    return rows;
  },

  getCommandSettings: async (itemsPerPage = 10, offset = 0) => {
    const rows = await db.table('command_settings').select('*').orderBy('name', 'asc').limit(itemsPerPage).offset(offset);
    return rows;
  },

  updateCommandSettings: async (hash, channelId) => {
    await db.table('command_settings').update({ channel_id: channelId }).where({ hash: hash });
  },

  getCommand: async (commandNameHash) => {
    return db.table('commands').select('hash', 'content', 'usage').where({ hash: commandNameHash }).first();
  },

  ensureAppStateRow: async (trx = db) => {
    const row = await trx.table('app_state').where({ id: 1 }).first();
    if (!row) {
      await trx.table('app_state').insert({ id: 1, custom_commands_revision: 0 });
    }
  },

  getCustomCommandsRevision: async () => {
    await self.ensureAppStateRow();
    const row = await db.table('app_state').select('custom_commands_revision').where({ id: 1 }).first();
    return row ? Number(row.custom_commands_revision) : 0;
  },

  bumpCustomCommandsRevision: async (trx = db) => {
    await self.ensureAppStateRow(trx);
    await trx.table('app_state').where({ id: 1 }).increment('custom_commands_revision', 1);
  },

  getAllCustomCommandsForCache: async () => {
    return db.table('commands').select('hash', 'content');
  },

  refreshCustomCommandsCache: async (client) => {
    const rows = await self.getAllCustomCommandsForCache();
    const map = new Map();
    for (const r of rows) {
      map.set(r.hash, r.content);
    }
    client.customCommandsByHash = map;
    client.customCommandsRevision = await self.getCustomCommandsRevision();
  },

  incrementCustomCommandUsage: async (commandNameHash) => {
    await db.table('commands').increment('usage', 1).where({ hash: commandNameHash });
  },

  normalizeCustomCommandName,
  normalizeCustomCommandContent,
  validateCustomCommandName,
  getCustomCommandHash,
  parseCustomCommandIdentifier,

  getCustomCommandByIdentifier: async (identifier, trx = db) => {
    const parsed = parseCustomCommandIdentifier(identifier);
    if (!parsed) return null;
    if (parsed.id) {
      return trx.table('commands').select('*').where({ id: parsed.id }).first();
    }
    return trx
      .table('commands')
      .select('*')
      .whereRaw('LOWER(name) = ?', [normalizeCustomCommandName(parsed.name).toLowerCase()])
      .first();
  },

  createCustomCommand: async ({ name, content, userId }) => {
    const nameCheck = validateCustomCommandName(name);
    if (!nameCheck.ok) {
      return { ok: false, reason: 'validation', message: nameCheck.message };
    }

    const normalizedContent = normalizeCustomCommandContent(content);
    if (!normalizedContent) {
      return { ok: false, reason: 'validation', message: 'Command content is required.' };
    }

    const hash = getCustomCommandHash(nameCheck.name);
    try {
      return await db.transaction(async (trx) => {
        const duplicate = await trx.table('commands').select('id', 'name').where({ hash }).first();
        if (duplicate) {
          return duplicateResult(duplicate);
        }

        const ts = nowUnix();
        const [id] = await trx.table('commands').insert({
          hash,
          name: nameCheck.name,
          content: normalizedContent,
          created_by: userId,
          updated_by: userId,
          created_at: ts,
          updated_at: ts,
        });
        await self.bumpCustomCommandsRevision(trx);

        return {
          ok: true,
          command: await trx.table('commands').select('*').where({ id }).first(),
        };
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const duplicate = await db.table('commands').select('id', 'name').where({ hash }).first();
      return duplicateResult(duplicate);
    }
  },

  updateCustomCommand: async ({ identifier, name, content, userId }) => {
    const nameCheck = validateCustomCommandName(name);
    if (!nameCheck.ok) {
      return { ok: false, reason: 'validation', message: nameCheck.message };
    }

    const normalizedContent = normalizeCustomCommandContent(content);
    if (!normalizedContent) {
      return { ok: false, reason: 'validation', message: 'Command content is required.' };
    }

    const hash = getCustomCommandHash(nameCheck.name);
    try {
      return await db.transaction(async (trx) => {
        const existing = await self.getCustomCommandByIdentifier(identifier, trx);
        if (!existing) {
          return { ok: false, reason: 'not_found', message: 'Custom command not found.' };
        }

        const duplicate = await trx.table('commands').select('id', 'name').where({ hash }).first();
        if (duplicate && String(duplicate.id) !== String(existing.id)) {
          return duplicateResult(duplicate);
        }

        await trx.table('commands').where({ id: existing.id }).update({
          name: nameCheck.name,
          hash,
          content: normalizedContent,
          updated_by: userId,
          updated_at: nowUnix(),
        });
        await self.bumpCustomCommandsRevision(trx);

        return {
          ok: true,
          command: await trx.table('commands').select('*').where({ id: existing.id }).first(),
          previous: existing,
        };
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const duplicate = await db.table('commands').select('id', 'name').where({ hash }).first();
      return duplicateResult(duplicate);
    }
  },

  deleteCustomCommand: async (identifier) => {
    return db.transaction(async (trx) => {
      const existing = await self.getCustomCommandByIdentifier(identifier, trx);
      if (!existing) {
        return { ok: false, reason: 'not_found', message: 'Custom command not found.' };
      }

      await trx.table('commands').where({ id: existing.id }).delete();
      await self.bumpCustomCommandsRevision(trx);
      return { ok: true, command: existing };
    });
  },
});
