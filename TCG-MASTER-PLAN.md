# TCG Master Plan — Single Source of Truth
*Consolidated from: tcg-roadmap-stages.md, card_system_integration_gap plan, rarity_weight_roll_system plan, tcg_template_vs_instance plan, and cursor transcript (cursor_card_layout_updates_for_new_card.md). Generated 2026-04-26.*

---

## How to use this file

- **This file is the truth.** All older plan files are retired.
- Give this to Cursor: "Review the codebase against this plan. Mark each item `[x]` if fully implemented, `[-]` if partial, `[ ]` if not started. Add a one-line note on anything partial."
- When something ships, check the box and add the relevant file(s) in a note.

---

## Architecture: The Three Layers (Non-Negotiable)

```
card_data          → Static catalog templates. 110 per member (11 rarities × 10 elements).
                     Holds: base_atk, base_def, base_spd, base_hp, base_power, image_path,
                     rarity (full abbreviation), element, member_id, class, discord_id.
                     Written by: master.js / create_card.js. IMMUTABLE after generation.

user_cards         → Per-player instances. Created on loot/grant only.
                     Holds: player_id, card_data_id (FK), level (1–5), ability_key (rolled
                     on grant), acquired_at, is_lent, is_escrowed.
                     Rarity/element read via JOIN to card_data — NOT stored again here.

Encounter layer    → In-memory only (PvE fights). Base stats × region/tier multipliers.
                     Never written back to card_data or user_cards.
```

**Discord embeds** merge `card_data` (static art URL, base stats) + `user_cards` (level, ability) and compute effective power at display time using:
`power = base_power × (1 + 0.15 × (level − 1))` — **linear** multiplier (not compound).

---

## Card Progression Systems (Locked)

### Fusion
Combine cards to climb rarity tiers. Output is always a card.

- **Same rarity + same element** → base resource cost, highest success rate
- **Same rarity + mixed elements** → increased resource cost
- **Cost scales with grade** of cards being fused — e.g. fusing 6 A-grade + 1 S-grade into an S requires Diamonds + Rubies
- **Pity system:** one global counter across all fusion attempts regardless of rarity tier; counter resets on success
- Resource costs follow the Regrade tiers below (same-element = base, mixed = multiplied)

### Forge
Sacrifice cards for resources or a gamble. Output is resources or a random card. **No pity.**

- **Guaranteed path:** always yields Shards; baseline output for junk cards
- **Gamble path:** RNG roll — chance at a better card, chance at bonus Shards, chance at Diamonds or Rubies (rare)
- Rubies can drop from Forge (rarest outcome)
- Primary player sink for unwanted cards

### Regrade (D → C → B → A → S)
Spend resources to upgrade a card's Grade. Grade is **display and prestige only** — no stat impact currently, but the resource tier architecture supports adding stat layers later without rework.

**Resource bands:**

| Upgrade | Preferred resource | Fallback (costs significantly more) |
|---|---|---|
| D → C | Shards | — |
| C → B | Shards | — |
| B → A | Diamonds | Shards (heavy cost) |
| A → S | Rubies | Diamonds (heavy cost) |

- **Pity system:** tracked per card; repeated failures eventually guarantee the next regrade success
- Grade shown on card embed and `/tcg inventory`

### Resources

| Resource | Primary sources | Notes |
|---|---|---|
| Shards | Forge (guaranteed output), low-tier expedition drops | Most common; used D→C, C→B |
| Diamonds | Forge (chance drop), high-end PvE/boss kills, Diamond Mine expedition | Mid-tier; preferred B→A |
| Rubies | Forge (rare drop), high-tier boss kills, Ruby Mine expedition | Rarest; preferred A→S |

### Expeditions
Send any card in inventory on a timed passive run. Card is **unavailable for combat** while on expedition.

