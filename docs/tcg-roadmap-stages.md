# TCG implementation roadmap (staged gaps vs [CardSystem.md](../CardSystem.md))

This file lists **what is not yet implemented** (or only partially matches the design doc), broken into **stages** with **concrete deliverables**. It is meant for planning and sequencing work—not a status dashboard for every line of existing code.

**Convention:** Each bullet is a shippable slice of work you can track in isolation. Where the bot already does something close, the bullet says what still diverges from the doc.

---

## Stage 1 — Combat engine: passives, class identity, items

**Status:** Implemented (run migration `20260524120000_tcg_set_titles_catalog_signatures.js` for titles + catalog signatures).

Aligned today: turn order, HP, elemental multiplier on damage, regional rules (e.g. Void Archive mirror, Fractured Meridian SPD swap), synergy stat/gold modifiers with **60% cap** and **Elemental → Class → Set → Rarity → Region** priority ([CardSystem.md § Synergy System](../CardSystem.md)).

**Delivered**

- **Passives in battle** — `libs/tcgAbilityBattle.js` + `libs/tcgCombatMath.js` (`damageForHit`); `libs/tcgBattle.js` delegates to the ability-aware sim. Tier 1–4 seeds from `src/bot/tcg/tcgAbilitySeeds.js` with round hooks and log lines (incl. Soulbind PvP pot suppression).
- **Sovereign vs opponent items** — `opponentItemEffectsVsPlayer` / `opponentItemEffectsVsEnemy` sim opts (mults on ATK/DEF/SPD/HP). Blocked when the **target** has Sovereign. Holder’s own consumables (e.g. Null Ward) stay outside this path.
- **Class passives** — Guardian −5% incoming, Artisan +5% outgoing; Commander **+3%** PvE/spar battle gold.
- **Full Resonance** — `libs/tcgSynergy.js`: random Tier 2 battle ability (replaces old +12% all stats).
- **Set collection** — `libs/tcgCollectionSets.js`: **2/6** +2% battle gold (×1.02, [CardSystem.md]), **4/6** +5% breakdown, **5/6** +1 cap/member. **3/6** titles: `tcg_set_title_unlocks` + `/tcg titles`, synced on grant/trade/balance. **6/6 Mythic**: `tcg_catalog_signatures` + staff `/tcg staff set_signature`, else random Tier 4 (`libs/tcgSetProgress.js`).
- **Combat wiring** — PvE/spar/PvP pass `combat` + `signatureOverrideKey` when applicable.

**Optional later polish**

- Player-facing **equipped title** display in embeds (storage is unlock list only for now).
- Richer **Sovereign** copy when offensive shop items target the enemy in PvE/PvP.

---

## Stage 2 — PvE: bosses, pools, element weights

Aligned today: six regions, tier progression, battle boss flag, pool drop with 40% / 5% / 11-pity style behavior, some regional passives (gold, DEF, streak ATK, void mirror, SPD, SPD swap).

**Still missing or divergent**

- **Tier Boss as separate fight** — [CardSystem.md § Bosses](../CardSystem.md): end-of-tier fight *after* battle boss; seasonal pool per region; no duplicate member until pool exhausted; admin override slots; stat multipliers by tier band + Tier X extra Tier 3 ability.
- **Battle Boss vs Tier Boss rewards** — Separate drop rules, narration, and progression gates if doc distinguishes them from current “final battle of tier” model.
- **Element distribution by region** — [CardSystem.md § Element Distribution by Region](../CardSystem.md): absent / rare / uncommon / common / primary weights for encounters and **drop pools**; align `elementPoolForEncounter` / boss pools with the table.
- **Tier battle counts table** — [CardSystem.md § Tier Battle Counts](../CardSystem.md): verify every tier’s `battlesRequired` and boss positions (I–X counts, regions 5–6 VI–X only).
- **Region unlock gates** — [CardSystem.md § Unlock Gates](../CardSystem.md): confirm region 5+6 lock until prior region **all ten tiers** cleared (not only `max_region_unlocked` heuristics).
- **Boss card drop copy** — Doc: 40% first-own / 5% dupe / 11th pity for **tier boss’s own card**; ensure current battle-boss pool matches that story where applicable.

---

## Stage 3 — Economy & XP fidelity

