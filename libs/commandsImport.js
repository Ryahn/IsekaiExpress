const {
  getCustomCommandHash,
  validateCustomCommandName,
  normalizeCustomCommandContent,
} = require('../database/repositories/commandSettingsRepository');

function lowerName(name) {
  return String(name || '').trim().toLowerCase();
}

function groupByKey(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function duplicateGroupsFromMap(groups, label, keyField) {
  const out = [];
  for (const [key, members] of groups) {
    if (members.length <= 1) continue;
    out.push({
      source: label,
      dimension: keyField,
      key,
      count: members.length,
      members: members.map((row) => ({
        id: row.id ?? null,
        hash: row.hash,
        name: row.name,
      })),
    });
  }
  return out;
}

/**
 * @param {Array<object>} rows
 * @param {(row: object) => string} keyFn
 * @param {string} label
 * @param {string} keyField
 */
function findInternalDuplicates(rows, keyFn, label, keyField) {
  return duplicateGroupsFromMap(groupByKey(rows, keyFn), label, keyField);
}

/**
 * Find duplicate command groups in JSON, DB, and cross-check mismatches.
 * @param {Array<object>} jsonRows
 * @param {Array<object>} dbRows
 * @param {{ by?: string[] }} [options]
 */
function findDuplicateGroups(jsonRows, dbRows, options = {}) {
  const by = options.by || ['hash', 'name'];
  const checkHash = by.includes('hash');
  const checkName = by.includes('name');
  const groups = [];

  if (checkHash) {
    groups.push(...findInternalDuplicates(jsonRows, (r) => r.hash, 'json', 'hash'));
    groups.push(...findInternalDuplicates(dbRows, (r) => r.hash, 'db', 'hash'));
  }

  if (checkName) {
    groups.push(...findInternalDuplicates(jsonRows, (r) => lowerName(r.name), 'json', 'name'));
    groups.push(...findInternalDuplicates(dbRows, (r) => lowerName(r.name), 'db', 'name'));
  }

  if (checkHash || checkName) {
    const dbByHash = new Map(dbRows.map((r) => [r.hash, r]));
    const dbByName = groupByKey(dbRows, (r) => lowerName(r.name));

    for (const jsonRow of jsonRows) {
      const dbRow = dbByHash.get(jsonRow.hash);
      if (dbRow && lowerName(dbRow.name) !== lowerName(jsonRow.name)) {
        groups.push({
          source: 'cross',
          dimension: 'hash_name_mismatch',
          key: jsonRow.hash,
          count: 2,
          members: [
            { id: null, hash: jsonRow.hash, name: jsonRow.name, origin: 'json' },
            { id: dbRow.id, hash: dbRow.hash, name: dbRow.name, origin: 'db' },
          ],
        });
      }

      const nameMatches = dbByName.get(lowerName(jsonRow.name)) || [];
      const hashConflict = nameMatches.find((r) => r.hash !== jsonRow.hash);
      if (hashConflict) {
        groups.push({
          source: 'cross',
          dimension: 'name_hash_mismatch',
          key: lowerName(jsonRow.name),
          count: 2,
          members: [
            { id: null, hash: jsonRow.hash, name: jsonRow.name, origin: 'json' },
            { id: hashConflict.id, hash: hashConflict.hash, name: hashConflict.name, origin: 'db' },
          ],
        });
      }
    }
  }

  return groups;
}

function summarizeDuplicates(groups) {
  const summary = {
    total: groups.length,
    json: { hash: 0, name: 0 },
    db: { hash: 0, name: 0 },
    cross: { hash_name_mismatch: 0, name_hash_mismatch: 0 },
  };

  for (const group of groups) {
    if (group.source === 'json' && group.dimension === 'hash') summary.json.hash++;
    else if (group.source === 'json' && group.dimension === 'name') summary.json.name++;
    else if (group.source === 'db' && group.dimension === 'hash') summary.db.hash++;
    else if (group.source === 'db' && group.dimension === 'name') summary.db.name++;
    else if (group.source === 'cross' && group.dimension === 'hash_name_mismatch') summary.cross.hash_name_mismatch++;
    else if (group.source === 'cross' && group.dimension === 'name_hash_mismatch') summary.cross.name_hash_mismatch++;
  }

  return summary;
}

/**
 * Build an upsert plan for importing JSON commands into the DB.
 * @param {Array<object>} jsonRows
 * @param {Array<object>} dbRows
 */
function buildImportPlan(jsonRows, dbRows) {
  const dbByHash = new Map(dbRows.map((r) => [r.hash, r]));
  const dbByLowerName = new Map();
  for (const row of dbRows) {
    const key = lowerName(row.name);
    if (!dbByLowerName.has(key)) dbByLowerName.set(key, row);
  }

  const jsonHashes = new Set(jsonRows.map((r) => r.hash));

  const actions = [];
  const skipped = {
    invalid_name: 0,
    hash_mismatch: 0,
    name_conflict: 0,
  };

  for (const jsonRow of jsonRows) {
    const nameCheck = validateCustomCommandName(jsonRow.name);
    if (!nameCheck.ok) {
      skipped.invalid_name++;
      actions.push({
        action: 'skip',
        reason: 'invalid_name',
        message: nameCheck.message,
        json: jsonRow,
      });
      continue;
    }

    const expectedHash = getCustomCommandHash(nameCheck.name);
    if (jsonRow.hash !== expectedHash) {
      skipped.hash_mismatch++;
      actions.push({
        action: 'skip',
        reason: 'hash_mismatch',
        message: `JSON hash ${jsonRow.hash} != computed ${expectedHash}`,
        json: jsonRow,
        expectedHash,
      });
      continue;
    }

    const content = normalizeCustomCommandContent(jsonRow.content);
    const existing = dbByHash.get(jsonRow.hash);

    if (existing) {
      const nameChanged = existing.name !== nameCheck.name;
      const contentChanged = normalizeCustomCommandContent(existing.content) !== content;
      if (!nameChanged && !contentChanged) {
        actions.push({
          action: 'unchanged',
          json: jsonRow,
          db: existing,
        });
      } else {
        actions.push({
          action: 'update',
          json: { ...jsonRow, name: nameCheck.name, content },
          db: existing,
          patch: {
            name: nameCheck.name,
            content,
            updated_by: jsonRow.updated_by,
            updated_at: jsonRow.updated_at,
          },
          preserve: {
            usage: existing.usage,
            created_by: existing.created_by,
            created_at: existing.created_at,
          },
        });
      }
      continue;
    }

    const nameConflict = dbByLowerName.get(lowerName(nameCheck.name));
    if (nameConflict && nameConflict.hash !== jsonRow.hash) {
      skipped.name_conflict++;
      actions.push({
        action: 'skip',
        reason: 'name_conflict',
        message: `Name "${nameCheck.name}" exists as hash ${nameConflict.hash} (id=${nameConflict.id})`,
        json: jsonRow,
        conflict: nameConflict,
      });
      continue;
    }

    actions.push({
      action: 'insert',
      json: {
        hash: jsonRow.hash,
        name: nameCheck.name,
        content,
        usage: jsonRow.usage ?? 0,
        created_by: jsonRow.created_by,
        updated_by: jsonRow.updated_by,
        created_at: jsonRow.created_at,
        updated_at: jsonRow.updated_at,
      },
    });
  }

  const dbOnly = dbRows.filter((r) => !jsonHashes.has(r.hash));

  const summary = {
    jsonRows: jsonRows.length,
    update: actions.filter((a) => a.action === 'update').length,
    insert: actions.filter((a) => a.action === 'insert').length,
    unchanged: actions.filter((a) => a.action === 'unchanged').length,
    skipped: skipped.invalid_name + skipped.hash_mismatch + skipped.name_conflict,
    skippedDetail: skipped,
    dbOnly: dbOnly.length,
  };

  return { actions, dbOnly, summary };
}

function formatActionLine(action) {
  const name = action.json?.name;
  const hash = action.json?.hash;
  switch (action.action) {
    case 'update':
      return `UPDATE hash=${hash} name=${name}`;
    case 'insert':
      return `INSERT hash=${hash} name=${name}`;
    case 'unchanged':
      return `UNCHANGED hash=${hash} name=${name}`;
    case 'skip':
      return `SKIP ${action.reason} name=${name ?? '?'} hash=${hash ?? '?'}${action.message ? ` (${action.message})` : ''}`;
    default:
      return `${action.action} hash=${hash}`;
  }
}

function formatDuplicateLine(group) {
  const members = group.members
    .map((m) => {
      const parts = [];
      if (m.origin) parts.push(m.origin);
      if (m.id != null) parts.push(`id=${m.id}`);
      parts.push(`hash=${m.hash}`, `name=${m.name}`);
      return parts.join(' ');
    })
    .join(' | ');
  return `[${group.source}/${group.dimension}] key=${group.key} (${group.count}): ${members}`;
}

module.exports = {
  buildImportPlan,
  findDuplicateGroups,
  summarizeDuplicates,
  formatActionLine,
  formatDuplicateLine,
  getCustomCommandHash,
};