- **Unlocked per region** — must have beaten that region in PvE to send cards there
- Duration is time-gated; player claims rewards on return
- **Standard expeditions:** gold + XP, small Shard drop chance
- **Mine expeditions** — special expedition type, separate from standard:
  - **Diamond Mine:** unlocked at mid-game region clear; yields Diamonds passively
  - **Ruby Mine:** unlocked at late-game region clear; yields Rubies passively
- Mine expeditions use the same card-lock mechanic; no combat while mining

### Capture Chance (PvE Boss Drop)
On a boss kill, in addition to the standard rarity-rolled pool drop, there is a small flat % chance the drop is specifically that boss member's card template (same rarity, that member). Makes bosses feel like targeted hunts rather than pure weighted RNG.

---

## Rarity System (Locked)

**11 first-class abbreviations (canonical order, lowest → highest):**
```
N, C, UC, R, U, SR, SSR, SUR, UR, L, M
```

**Single source of ordering:** `src/bot/tcg/rarityOrder.js` — exports `RARITY_ORDER`, `rarityRank()`, `sanitizeRarityAbbrev()`, `isRareOrBetter()`, `nextRarityInOrder()`. Import this everywhere. No ad-hoc tier lists in individual files.

**`card_data.rarity`** stores the abbreviation verbatim. No `normalizeRarityKey`. No `EP` anywhere.

**`rarity` table:** `abbreviation`, `name`, `weight`, `stars`. No `high_chance`/`low_chance`.

**Direct buy rule (locked):** M and L are **drops/loot only**. Not purchasable with gold. Can be obtained via player-to-player trade or sale. `libs/tcgDirectBuy.js` must have an explicit `DIRECT_BUY_BANNED_RARITIES = ['L', 'M']` guard with a clear user-facing error message — not just a missing key.

---

## Card Art Pipeline (Locked)

- **110 PNGs per member:** `src/bot/media/cards/{member_slug}/{rarity_slug}/{element}.png`
- **Rarity slug** = snake_case of rarity `name` from seed (e.g. `ultra_rare`, `mythic`, `super_super_rare`)
- **Base card frame:** `tools/base_card/{rarity_name_snake_case}.png` (e.g. `ultra_rare.png`)
- **Baked on PNG:** rarity frame, element icon, member name, class, star row
- **NOT on PNG:** level, power score, ability/trait icon — these are embed-only

**Card geometry (`CARD` in `cardLayout.js`):**
| Layer | Position |
|---|---|
| Portrait | top-left (176, 252), 669×623 |
| Name/Title | center (509, 978), maxWidth 671 |
| Description/Class | box (137, 1099), 747×229, center (510, 1213) |
| Element icon | center (511, 1427), 110×110 |
| Star row | centered horizontally, cy = name.cy − 20 (i.e. y≈958), 15×15px stars, 4px gap |

---

## Implementation Status Checklist

*Instructions for Cursor: Check each item against the actual codebase files and mark accordingly.*

### ✅ FOUNDATIONS (Stage 0) — Expected: Complete

- [x] Slash-first command map implemented
- [x] ERD reflects `card_data` (catalog) vs `user_cards` (instances)
- [x] Objection/Knex ORM aligned: `user_cards`, `card_data`, `User.js`, `Card.js`, `UserCard.js`
- [x] `users_card` / `user_cards` naming conflict resolved in migrations

### ✅ CARD LAYOUT & ART PIPELINE (Stage 1a) — Expected: Complete

- [x] `cardLayout.js` updated to new geometry (portrait, name, description, element, star row)
- [x] `drawGlowingTextWrappedInBox` implemented for class/description region
- [x] `drawRarityStarRow` implemented (`tools/star.png`, 15×15, 4px gap, centered, 20px above name)
- [x] `resolveBaseCardPath` uses abbreviation → name → snake_case → file (e.g. `UR` → `ultra_rare.png`)
- [x] `create_card.js` uses new layout; no longer imports `drawClassPillText`
- [x] `cardLayoutForRarityCatalog` is the catalog renderer (no level/power/ability on bitmap)

### ✅ RARITY MODEL — 11 ABBREVIATIONS (Stage 1b) — Expected: Complete

