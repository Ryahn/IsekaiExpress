const { ADVANTAGE_VS, normalizeElementKey } = require('../src/bot/tcg/elements');
const { normalizeRarityKey } = require('../src/bot/tcg/cardLayout');
const { REGION_NAMES } = require('./tcgPveConfig');

const SYN_CAP = 0.6;

/** Priority when over cap: Elemental → Class → Set → Rarity → Region — [CardSystem.md] */
const PRIO = { elemental: 1, class: 2, set: 3, rarity: 4, region: 5 };

const RARITY_ORDER = ['C', 'UC', 'R', 'EP', 'L', 'M'];

function rarityIndex(norm) {
  const k = normalizeRarityKey(norm);
  const i = RARITY_ORDER.indexOf(k);
  return i >= 0 ? i : 0;
}

/**
 * @param {{ element?: string|null, rarity?: string|null, member_id?: number|null }|null} c
 */
function normEl(c) {
  if (!c || c.element == null) return null;
  return normalizeElementKey(c.element);
}

/** Three distinct elements forming a directed cycle (each beats the next). [CardSystem.md] Triangle. */
function isElementCycleTriangle(a, b, c) {
  if (!a || !b || !c) return false;
  if (a === b || b === c || a === c) return false;
  const orderings = [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];
  for (const [x, y, z] of orderings) {
    if (
      ADVANTAGE_VS[x]
      && ADVANTAGE_VS[x].has(y)
      && ADVANTAGE_VS[y].has(z)
      && ADVANTAGE_VS[z].has(x)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {{ class?: string|null }|null} c
 * @returns {{ key: string }|null}
 */
function normClassKey(c) {
  if (!c || c.class == null || String(c.class).trim() === '') return null;
  const s = String(c.class).trim().toLowerCase();
  if (['commander', 'staff'].includes(s)) return { key: 'commander' };
  if (['guardian', 'mod', 'mods', 'moderator'].includes(s)) return { key: 'guardian' };
  if (['artisan', 'uploader', 'uploaders'].includes(s)) return { key: 'artisan' };
  return { key: s };
}

/** Primary stat emphasized by class — [CardSystem.md] Commander/Guardian/Artisan flavor. */
function classPrimaryStat(classKey) {
  if (classKey === 'commander' || classKey === 'guardian') return 'def';
  if (classKey === 'artisan') return 'atk';
  return 'atk';
}

function prettyClassLabel(classKey) {
  if (classKey === 'commander') return 'Commander';
  if (classKey === 'guardian') return 'Guardian';
  if (classKey === 'artisan') return 'Artisan';
  return classKey.charAt(0).toUpperCase() + classKey.slice(1);
}

/**
 * @param {number} pct
 * @param {'atk'|'def'|'spd'|'hp'} primary
 */
function primaryStatSlice(pct, primary) {
  const o = { atk: 0, all: 0, def: 0, highest: 0, spd: 0, hp: 0 };
  if (primary === 'atk') o.atk = pct;
  else if (primary === 'def') o.def = pct;
  else if (primary === 'spd') o.spd = pct;
  else if (primary === 'hp') o.hp = pct;
  return o;
}

/**
 * @param {{ main: object|null, support1: object|null, support2: object|null }} loadout
 * @param {string|null} enemyElement - opponent main element (for Counter Build)
 * @param {number|null|undefined} pveRegion - current PvE region 1–6 (spar / non-PvE: omit)
 */
function computeCombatSynergy(loadout, enemyElement, pveRegion = null) {
  const main = loadout.main;
  const s1 = loadout.support1;
  const s2 = loadout.support2;
  const enemyEl = normalizeElementKey(enemyElement);

  const mEl = normEl(main);
  const e1 = normEl(s1);
  const e2 = normEl(s2);

  const raw = [];

  const weaknessImmune = Boolean(
    main && s1 && s2 && mEl && e1 && e2 && mEl === e1 && mEl === e2,
  );

  let goldMult = 1;
  const rk = (c) => (c && c.rarity ? normalizeRarityKey(c.rarity) : null);
  const k0 = rk(main);
  const k1 = rk(s1);
  const k2 = rk(s2);
  if (k0 && k0 === k1 && k1 === k2) {
    goldMult *= 1.05;
  }

  if (main && s1 && s2 && mEl && e1 && e2) {
    if (mEl === e1 && mEl === e2) {
      raw.push({
        prio: PRIO.elemental,
        id: 'mono',
        label: 'Mono Element (+15% ATK, weakness immunity)',
        atk: 0.15,
        all: 0,
        def: 0,
        highest: 0,
      });
    } else if (mEl === e1 && e2 !== mEl) {
      raw.push({
        prio: PRIO.elemental,
        id: 'dual',
        label: 'Dual Element (+8% ATK)',
        atk: 0.08,
        all: 0,
        def: 0,
        highest: 0,
      });
    } else if (mEl === e2 && e1 !== mEl) {
      raw.push({
        prio: PRIO.elemental,
        id: 'dual',
        label: 'Dual Element (+8% ATK)',
        atk: 0.08,
        all: 0,
        def: 0,
        highest: 0,
      });
    } else if (isElementCycleTriangle(mEl, e1, e2)) {
      raw.push({
        prio: PRIO.elemental,
        id: 'triangle',
        label: 'Triangle (+10% all stats, +5% battle gold)',
        atk: 0,
        all: 0.1,
        def: 0,
        highest: 0,
      });
      goldMult *= 1.05;
    }

    if (
      enemyEl
      && e1
      && e2
      && ADVANTAGE_VS[e1]
      && ADVANTAGE_VS[e1].has(enemyEl)
      && ADVANTAGE_VS[e2]
      && ADVANTAGE_VS[e2].has(enemyEl)
    ) {
      raw.push({
        prio: PRIO.elemental,
        id: 'counter',
        label: 'Counter Build (+12% ATK)',
        atk: 0.12,
        all: 0,
        def: 0,
        highest: 0,
      });
    }
  }

  if (main && s1 && s2) {
    const c0 = normClassKey(main);
    const c1 = normClassKey(s1);
    const c2 = normClassKey(s2);
    if (c0 && c1 && c2) {
      const keys = [c0.key, c1.key, c2.key];
      const distinct = new Set(keys);
      if (distinct.size === 3) {
        raw.push({
          prio: PRIO.class,
          id: 'balanced',
          label: 'Balanced Formation (+5% all stats)',
          atk: 0,
          all: 0.05,
          def: 0,
          highest: 0,
          spd: 0,
          hp: 0,
        });
      } else if (distinct.size === 1) {
        const k = c0.key;
        const primary = classPrimaryStat(k);
        const slice = primaryStatSlice(0.15, primary);
        raw.push({
          prio: PRIO.class,
          id: 'class_triple',
          label: `3× ${prettyClassLabel(k)} (+15% ${primary.toUpperCase()})`,
          ...slice,
        });
      } else if (distinct.size === 2) {
        const counts = {};
        for (const k of keys) counts[k] = (counts[k] || 0) + 1;
        const pairKey = Object.keys(counts).find((k) => counts[k] === 2);
        if (pairKey) {
          const primary = classPrimaryStat(pairKey);
          const slice = primaryStatSlice(0.08, primary);
          raw.push({
            prio: PRIO.class,
            id: 'class_pair',
            label: `2× ${prettyClassLabel(pairKey)} (+8% ${primary.toUpperCase()})`,
            ...slice,
          });
        }
      }
    }
  }

  const mid = (c) => (c && c.member_id != null ? Number(c.member_id) : null);
  const mM = mid(main);
  const m1 = mid(s1);
  const m2 = mid(s2);
  if (main && s1 && s2 && mM != null && mM === m1 && mM === m2) {
    raw.push({
      prio: PRIO.set,
      id: 'full_resonance',
      label: 'Full Resonance (+12% all stats)',
      atk: 0,
      all: 0.12,
      def: 0,
      highest: 0,
    });
  } else if (main && s1 && s2) {
    const samePair =
      (mM != null && m1 != null && mM === m1)
      || (mM != null && m2 != null && mM === m2)
      || (m1 != null && m2 != null && m1 === m2);
    if (samePair) {
      raw.push({
        prio: PRIO.set,
        id: 'echo',
        label: 'Echo Bond (+7% highest stat)',
        atk: 0,
        all: 0,
        def: 0,
        highest: 0.07,
      });
    }
  }

  if (main && s1 && s2 && k0 && k1 && k2) {
    const r0 = rarityIndex(main.rarity);
    const r1 = rarityIndex(s1.rarity);
    const r2 = rarityIndex(s2.rarity);
    if (r0 === r1 && r1 === r2) {
      raw.push({
        prio: PRIO.rarity,
        id: 'pure',
        label: 'Pure Resonance (+10% all stats, +5% battle gold)',
        atk: 0,
        all: 0.1,
        def: 0,
        highest: 0,
      });
    } else if (r0 < r1 && r1 < r2) {
      raw.push({
        prio: PRIO.rarity,
        id: 'rising',
        label: 'Rising Force (+12% ATK)',
        atk: 0.12,
        all: 0,
        def: 0,
        highest: 0,
      });
    } else if (r0 > r1 && r1 > r2) {
      raw.push({
        prio: PRIO.rarity,
        id: 'anchor',
        label: 'Anchor Formation (+15% DEF)',
        atk: 0,
        all: 0,
        def: 0.15,
        highest: 0,
      });
    }
  }

  const fightR =
    pveRegion != null && Number(pveRegion) >= 1 && Number(pveRegion) <= 6
      ? Number(pveRegion)
      : null;
  if (fightR != null && main) {
    const cardReg = (c) => {
      if (!c || c.tcg_region == null || c.tcg_region === '') return null;
      const r = Number(c.tcg_region);
      if (!Number.isFinite(r) || r < 1 || r > 6) return null;
      return r;
    };
    const rM = cardReg(main);
    const r1 = cardReg(s1);
    const r2 = cardReg(s2);
    let matchCount = 0;
    if (rM === fightR) matchCount += 1;
    if (r1 === fightR) matchCount += 1;
    if (r2 === fightR) matchCount += 1;

    const regionLabel = REGION_NAMES[fightR] || `Region ${fightR}`;
    const tripleEquipped = Boolean(main && s1 && s2);

    if (tripleEquipped && matchCount === 3) {
      raw.push({
        prio: PRIO.region,
        id: 'home_turf',
        label: `Home Turf (+20% all in ${regionLabel})`,
        atk: 0,
        all: 0.2,
        def: 0,
        highest: 0,
      });
    } else if (matchCount === 2) {
      raw.push({
        prio: PRIO.region,
        id: 'region_pair',
        label: `Regional bond (+10% all in ${regionLabel})`,
        atk: 0,
        all: 0.1,
        def: 0,
        highest: 0,
      });
    }
  }

  raw.sort((a, b) => a.prio - b.prio || a.id.localeCompare(b.id));

  let budget = SYN_CAP;
  let atk = 0;
  let all = 0;
  let def = 0;
  let highest = 0;
  let spd = 0;
  let hp = 0;
  const appliedLabels = [];

  for (const b of raw) {
    const want =
      (b.atk || 0)
      + (b.all || 0)
      + (b.def || 0)
      + (b.highest || 0)
      + (b.spd || 0)
      + (b.hp || 0);
    if (want <= 0) continue;
    if (budget <= 0) {
      break;
    }
    const take = Math.min(want, budget);
    budget -= take;
    const s = take / want;
    atk += (b.atk || 0) * s;
    all += (b.all || 0) * s;
    def += (b.def || 0) * s;
    highest += (b.highest || 0) * s;
    spd += (b.spd || 0) * s;
    hp += (b.hp || 0) * s;
    if (take >= want - 1e-9) appliedLabels.push(b.label);
    else if (take > 0) appliedLabels.push(`${b.label} _(capped)_`);
  }

  return {
    atk,
    all,
    def,
    highest,
    spd,
    hp,
    weaknessImmune,
    goldMult,
    summaryLines: appliedLabels,
  };
}

/**
 * @param {{ atk: number, def: number, spd: number, hp: number }} stats
 * @param {{ atk: number, all: number, def: number, highest: number, spd?: number, hp?: number }} mod
 */
function applySynergyToStats(stats, mod) {
  const base = { ...stats };
  let hiKey = 'atk';
  for (const k of ['atk', 'def', 'spd', 'hp']) {
    if (base[k] > base[hiKey]) hiKey = k;
  }
  const h = mod.highest || 0;
  const bump = (key, specDef) => {
    const mult = 1 + mod.all + (specDef || 0) + (key === hiKey ? h : 0);
    return Math.max(1, Math.round(base[key] * mult));
  };
  return {
    atk: bump('atk', mod.atk),
    def: bump('def', mod.def),
    spd: bump('spd', mod.spd || 0),
    hp: bump('hp', mod.hp || 0),
  };
}

module.exports = {
  SYN_CAP,
  computeCombatSynergy,
  applySynergyToStats,
};
