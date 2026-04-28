# TCG Master Plan — Single Source of Truth
*Consolidated from: tcg-roadmap-stages.md, card_system_integration_gap plan, rarity_weight_roll_system plan, tcg_template_vs_instance plan, and cursor transcript (cursor_card_layout_updates_for_new_card.md). Generated 2026-04-26.*

---

## How to use this file

- **This file is the truth.** All older plan files are retired.
- Give this to Cursor: "Review the codebase against this plan. Mark each item `[x]` if fully implemented, `[-]` if partial, `[ ]` if not started. Add a one-line note on anything partial."
- When something ships, check the box and add the relevant file(s) in a note.

---

## Discord slash commands (`/tcg`) — option budget

Discord allows at most **25 top-level options** per slash command (subcommands and subcommand **groups** each count as one root). The bot implements `/tcg` in `src/bot/commands/slashCommands/tcg/tcg.js`.

**Design (keeps headroom for new player features):**

| Group / root | Path pattern | Role |
|---|---|---|
| **craft** | `/tcg craft <sub>` | Instance actions: `fuse` (level), `rarity_fuse` (rarity ascend), `forge`, `regrade`, `breakdown`, `seal`, `reroll` |
| **account** | `/tcg account <sub>` | `balance` (profile embed), `convert`, `daily` |
| **squad** | `/tcg squad <sub>` | `show` (loadout), `synergy`, `equip`, `unequip` |
| **pve** | `/tcg pve <sub>` | `progress`, `fight`, **`spar`** (practice), `travel` |
| *(existing)* | `/tcg expedition …`, `/tcg store …`, `/tcg trade …`, `/tcg lend …`, `/tcg pvp …` | Unchanged |
| **Top-level** | `/tcg inventory`, `/tcg view`, `/tcg titles` | High-traffic browsing; stay un-nested for now |
| **staff** | `/tcg staff …` | Moderation / catalog |

**If `/tcg` approaches the cap again:** prefer nesting under an existing group, or add a **second** slash (e.g. staff-only `/tcgmod` for `grant` / `set_signature`) so player-facing `/tcg` stays simple.

**Naming:** `rarity_fuse` avoids clashing with level `fuse` in the same `craft` group.

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
- Grade shown on card embed and `/tcg inventory` (unchanged top-level)

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

## Class System (Locked)

**Seven classes.** Each has a standalone passive. No diversity bonus — scales to any number of classes cleanly.

| Class | Passive | Notes |
|---|---|---|
| **Guardian** | −5% incoming damage | Standard class |
| **Artisan** | +5% outgoing damage | Standard class |
| **Commander** | +3% battle gold | Standard class; applies PvE, spar, PvP |
| **Phantom** | +8% SPD, wins all speed ties | Standard class |
| **Sage** | +5% ability proc chance | Standard class |
| **Warden** | +8% HP (simple form until round-end hooks exist) | Standard class; upgrade to 5% HP recovery/round when sim supports end-of-round hooks |
| **Sovereign** | +4% to all stats | **Exclusive to Staff, Mod, Uploader cards only. Never assigned to member/anime/game cards.** |

Class is baked on the PNG and stored in `card_data.class`. **Immutable after generation — no rerolling class.**

**Sovereign exclusivity rule:** `create_card.js` / `master.js` must enforce that `class = 'Sovereign'` is only assignable when `card_data.source` is `staff`, `mod`, or `uploader`. Batch pipeline throws if this is violated.

---

## Card Types (Locked)

All cards share the same rarity, element, class, and ability system. `source` is a flag for filtering, display, and gating.

**`card_data.source` values:**

| Value | Who | Rarity floor | Class pool |
|---|---|---|---|
| `member` | Regular F95Zone members | None | Guardian / Artisan / Commander / Phantom / Sage / Warden |
| `staff` | Site staff | SSR minimum | Sovereign only |
| `mod` | Moderators | SR minimum | Sovereign only |
| `uploader` | Game uploaders | SR minimum | Sovereign only |
| `anime` | Anime characters | None | Standard pool |
| `game` | F95Zone game characters | None | Standard pool |

**Rarity floor enforcement:** batch pipeline rerolls or hard-overrides until the rolled rarity meets the source minimum. Staff/Mod/Uploader cards are never generated below their floor.

**Shared systems:** all source types use the same element pool, ability system, Fusion, Forge, Regrade, Expedition, and drop mechanics.

