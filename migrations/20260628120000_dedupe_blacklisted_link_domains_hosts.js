/**
 * Remove duplicates that appear after normalizing host (e.g. `captcha-lookup.xyz` vs captcha-lookup.xyz),
 * then set host to the canonical form. Safe order: DELETE extras first, UPDATE last.
 */
const { normalizeBlacklistedLinkHost } = require('../libs/blacklistedLinkHostNormalize');

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('blacklisted_link_domains');
  if (!exists) return;

  const rows = await knex('blacklisted_link_domains').select('*').orderBy('id', 'asc');

  const emptyNormIds = [];
  const groups = new Map();

  for (const r of rows) {
    const norm = normalizeBlacklistedLinkHost(r.host);
    if (!norm) {
      emptyNormIds.push(r.id);
      continue;
    }
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(r);
  }

  if (emptyNormIds.length) {
    await knex('blacklisted_link_domains').whereIn('id', emptyNormIds).del();
  }

  const duplicateIds = [];
  const toUpdate = [];

  for (const [normHost, list] of groups) {
    list.sort((a, b) => a.id - b.id);
    const [keep, ...dups] = list;
    for (const d of dups) {
      duplicateIds.push(d.id);
    }
    if (keep.host !== normHost) {
      toUpdate.push({ id: keep.id, host: normHost });
    }
  }

  if (duplicateIds.length) {
    await knex('blacklisted_link_domains').whereIn('id', duplicateIds).del();
  }

  for (const { id, host } of toUpdate) {
    await knex('blacklisted_link_domains').where({ id }).update({ host });
  }
};

exports.down = async function down() {
  /* irreversible */
};
