const config = require('../../config');
const db = require('../../database/db').query;
const { RARITY_ORDER, sanitizeRarityAbbrev } = require('../bot/tcg/rarityOrder');
const { DISPLAY_LABEL, normalizeElementKey, ELEMENT_IDS } = require('../bot/tcg/elements');
const { RARITY } = require('../bot/tcg/cardLayout');
const { REGION_NAMES } = require('../../libs/tcgPveConfig');
const { RARITY_SEED_ROWS } = require('../../seeds/rarity');

const rarityNames = Object.fromEntries(
  RARITY_SEED_ROWS.map((r) => [r.abbreviation.toUpperCase(), r.name]),
);

const MAX_PAGE_SIZE = 48;
const DEFAULT_PAGE_SIZE = 24;

/**
 * Align stored image_url with current PUBLIC_BASE_URL when path is under /public/cards.
 */
function resolveCatalogImageUrl(imageUrlStored) {
  if (imageUrlStored == null || imageUrlStored === '') return '';
  const s = String(imageUrlStored).trim();
  const marker = '/public/cards/';
  const idx = s.indexOf(marker);
  if (idx >= 0) {
    return `${config.url.replace(/\/$/, '')}${s.slice(idx)}`;
  }
  if (s.startsWith('/public/cards')) {
    return `${config.url.replace(/\/$/, '')}${s}`;
  }
  return s;
}

function rarityHex(abbrev) {
  const a = sanitizeRarityAbbrev(abbrev, 'C');
  const spec = RARITY[a];
  return spec ? spec.rarityColor : '#888888';
}

function serializeRow(row) {
  const abbrev = sanitizeRarityAbbrev(row.rarity, 'C');
  const normEl = normalizeElementKey(row.element);
  const regionId = row.tcg_region != null && row.tcg_region !== '' ? Number(row.tcg_region) : null;
  const regionName = regionId != null && !Number.isNaN(regionId)
    ? REGION_NAMES[regionId] || null
    : null;

  return {
    uuid: row.uuid,
    card_id: row.card_id,
    name: row.name,
    description: row.description,
    class: row.class,
    rarity: abbrev,
    rarity_label: rarityNames[abbrev] || abbrev,
    rarity_color: rarityHex(abbrev),
    element: normEl,
    element_label: normEl ? DISPLAY_LABEL[normEl] || normEl : null,
    image_url: resolveCatalogImageUrl(row.image_url),
    base_atk: row.base_atk != null ? Number(row.base_atk) : null,
    base_def: row.base_def != null ? Number(row.base_def) : null,
    base_spd: row.base_spd != null ? Number(row.base_spd) : null,
    base_hp: row.base_hp != null ? Number(row.base_hp) : null,
    base_power: row.base_power != null ? Number(row.base_power) : null,
    tcg_region: regionId,
    region_name: regionName,
    is_boss_card: Number(row.is_boss_card) === 1,
    source: row.source || 'member',
    stars: row.stars != null ? Number(row.stars) : null,
  };
}

function parseListQuery(req) {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  let pageSize = parseInt(String(req.query.pageSize || DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));

  const qRaw = req.query.q != null ? String(req.query.q).trim() : '';
  const q = qRaw.length > 200 ? qRaw.slice(0, 200) : qRaw;

  let rarities = [];
  if (req.query.rarity != null) {
    const raw = Array.isArray(req.query.rarity) ? req.query.rarity : String(req.query.rarity).split(',');
    rarities = raw
      .map((x) => String(x).trim().toUpperCase())
      .filter((a) => RARITY_ORDER.includes(a));
  }

  let elements = [];
  if (req.query.element != null) {
    const raw = Array.isArray(req.query.element) ? req.query.element : String(req.query.element).split(',');
    const setIds = new Set(ELEMENT_IDS);
    elements = raw
      .map((x) => normalizeElementKey(x))
      .filter(Boolean)
      .filter((e) => setIds.has(e));
  }

  let region = null;
  if (req.query.region != null && req.query.region !== '') {
    const r = Number(req.query.region);
    if (!Number.isNaN(r) && REGION_NAMES[r]) region = r;
  }

  let boss = null;
  if (req.query.boss === '1' || req.query.boss === 'true') boss = 1;
  if (req.query.boss === '0' || req.query.boss === 'false') boss = 0;

  let source = null;
  if (req.query.source != null && String(req.query.source).trim()) {
    source = String(req.query.source).trim().slice(0, 24);
  }

  const cls = req.query.class != null ? String(req.query.class).trim().slice(0, 120) : '';

  let sort = String(req.query.sort || 'rarity_desc').toLowerCase();
  const allowedSort = new Set([
    'rarity_desc',
    'rarity_asc',
    'name_asc',
    'name_desc',
    'newest',
  ]);
  if (!allowedSort.has(sort)) sort = 'rarity_desc';

  return {
    page,
    pageSize,
    q,
    rarities,
    elements,
    region,
    boss,
    source,
    class: cls,
    sort,
  };
}