Aligned today: gold wallet, XP conversion, daily claim, battle XP (PvE/PvP base), first-win-of-day bonus, message-driven XP with guild settings, TCG XP booster doubling message XP.

**Still missing or divergent**

- **Message XP cadence** — [CardSystem.md § XP System](../CardSystem.md): **15 XP** baseline and **1 minute per channel** cooldown (verify `libs/xpSystem.js` + `messages_per_xp` / guild settings match intent).
- **Gold sources table audit** — [CardSystem.md § Gold Sources](../CardSystem.md): line items like “Lending income | 40% of agreed loan price” vs implemented **upfront borrow fee** + **60/40 battle split**—reconcile copy, formulas, and any missing sources.
- **Loadout lock during battle** — [CardSystem.md § Loadout](../CardSystem.md): cannot change loadout during **active or pending** PvP/PvE session; enforce when challenge/pick/fight states exist.

---

## Stage 4 — Shop: featured slot & exclusives

Aligned today: regular combat/card/utility SKUs with daily server + player caps ([CardSystem.md § Item Shop](../CardSystem.md) tables).

**Still missing**

- **Featured slot rotation** — One featured item per day, **1–3 units**, announced in a **dedicated channel**; configurable UTC reset already mentioned for shop—extend for featured.
- **Pool A** — Discounted **existing** items (50–70% price); separate daily stock logic.
- **Pool B exclusives** — [CardSystem.md § Featured Item Slot](../CardSystem.md):
  - **Element Anchor** — permanent element lock; immune to reroll (and “by anyone” if multi-tenant); storage on `user_cards` or template flag.
  - **Golden Frame** — cosmetic border tier; persist for embeds/`image_url` or overlay metadata.
  - **Double Drop Token** — **2× card drop chance** next battle (boss pool / PvE drops).
  - **Season Recall** — ties to **season decay** (Stage 7); once per player per season.
  - **Boss Magnet** — set battle-boss pity to **10/11** for next boss fight.
- **Preservation Seal: wager protection** — Doc: protects from **wager loss**; needs **PvP card escrow** (Stage 6) before it is fully meaningful beyond reroll/trade/breakdown blocks.

---

## Stage 5 — Trading: depth & marketplace

Aligned today: single pair of instances, optional gold each side, **3% tax** on outgoing gold, Trade License on offer, 3 open offers/user, 24h expiry, sealed/lent/borrowed blocked.

**Still missing**

- **Multi-card offers** — [CardSystem.md § Trading System](../CardSystem.md): `offer: [cards] [gold] request: [cards] [gold]` — multiple instances per side, validation, and atomic swap.
- **Dual confirmation** — Both players confirm terms in an embed (not only counterparty **accept** on a pending row).
- **`trademarket` public listings** — List open **public** offers; filters: rarity, element, class; optional “direct to user” vs public flag on offers.
- **Escrow flag on `user_cards`** — [CardSystem.md § Inventory](../CardSystem.md): traded/wagered copies in escrow; block breakdown, lend, loadout changes consistently (`is_escrowed` usage outside PvP).

---

## Stage 6 — PvP: wagers, flow, ranks (non-season)

Aligned today: challenge → accept (gold escrow) → both pick → sim → **5% house** on gold pot; **30m pair cooldown** when wager > 0; **500g** cap stub; borrowed cards cannot be picked; no synergies in PvP sim.

**Still missing**

- **Decline challenge** — Explicit decline; release any reserved state; match **10m accept** deadline behavior in doc.
- **Pick timeout outcome** — [CardSystem.md § Wager Rules](../CardSystem.md): **5m** pick window → **forfeit to opponent**, not split refund (current expire handler refunds pot).
- **Gold-only cooldown bypass** — Doc: **no RP on the line** bypasses cooldown; implement RP flag (even placeholder) or equivalent rule.
- **Card wagers** — Escrow **both sides’** card instances on accept; transfer ownership on win; **5% tax on gold portion only** (keep card value untaxed).
- **Wager validation** — Only copy / loadout-not-empty rules; Preservation Seal blocks **card** wager; lent cards blocked (already for picks).
- **Wager caps by rank** — [CardSystem.md § Wager Caps by PvP Rank](../CardSystem.md): max gold **and** max **card rarity** by Bronze→Champion; requires `users`/`user_wallets` PvP rank fields and cap checks before accept.
- **Hidden synergies in PvP** — [CardSystem.md § Synergy System](../CardSystem.md): apply loadout synergy in resolution but **reveal only in result embed** (opponent does not see mid-fight).
- **Public result announcement** — Optional guild channel post for `@challenger` vs `@target` with outcome (doc PvP example format).
- **RP gain/loss per match** — [CardSystem.md § Ranking Points](../CardSystem.md) — implement base RP delta before full seasons if desired (wager size + opponent rank scaling).