- [x] Migration: `rarity.weight` added, `high_chance`/`low_chance` dropped
- [x] `seeds/rarity.js`: 11 rows only (`M, L, UR, SUR, SSR, SR, U, R, UC, C, N`), correct `weight` + `stars`; no `EP` row; `AUX_RARITY_STARS.EP` removed or remapped
- [x] `libs/tcgRarityRoll.js`: `rollRarity()`, `applyRegionModifier()`, `applyTierModifier()`
- [x] `libs/tcgRarityModifiers.js`: region + tier modifier maps (default 1)
- [x] `src/bot/tcg/rarityOrder.js`: `RARITY_ORDER`, `rarityRank()`, `sanitizeRarityAbbrev()`, `isRareOrBetter()`, `nextRarityInOrder()`
- [x] `libs/cardSystem.js`: `selectRarity` uses `rollRarity`; `normalizeRarityKey` deleted
- [x] `libs/tcgPacks.js`: DB-driven weights, `where({ rarity: rolled.abbreviation })`; pity counters use abbreviations
- [x] `libs/tcgPve.js`: boss drop pools use `rollRarity` + `where({ rarity: rolled.abbreviation })`; `normalizeRarityKey` gone
- [-] `libs/tcgDirectBuy.js`: purchasable tiers only; explicit `L`/`M` block + user error message — uses `DIRECT_BUY_DROPS_ONLY` Set (not the literal name `DIRECT_BUY_BANNED_RARITIES`).
- [x] `libs/tcgInventory.js`: `nextRarityTier()` delegates to `nextRarityInOrder()` / `sanitizeRarityAbbrev()` from `rarityOrder.js` (no separate bump-order symbol)
- [x] `libs/tcgSynergy.js`: `RARITY_ORDER` + `rarityRank` from `rarityOrder.js`
- [x] `libs/tcgAbilityBattle.js`: `rarityIdx` uses `rarityRank`; no `normalizeRarityKey`
- [x] `libs/tcgPvp.js`, `libs/tcgSpar.js`: Mythic checks via `sanitizeRarityAbbrev`
- [x] `src/bot/tcg/abilityPools.js`: `rarityToAbilityTier` maps all 11 abbrevs to tiers 1–4
- [x] `batch_worker.js`: `BATCH_RARITY_KEYS = [...RARITY_ORDER]` (all 11)
- [x] `import_from_discord.js`: `ALL_TIERS_ON` built from `RARITY_ORDER`
- [x] `src/bot/commands/slashCommands/tcg/tcg.js`: no "EP"/"Epic" copy; `buy_card` choices from `DIRECT_BUY_GOLD_BY_RARITY` (no L/M); pack copy uses SSR+ language
- [-] Grep confirms zero remaining `normalizeRarityKey`, `high_chance`, `low_chance`, `\bEP\b` in app code (excluding node_modules, public/vendors) — `libs/tcgPveConfig.js` comment still says legacy `EP` bucket (non-executable).
- [-] Smoke test (`scripts/tcgRarityRoll.smoke.js`) passes: weight sum, Monte Carlo M rate, per-abbrev template resolution — script checks roll distribution + boss band, not DB `card_data` template rows per abbrev.

### ✅ CATALOG PIPELINE & BATCH (Stage 1c) — Expected: Complete

- [-] `master.js` awaits each batch worker; uses long timeout (≥ minutes for 60 cards × N members) — timeout still scales with `CARDS_PER_CHARACTER = 60` while `batch_worker` generates **11 × elements** per character (underestimates worst-case duration).
- [x] `batch_worker.js` iterates full `BATCH_RARITY_KEYS × ELEMENT_IDS`
- [-] `card_data` migration has: `base_atk`, `base_def`, `base_spd`, `base_hp`, `base_power`, `rarity` (varchar, full abbrev), `element`, `image_path`, `member_id`, `class`, `discord_id` — column is `image_url` (longtext), not `image_path`; otherwise fields exist (incl. later migrations).
- [-] `user_cards` migration has: `player_id`, `card_data_id` (FK), `level`, `ability_key`, `acquired_at`, `is_lent`, `is_escrowed` — FK columns are `user_id` and `card_id` (semantic match, different names).
- [x] No `rarity` column on `user_cards` (rarity read via JOIN only)
- [x] `grantTemplateWithTrx` in `libs/tcgInventory.js` inserts `user_cards` row with `ability_key` roll on grant