---

## Element Synergy System (Locked)

Checked once at battle start from loadout composition. All bonuses apply to the **lead card only**. Class passives stack on top.

**10 elements:** Fire, Water, Earth, Wind, Lightning, Ice, Dark, Light, Void, Time

### Tier 1 — Elemental Focus
Triggered when 2+ cards in the loadout share the lead card's element.

| Cards matching lead element | Bonus |
|---|---|
| 2 | +3% to lead's primary stat |
| 3 | +6% |
| 4 | +9% |
| 5 (full mono) | +15% + free Tier 1 ability proc on round 1 |

Primary stat resolved by class at runtime: ATK for Artisan/Phantom, DEF for Guardian/Warden, SPD for Phantom (secondary), HP for Warden (secondary). Full mono is high-reward but leaves you exposed to elemental counters — intentional tradeoff.

### Tier 2 — Elemental Pairs
Triggered when loadout contains at least 1 card of each paired element. Triggers once maximum regardless of how many of each element are present.

| Pair | Bonus |
|---|---|
| Fire + Wind | +8% ATK |
| Water + Ice | +8% DEF |
| Lightning + Void | +8% SPD |
| Earth + Time | +5% HP, +5% DEF |
| Dark + Light | +10% ATK, −5% DEF |
| Fire + Ice | −5% ATK, +12% DEF |
| Water + Lightning | +8% ATK, −3% DEF |
| Dark + Time | +6% SPD, +6% ATK |
| Light + Wind | +10% SPD |
| Earth + Void | +8% HP |

### Tier 3 — Elemental Trinity
Triggered when loadout contains at least 1 card of each of three specific elements. If multiple Trinities qualify, highest total bonus value wins.

| Trinity | Name | Effect |
|---|---|---|
| Fire + Wind + Lightning | **Storm Front** | +12% ATK, ability proc chance +15% |
| Water + Ice + Earth | **Glacial Fortress** | +15% DEF, first hit received this battle negated |
| Dark + Void + Time | **Entropy** | +10% ATK, +10% SPD, enemy DEF −8% |
| Light + Wind + Lightning | **Radiant Surge** | +15% SPD, +8% ATK |
| Earth + Fire + Time | **Forged Legacy** | +10% DEF, +10% HP, +5% gold |
| Water + Dark + Void | **Abyssal Tide** | +12% ATK, enemy ability proc chance −10% |

### Stacking Rules
- Tier 1 + Tier 2 **can** stack (e.g. Fire mono loadout with a Wind card gets both Focus and Fire+Wind pair)
- Tier 3 **replaces** Tier 2 if the Trinity covers the same pair — you don't get both
- Trinity + Focus **can** stack if lead's element is part of the Trinity
- All synergy resolved once at battle start, passed into combat opts as flat multipliers
- Implementation: `libs/tcgSynergy.js` — new `resolveElementSynergy(loadout, lead)` function

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
- [x] `libs/tcgInventory.js`: `nextRarityTier()` delegates to `nextRarityInOrder()` / `sanitizeRarityAbbrev()` from `rarityOrder.js` (no `RARITY_BUMP_ORDER` symbol)
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

### ✅ STAGE 2 — Economy & XP — Complete

- [x] Gold wallet (`user_wallets` or equivalent)
- [x] XP → gold convert
- [x] Daily login claim with XP/gold hooks
- [x] Battle XP hooks (PvE/PvP)
- [x] First-win-of-day bonus
- [x] Message XP: 15 XP default (`xp_settings` min/max), per-channel cooldown (`message_xp_cooldown_seconds`, default 60s) — `libs/xpSystem.js`; migration `20260629120000_xp_settings_message_cooldown.js`
- [x] Gold sources table matches `CardSystem.md § Gold Sources` (lending: upfront fee + 40%/60% lender/borrower split on PvE & spar wins with borrowed copy)
- [x] TCG XP booster doubles message XP

---

### ✅ STAGE 3 — Inventory & Collection — Complete (partials noted)

All operations use `card_data_id` + `user_cards` instance row. Never regenerate PNG.