---

## Stage 7 — PvP seasons, decay, rewards, leaderboards

**Not started** (no season id, RP persistence, or champion cap in schema described in this repo’s migrations summary).

- **Season calendar** — Winter / Spring / Summer / Autumn windows ([CardSystem.md § Season Calendar](../CardSystem.md)).
- **Rank ladder** — Bronze → Champion; **Champion = top 50** server-wide enforcement.
- **RP formula** — Win/loss scaling by wager and opponent rank; bonus for beating higher rank.
- **Soft season start** — First **two weeks**: boosted RP ([CardSystem.md § PvP Seasons & Rankings](../CardSystem.md)).
- **Season end job** — Activity threshold (default 10 fights); decay table (active −1 tier, inactive −2, Bronze floor); **Season Recall** item integration.
- **Season end rewards** — Ranked gold packs / cards / exclusive Mythic for Champion.
- **Commands** — `leaderboard` (season RP, all-time wins, region clears, gold), `rank` / `rank @user` per doc.

---

## Stage 8 — Lending: marketplace & lifecycle polish

Aligned today: targeted offer/accept, upfront price, duration, optional max battles, borrower copy with `lent_source_user_card_id`, 60/40 PvE/spar gold split, Recall Token, borrower return, expiry/battle-cap completion.

**Still missing or divergent**

- **`lendmarket` public listings** — Filter by rarity, class, element, price ([CardSystem.md § Lend Marketplace](../CardSystem.md)).
- **Borrower copy labeling** — Show **`[LENT]`** (or equivalent) in `/tcg inventory` and embeds.
- **Notify on expiry in loadout** — [CardSystem.md § Lending Rules](../CardSystem.md): if loan ends while equipped, auto-unequip and **notify** borrower (DM or channel).
- **Levels while lent** — Doc: level gains **stick to owner’s card**; verify fuse/level-up paths on borrower copy vs owner template.
- **Payment timing** — Doc wording: “when duration expires … payment **releases** to owner”; today price is **on accept**—decide if post-paid or hybrid and align doc + UX.

---

## Stage 9 — Narration, admin, config

- **Battle narration short format** — [CardSystem.md § Battle Narration](../CardSystem.md): round lines, ability procs, boss headers, PvP result template with hidden synergy reveal.
- **Shop / featured reset** — “Midnight UTC (**configurable**)” — centralize config for shop + featured + daily boundaries if not already.
- **Admin overrides** — Tier boss slot assignments, tournament PvP cooldown bypass ([CardSystem.md § Bosses / PvP](../CardSystem.md)).
- **Champion slot maintenance** — Periodic job to trim to top 50 when Stage 7 exists.

---

## Stage 10 — QA passes tied to doc tables

- **Pack pity numbers** — [CardSystem.md § Pack Pity System](../CardSystem.md): Basic 10 without UC → guarantee; Advanced 10 without EP; Premium 20 L / 50 M — verify against `libs/tcgPacks.js` and wallet columns.
- **Direct buy & pack costs** — Compare all gold values in [CardSystem.md § Card Acquisition](../CardSystem.md) to `tcgPacks` / `tcgDirectBuy`.
- **PvE gold table** — [CardSystem.md § Gold Sources](../CardSystem.md) tier bands vs `tcgPveConfig` `baseGoldForTier` / boss / clear bonuses.

---

## How to use this file

1. Pick a **stage** based on dependencies (e.g. PvP card escrow before Preservation “wager loss” is meaningful).
2. Turn bullets into issues/PRs; keep each PR scoped to one or two bullets where possible.
3. When something ships, **remove or strike** the bullet here (or move to a “Done” appendix) so the file stays a living gap list.

---

## Related project docs

- [`docs/tcg-stage0-foundations.md`](tcg-stage0-foundations.md) — early slash/ERD mapping (may predate current code; use CardSystem + codebase as source of truth for behavior).