### ✅ DATA MODEL (Stage 1d) — Expected: Complete

- [x] Three-layer model documented in `CardSystem.md` (card_data / encounter / user_cards)
- [x] `CardSystem.md` level multiplier formula confirmed as **linear** `1 + 0.15 × (level − 1)` (not compound)
- [-] `CardSystem.md` purged of "Epic", "EP", six-tier language — rarity ladder / base-stats tables still use old six-tier labels; pack pity / direct buy sections updated.
- [x] Enemy PvE scaling decision documented: currently scales with player card level AND region/tier; intentional

---

### 🔲 STAGE 2 — Economy & XP — Pending

- [x] Gold wallet (`user_wallets` or equivalent)
- [x] XP → gold convert
- [x] Daily login claim with XP/gold hooks
- [x] Battle XP hooks (PvE/PvP)
- [x] First-win-of-day bonus
- [-] Message XP: 15 XP baseline, 1-minute per-channel cooldown — `libs/xpSystem.js` uses guild `xp_settings` (`messages_per_xp`, random min–max gain); DB defaults are not fixed at 15 XP / 1 msg/min.
- [-] Gold sources table matches `CardSystem.md § Gold Sources` (including lending income split) — lending uses upfront fee + 60/40 PvE/spar split; not the doc’s single “40% of agreed loan price” line as sole rule.
- [x] TCG XP booster doubles message XP

---

### 🔲 STAGE 3 — Inventory & Collection — Pending

All operations use `card_data_id` + `user_cards` instance row. Never regenerate PNG.