function applyFilters(qb, f) {
  if (f.q) {
    const like = `%${f.q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    qb.where((w) => {
      w.where('card_data.name', 'like', like)
        .orWhere('card_data.description', 'like', like)
        .orWhere('card_data.class', 'like', like);
    });
  }

  if (f.rarities.length) {
    qb.whereIn('card_data.rarity', f.rarities);
  }

  if (f.elements.length) {
    qb.whereIn('card_data.element', f.elements);
  }

  if (f.region != null) {
    qb.where('card_data.tcg_region', f.region);
  }

  if (f.boss === 1) {
    qb.where('card_data.is_boss_card', 1);
  } else if (f.boss === 0) {
    qb.where((w) => {
      w.where('card_data.is_boss_card', 0).orWhereNull('card_data.is_boss_card');
    });
  }

  if (f.source) {
    qb.where('card_data.source', f.source);
  }

  if (f.class) {
    const like = `%${f.class.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    qb.where('card_data.class', 'like', like);
  }
}

function applySort(qb, sort) {
  const fieldList = RARITY_ORDER.map(() => '?').join(', ');
  switch (sort) {
    case 'rarity_asc':
      qb.orderByRaw(`FIELD(card_data.rarity, ${fieldList}) ASC`, [...RARITY_ORDER]);
      qb.orderBy('card_data.name', 'asc').orderBy('card_data.card_id', 'asc');
      break;
    case 'name_asc':
      qb.orderBy('card_data.name', 'asc').orderBy('card_data.card_id', 'asc');
      break;
    case 'name_desc':
      qb.orderBy('card_data.name', 'desc').orderBy('card_data.card_id', 'desc');
      break;
    case 'newest':
      qb.orderBy('card_data.updated_at', 'desc').orderBy('card_data.card_id', 'desc');
      break;
    case 'rarity_desc':
    default:
      qb.orderByRaw(`FIELD(card_data.rarity, ${fieldList}) DESC`, [...RARITY_ORDER]);
      qb.orderBy('card_data.name', 'asc').orderBy('card_data.card_id', 'asc');
  }
}

async function listCards(filters) {
  const { pageSize, sort } = filters;
  let { page } = filters;

  const countQ = db('card_data');
  applyFilters(countQ, filters);
  const countRow = await countQ.count('* as cnt').first();
  const total = Number(
    countRow?.cnt != null ? countRow.cnt : Object.values(countRow || {})[0] || 0,
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  page = Math.min(Math.max(1, page), totalPages);
  const offset = (page - 1) * pageSize;

  let rowsQuery = db('card_data').select(
    'card_data.card_id',
    'card_data.uuid',
    'card_data.name',
    'card_data.description',
    'card_data.class',
    'card_data.rarity',
    'card_data.stars',
    'card_data.element',
    'card_data.image_url',
    'card_data.base_atk',
    'card_data.base_def',
    'card_data.base_spd',
    'card_data.base_hp',
    'card_data.base_power',
    'card_data.tcg_region',
    'card_data.is_boss_card',
    'card_data.source',
    'card_data.updated_at',
  );
  applyFilters(rowsQuery, filters);
  applySort(rowsQuery, sort);
  rowsQuery = rowsQuery.limit(pageSize).offset(offset);

  const rows = await rowsQuery;
  const items = rows.map((r) => serializeRow(r));

  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
  };
}

async function getCardByUuid(uuid) {
  if (!uuid || String(uuid).length > 128) return null;
  const row = await db('card_data')
    .where('card_data.uuid', String(uuid))
    .first();

  return row ? serializeRow(row) : null;
}

/**
 * Filters + enums for bootstrapping the client (distinct sources from DB optional).
 */
async function getFacetMeta() {
  let sources = [];
  try {
    const rows = await db('card_data')
      .select('source')
      .whereNotNull('source')
      .groupBy('source')
      .orderBy('source', 'asc');
    sources = rows.map((r) => r.source).filter(Boolean);
  } catch {
    sources = ['member'];
  }

  return {
    rarities: RARITY_ORDER.map((abbrev) => ({
      abbrev,
      label: rarityNames[abbrev] || abbrev,
      chip_label: abbrev,
      color: rarityHex(abbrev),
    })),
    elements: ELEMENT_IDS.map((id) => ({
      id,
      label: DISPLAY_LABEL[id],
      icon_url: `/public/tcg-elements/${id}.png`,
    })),
    regions: Object.entries(REGION_NAMES).map(([id, label]) => ({
      id: Number(id),
      label,
    })),
    sources: sources.length ? sources : ['member'],
  };
}

module.exports = {
  parseListQuery,
  listCards,
  getCardByUuid,
  getFacetMeta,
  resolveCatalogImageUrl,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  RARITY_ORDER,
};