- [x] `giveCard` fully implemented: inserts `user_cards` row (card_data_id, player_id, ability_key, level=1, flags)
- [x] Inventory caps enforced
- [x] Breakdown (destroy card for resources)
- [x] Fuse/level-up (level 1→5 via combining; levels stick to owner's card even when lent)
- [x] Set bonuses
- [x] Elemental reroll
- [x] `list_all_cards` pagination/search working for large `card_data` (~110 templates × members)
- [-] Loadout lock during active/pending **PvP** (pick/accept window) is enforced; cards on **active expeditions** cannot be equipped and cannot fight as main. No separate “PvE session” loadout freeze beyond expedition + sim-in-flight behavior.

#### Class System
- [x] `card_data.class` updated to support all 7 classes: Guardian, Artisan, Commander, Phantom, Sage, Warden, Sovereign (`create_card.js`, `libs/tcgAbilityBattle.js`, `libs/tcgSynergy.js`)
- [x] `card_data.source` column added: `member / staff / mod / uploader / anime / game` — migration `20260630120000_tcg_stage3_class_source_progression.js`
- [x] Sovereign class assignment restricted to `source IN (staff, mod, uploader)` — enforced in `create_card.js` / `batch_worker.js`
- [x] Rarity floor enforcement in batch pipeline: staff SSR minimum, mod/uploader SR minimum (`batch_worker.js`)
- [x] Class passives applied in combat sim (Guardian −5% incoming, Artisan +5% outgoing, Commander +3% gold, Phantom +8% SPD + tie-win, Sage +5% proc chance, Warden +8% HP, Sovereign +4% all stats)
- [ ] Warden round-end HP recovery (5%/round) — future upgrade when sim has end-of-round hooks

#### Element Synergy
- [x] `libs/tcgElementSynergyResolve.js` + `resolveElementSynergy` wired from `libs/tcgSynergy.js` (`computeCombatSynergy`)
- [x] Tier 1 Focus: count lead-matching elements in loadout, apply bonus table (2=+3%, 3=+6%, 4=+9%, 5=+15% + round 1 ability proc)
- [x] Tier 2 Pairs: paired elements; trinity replaces overlapping pair per plan
- [x] Tier 3 Trinity: highest-value qualifying trinity; Glacial / Entropy combat opts (first-hit negate, enemy DEF debuff, proc penalty) in `tcgAbilityBattle.js` / PvE & spar wiring
- [x] Tier 1 + Tier 2 / Tier 3 stacking per plan
- [x] Synergy result passed into combat opts at battle start
- [x] PvE/spar embeds include `_Synergy:_` lines from `summaryLines` (trinity names when applicable)

#### Fusion
- [x] Schema: `tcg_fusion_pity` — `user_id`, `attempt_count`, `last_attempt_at` (resets on success)
- [x] `libs/tcgFusion.js`: same-rarity + same `discord_id` (character); resource cost scales mixed elements + grades; spends shards/diamonds/rubies via wallet
- [x] Fusion output: next rarity tier for that character (`grantTemplateWithTrx` on success)
- [x] Pity: forced success after threshold (`FUSION_PITY_FORCE`); counter resets on success
- [-] Slash: `/tcg craft rarity_fuse` — instant resolve (no separate preview/confirm step)

#### Forge
- [x] Schema: no pity table
- [x] `libs/tcgForge.js`: guaranteed → shards; gamble → variable shards + RNG card / diamonds / rubies
- [x] Cards destroyed on Forge regardless of path
- [-] Slash: `/tcg craft forge` — instant (no confirm modal)

#### Regrade (D → C → B → A → S)
- [x] Schema: `user_cards.grade`, `user_cards.regrade_pity` — migration `20260630120000_tcg_stage3_class_source_progression.js`
- [x] `libs/tcgRegrade.js`: resource check, spend, success/fail roll, pity increment/reset
- [-] Cost bands: D→C / C→B / B→A match shard/diamond intent; **A→S primary path is 8 rubies + 90 diamonds** (stricter than doc’s “rubies preferred, diamonds fallback” wording alone)
- [x] Grade + regrade pity on `/tcg view` and grade on `/tcg inventory`; `/tcg account balance` shows wallet resources
- [-] Slash: `/tcg craft regrade` — instant (`shard_fallback` option); no confirm step

#### Resources
- [x] Schema: `user_wallets.tcg_shards`, `tcg_diamonds`, `tcg_rubies`
- [x] Shards: Forge guaranteed/gamble, standard expedition claim (`tcgExpeditions.js`)
- [x] Diamonds: Forge gamble, tier **8+** battle-boss wins (`tcgPve.js`), Diamond Mine expedition
- [x] Rubies: Forge gamble (rare), tier **10** boss rubies + Ruby Mine expedition
- [x] Resource balances in `/tcg account balance` (TCG profile embed)

#### Expeditions
- [x] Schema: `tcg_expeditions` — `user_id`, `user_card_id`, `region`, `expedition_type`, `started_at`, `returns_at`, `claimed`
- [x] Card unavailable for combat as main while on expedition; cannot equip card that is on an active expedition (`tcgLoadout.js`, `tcgSessionLoadout.js`, `tcgPve.js`, `tcgSpar.js`)
- [x] Region gate + Diamond/Ruby mine unlocks (`libs/tcgExpeditions.js`)
- [x] Standard / mine rewards on claim (gold, XP, shards / diamonds / rubies)
- [-] Slash: `/tcg expedition send`, **`list`** (replaces doc’s `view`), `claim`
- [ ] Optional DM alarm when expedition returns

#### Capture Chance (Boss Drop)
- [x] On battle-boss win, flat % roll for that boss member’s template (`tryBossMemberTemplateCapture` in `tcgPve.js`)
- [x] `BOSS_MEMBER_CAPTURE_CHANCE` in `libs/tcgPveConfig.js`
- [x] Grant via `grantCardToPlayer` / catalog template; **Boss capture** field on PvE fight embed when granted or grant fails

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
- [x] `CardSystem.md § XP System`: 15 XP default + per-channel cooldown — `libs/xpSystem.js`, `xp_settings.message_xp_cooldown_seconds`, `database/db.js` defaults for new guild rows
- [x] `CardSystem.md § Gold Sources`: lending income documents upfront fee + 40%/60% PvE/spar gold split on borrowed copies

---

## Key Files Reference

| Concern | Files |
|---|---|
| Card generation | `create_card.js`, `master.js`, `batch_worker.js` |
| Card layout | `src/bot/tcg/cardLayout.js` |
| Rarity model | `src/bot/tcg/rarityOrder.js`, `libs/tcgRarityRoll.js`, `libs/tcgRarityModifiers.js`, `seeds/rarity.js` |
| Elements | `src/bot/tcg/elements.js`, `src/bot/tcg/abilityIcons.js` |
| Abilities | `src/bot/tcg/abilityPools.js`, `libs/tcgAbilityBattle.js` |
| Class system & element synergy | `libs/tcgSynergy.js`, `libs/tcgAbilityBattle.js` |
| Economy | `libs/xpSystem.js`, `libs/cardSystem.js` |
| Packs | `libs/tcgPacks.js` |
| PvE | `libs/tcgPve.js`, `libs/tcgPveConfig.js` |
| PvP/Spar | `libs/tcgPvp.js`, `libs/tcgSpar.js` |
| Inventory | `libs/tcgInventory.js` |
| Fusion | `libs/tcgFusion.js` |
| Forge | `libs/tcgForge.js` |
| Regrade | `libs/tcgRegrade.js` |
| Expeditions | `libs/tcgExpeditions.js`, `libs/tcgSessionLoadout.js` |
| Element synergy resolve | `libs/tcgElementSynergyResolve.js` |
| Shop | `libs/tcgDirectBuy.js` |
| Synergy | `libs/tcgSynergy.js` |
| ORM models | `database/models/User.js`, `Card.js`, `UserCard.js` |
| Slash commands | `src/bot/commands/slashCommands/tcg/tcg.js`, `cards/get_card.js` |
| Migrations | `migrations/20260425120000_tcg_stage2_catalog_and_inventory.js` + weight migration; `20260629120000_xp_settings_message_cooldown.js` (Stage 2 message XP); `20260630120000_tcg_stage3_class_source_progression.js` (Stage 3: `source`, resources, grade, fusion pity, expeditions) |

---

## Retired Plan Files (Do Not Use)

- `card_system_integration_gap_776995ea_plan.md` — superseded; architecture decisions absorbed above
- `rarity_weight_roll_system_4e4a7e7f_plan.md` — superseded; 11-abbrev work is done per roadmap
- `tcg_template_vs_instance_ffe77ecd_plan.md` — superseded; three-layer model documented above
- `cursor_card_layout_updates_for_new_card.md` — Cursor transcript; historical record only
- `tcg-roadmap-stages.md` — superseded by this file