- [x] `giveCard` fully implemented: inserts `user_cards` row (card_data_id, player_id, ability_key, level=1, flags)
- [x] Inventory caps enforced
- [x] Breakdown (destroy card for resources)
- [x] Fuse/level-up (level 1→5 via combining; levels stick to owner's card even when lent)
- [x] Set bonuses
- [x] Elemental reroll
- [x] `list_all_cards` pagination/search working for large `card_data` (~110 templates × members)
- [ ] Loadout lock enforced during active/pending PvP/PvE session
- [ ] **Class Diversity Bonus** — `libs/tcgSynergy.js` checks loadout for 1× each class before battle sim
- [ ] Class Diversity Bonus: Guardian lead +5% DEF, Artisan lead +5% ATK, Commander lead +5% gold — stacks with individual class passive
- [ ] Class Diversity Bonus applies to PvE, spar, and PvP
- [ ] Embed shows diversity bonus active (e.g. "Class Synergy ✓") when triggered

#### Fusion
- [ ] Schema: `tcg_fusion_pity` table — `player_id`, `attempt_count`, `last_attempt_at` (global counter, resets on success)
- [ ] `libs/tcgFusion.js`: validate same-rarity input cards; calculate resource cost (same element = base rate, mixed elements = increased cost, scales with input card grades per Regrade band)
- [ ] Fusion output: always a card one rarity tier higher via `grantTemplateWithTrx`
- [ ] Pity: guarantee success after threshold; reset global counter on any success
- [ ] Slash: `/tcg fusion` — select cards, preview cost breakdown, confirm

#### Forge
- [ ] Schema: no pity table needed
- [ ] `libs/tcgForge.js`: accept 1+ cards; **guaranteed path** yields Shards; **gamble path** RNG rolls — better card / bonus Shards / Diamonds (chance) / Rubies (rare chance)
- [ ] Cards destroyed on Forge regardless of path
- [ ] Slash: `/tcg forge` — select card(s), choose guaranteed or gamble, confirm

#### Regrade (D → C → B → A → S)
- [ ] Schema: `grade` column on `user_cards` (enum: D, C, B, A, S, default D); `regrade_pity` int column per card
- [ ] `libs/tcgRegrade.js`: validate resource availability; apply cost per band; roll success/fail; increment `regrade_pity` on fail, reset on success
- [ ] Cost bands: D→C and C→B use Shards; B→A prefers Diamonds (Shards accepted at heavy multiplier); A→S prefers Rubies (Diamonds accepted at heavy multiplier)
- [ ] Grade shown in card embed and `/tcg inventory`
- [ ] Slash: `/tcg regrade` — select card, shows current grade + cost + pity progress, confirm

#### Resources
- [ ] Schema: `shards`, `diamonds`, `rubies` columns on `user_wallets` (or equivalent)
- [ ] Shards: awarded from Forge guaranteed path and low-tier expedition drops
- [ ] Diamonds: awarded from Forge gamble (chance), high-end PvE/boss kills, Diamond Mine expedition
- [ ] Rubies: awarded from Forge gamble (rare), high-tier boss kills, Ruby Mine expedition
- [ ] Resource balances shown in `/tcg profile` or `/tcg inventory`

#### Expeditions
- [ ] Schema: `tcg_expeditions` — `player_id`, `user_card_id` (FK), `region`, `expedition_type` (enum: standard / diamond_mine / ruby_mine), `started_at`, `returns_at`, `claimed`
- [ ] Card flagged unavailable for combat and loadout while active expedition row exists
- [ ] Region gate: player must have cleared that PvE region before sending cards there
- [ ] Standard expedition rewards on claim: gold + XP + small Shard drop chance
- [ ] Diamond Mine: unlocked at mid-game region clear; yields Diamonds on claim
- [ ] Ruby Mine: unlocked at late-game region clear; yields Rubies on claim
- [ ] Slash: `/tcg expedition send`, `/tcg expedition view`, `/tcg expedition claim`
- [ ] Optional DM alarm when expedition returns

#### Capture Chance (Boss Drop)
- [ ] On boss kill, roll a flat % chance for a targeted drop of that boss member's specific card template (in addition to standard pool drop)
- [ ] Capture % defined as a config constant in `libs/tcgPveConfig.js`
- [ ] On capture trigger, insert `user_cards` row via `grantTemplateWithTrx` for that specific `card_data` template

---

### 🔲 STAGE 4 — Shop: Featured Slot & Exclusives — Pending

- [x] Regular combat/card/utility SKUs with daily server + player caps
- [ ] Featured slot rotation: 1 item/day, 1–3 units, announced in dedicated channel, configurable UTC reset
- [ ] Pool A: discounted existing items (50–70%)
- [ ] Pool B exclusives:
  - [ ] Element Anchor (permanent element lock; immune to reroll)
  - [ ] Golden Frame (cosmetic border; persisted for embeds)
  - [ ] Double Drop Token (2× card drop chance next battle)
  - [ ] Season Recall (once per player per season; ties to Season Decay in Stage 7)
  - [ ] Boss Magnet (set battle-boss pity to 10/11 for next boss fight)
- [-] Preservation Seal (wager protection — fully meaningful after Stage 6 PvP escrow) — blocks reroll/trade/breakdown and PvP pick; card wager escrow not implemented.

---

### 🔲 STAGE 5 — Trading: Depth & Marketplace — Pending

Current state: single pair of instances, optional gold each side, 3% tax on outgoing gold, Trade License on offer, 3 open offers/user, 24h expiry, sealed/lent/borrowed blocked.

- [ ] Multi-card offers (multiple instances per side, atomic swap)
- [ ] Dual confirmation embed (both players confirm terms)
- [ ] `trademarket` public listings: filters by rarity, element, class; direct-to-user vs public flag
- [-] `is_escrowed` flag on `user_cards` used consistently (trade + wager + breakdown + lend + loadout) — honored for trade/lend/breakdown/loadout; PvP does not escrow card instances on wager.

---

### 🔲 STAGE 6 — PvP: Wagers, Flow, Ranks — Pending

Current state: challenge → accept (gold escrow) → both pick → sim → 5% house cut; 30m pair cooldown when wager > 0; 500g cap stub; borrowed cards blocked from pick; no synergies in PvP sim.

- [ ] Explicit decline challenge (release reserved state; 10m accept deadline)
- [-] Pick timeout → forfeit to opponent (not split refund); 5m pick window — `expireSessions` splits `pot_gold` 50/50 on pick expiry (`pick_expired`), not forfeit-to-opponent.
- [ ] Gold-only cooldown bypass (no RP on the line)
- [ ] Card wagers: escrow both sides' instances on accept; transfer on win; 5% tax on gold portion only
- [-] Wager validation: Preservation Seal blocks card wager; lent cards blocked — borrowed/lent picks blocked; card wager path not present.
- [ ] Wager caps by PvP rank (max gold + max card rarity; Bronze→Champion table)
- [ ] Hidden synergies in PvP: apply in resolution, reveal only in result embed
- [ ] Public result announcement (optional guild channel post)
- [ ] RP gain/loss per match (base delta, wager size + opponent rank scaling)

---

### 🔲 STAGE 7 — PvP Seasons, Decay, Rewards, Leaderboards — Not Started

- [ ] Season schema: season_id, RP persistence, Champion cap (top 50 server-wide)
- [ ] Season calendar: Winter/Spring/Summer/Autumn windows
- [ ] Rank ladder: Bronze → Champion
- [ ] RP formula: win/loss scaling by wager and opponent rank; bonus for beating higher rank
- [ ] Soft season start: 2-week boosted RP period
- [ ] Season end job: activity threshold (10 fights default); decay table (active −1 tier, inactive −2, Bronze floor); Season Recall item integration
- [ ] Season end rewards: ranked gold packs / cards / exclusive Mythic for Champion
- [ ] Commands: `leaderboard` (season RP, all-time wins, region clears, gold), `rank` / `rank @user`
- [ ] Champion slot maintenance: periodic job trimming to top 50

---

### 🔲 STAGE 8 — PvE: Bosses, Pools, Element Weights — Partial

Aligned today: six regions, tier progression, battle boss flag, pool drop (40%/5%/11-pity style), some regional passives.

- [ ] Tier Boss as a separate fight after Battle Boss; seasonal pool per region; no duplicate member until pool exhausted; admin override slots; stat multipliers by tier band + Tier X extra Tier 3 ability
- [ ] Separate Battle Boss vs Tier Boss drop rules and narration
- [-] Element distribution by region: absent/rare/uncommon/common/primary weights for encounters and drop pools (`elementPoolForEncounter` / boss pools aligned with `CardSystem.md § Element Distribution by Region`) — `elementPoolForEncounter` exists; full doc table parity not verified here.
- [ ] Tier battle counts table: verify every tier's `battlesRequired` and boss positions (I–X, regions 5–6 VI–X only)
- [ ] Region unlock gates: regions 5+6 locked until prior region all 10 tiers cleared

---

### 🔲 STAGE 9 — Lending: Marketplace & Lifecycle Polish — Partial

Current state: targeted offer/accept, upfront price, duration, optional max battles, borrower copy, 60/40 gold split, Recall Token, expiry/battle-cap completion.

- [ ] `lendmarket` public listings (filter by rarity, class, element, price)
- [ ] `[LENT]` label in `/tcg inventory` and embeds for borrower
- [ ] Notify borrower on expiry if card is in loadout (DM or channel)
- [-] Confirm level gains on lent cards stick to owner only — borrower copy paths exist; full audit vs all level-up entry points not confirmed in this review.
- [ ] Payment timing decision: confirm pre-paid (current) vs post-paid; align doc + UX

---

### 🔲 STAGE 10 — Narration, Admin, Config — Pending

- [ ] Battle narration format: round lines, ability procs, boss headers, PvP result with hidden synergy reveal
- [ ] Shop/featured reset: configurable UTC midnight; centralized config
- [ ] Admin overrides: tier boss slot assignments, tournament PvP cooldown bypass
- [ ] Champion slot maintenance job (periodic trim to top 50)
- [ ] Optional: expose `pFinal`/`eFinal` scaled stats in PvE fight embed

---

### 🔲 STAGE 11 — QA Passes Against CardSystem.md Tables — Pending

- [x] Pack pity numbers: Basic (no UC in 9 consecutive → force UC); Advanced (no SSR+ in 9 → force SSR); Premium (Legendary counter ≥19; Mythic counter ≥49)
- [x] All gold costs in `CardSystem.md § Card Acquisition` match `tcgPacks.js` / `tcgDirectBuy.js`; doc states L/M not sold for gold
- [-] PvE gold table: `CardSystem.md § Gold Sources` tier bands match `tcgPveConfig.js` (`baseGoldForTier`, boss, clear bonuses) — not line-by-line audited in this review.
- [-] `CardSystem.md § XP System`: 15 XP baseline + 1-minute per-channel cooldown verified in `libs/xpSystem.js` — implementation is settings-driven; defaults in `database/db.js` seed are not 15/1min.
- [-] `CardSystem.md § Gold Sources`: lending income formula (40% of agreed loan price) reconciled with actual upfront borrow fee + 60/40 battle split — still a doc vs code wording gap.

---

## Key Files Reference

| Concern | Files |
|---|---|
| Card generation | `create_card.js`, `master.js`, `batch_worker.js` |
| Card layout | `src/bot/tcg/cardLayout.js` |
| Rarity model | `src/bot/tcg/rarityOrder.js`, `libs/tcgRarityRoll.js`, `libs/tcgRarityModifiers.js`, `seeds/rarity.js` |
| Elements | `src/bot/tcg/elements.js`, `src/bot/tcg/abilityIcons.js` |
| Abilities | `src/bot/tcg/abilityPools.js`, `libs/tcgAbilityBattle.js` |
| Class system | `libs/tcgSynergy.js`, `libs/tcgAbilityBattle.js` |
| Economy | `libs/xpSystem.js`, `libs/cardSystem.js` |
| Packs | `libs/tcgPacks.js` |
| PvE | `libs/tcgPve.js`, `libs/tcgPveConfig.js` |
| PvP/Spar | `libs/tcgPvp.js`, `libs/tcgSpar.js` |
| Inventory | `libs/tcgInventory.js` |
| Fusion | `libs/tcgFusion.js` *(planned — Stage 3; not in repo yet)* |
| Forge | `libs/tcgForge.js` *(planned — Stage 3; not in repo yet)* |
| Regrade | `libs/tcgRegrade.js` *(planned — Stage 3; not in repo yet)* |
| Expeditions | `libs/tcgExpeditions.js` *(planned — Stage 3; not in repo yet)* |
| Shop | `libs/tcgDirectBuy.js` |
| Synergy | `libs/tcgSynergy.js` |
| ORM models | `database/models/User.js`, `Card.js`, `UserCard.js` |
| Slash commands | `src/bot/commands/slashCommands/tcg/tcg.js`, `cards/get_card.js` |
| Migrations | `migrations/20260425120000_tcg_stage2_catalog_and_inventory.js` + weight migration |

---

## Retired Plan Files (Do Not Use)

- `card_system_integration_gap_776995ea_plan.md` — superseded; architecture decisions absorbed above
- `rarity_weight_roll_system_4e4a7e7f_plan.md` — superseded; 11-abbrev work is done per roadmap
- `tcg_template_vs_instance_ffe77ecd_plan.md` — superseded; three-layer model documented above
- `cursor_card_layout_updates_for_new_card.md` — Cursor transcript; historical record only
- `tcg-roadmap-stages.md` — superseded by this file
