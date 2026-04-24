# TCG Stage 0 — Foundations

This document records **Stage 0** decisions for integrating [CardSystem.md](../CardSystem.md) into the bot: **slash-first** UX, a **command mapping** (design doc → Discord slash shape), and a **target ERD** for future migrations. Objection models under `database/models/` are aligned with the `user_cards` migration (`users.id` ↔ `card_data.card_id`); the [appendix](#appendix-objection-models-stage-0) mirrors that source for reference.

## Command interface: slash-first

**Decision:** New TCG features use **slash commands** only (no prefix `!` for these flows).

**Rationale:** Built-in option validation, typed choices, subcommands/subgroups, clearer discoverability in Discord, and room for richer flows (modals/buttons later) without fragile string parsing.

Existing **prefix** commands remain for the rest of the bot (farm, misc, etc.). TCG is additive under slash.

## Slash command mapping (design doc → proposed structure)

Discord limits tree depth and option count; names below are **targets** for implementation in later stages. Group related actions under a small set of top-level commands to avoid hitting per-app command caps.

### Existing (catalog / admin)

| Current / doc intent | Proposed slash (keep or migrate) |
|----------------------|----------------------------------|
| Card lookup by UUID | `/card get uuid:<string>` (today: `get_card`) |
| Browse catalog | `/card list …` (today: `list_all_cards`) |
| Update card (admin/owner) | `/card update …` (today: `update_card`) |

*Optional consolidation:* rename top-level to `/card` with subcommands `get`, `list`, `update` when you touch those files (Stage 1+).

### Economy & profile (CardSystem)

| Doc / concept | Proposed slash |
|---------------|----------------|
| `!convert [amount]` | `/tcg convert amount:<integer>` (multiples of 50 XP) |
| Daily login / first-win (if exposed) | `/tcg daily` or automatic only (no command) |

### Inventory & collection

| Concept | Proposed slash |
|---------|----------------|
| View inventory | `/tcg inventory [page]` |
| Card instance details | `/tcg card instance_id:<string>` or select from inventory |
| Fuse / level up | `/tcg fuse …` (options: instance ids) |
| Breakdown | `/tcg breakdown instance_id:<string>` |
| Element reroll | `/tcg reroll instance_id:<string>` |
| Loadout (main + 2 support) | `/tcg loadout view` · `/tcg loadout set slot:<main\|support1\|support2> instance_id:<string>` |

### PvE

| Concept | Proposed slash |
|---------|----------------|
| Region / tier progress | `/tcg pve progress` |
| Start / continue tier battle | `/tcg pve battle region:<1-6> tier:<roman-or-number>` |
| Boss retry / tier boss | same command with `type:` option or context from session |

### PvP

| Doc: `!challenge @user wager: …` | `/tcg pvp challenge user:<user> gold:<optional> card_instances:<optional multi>` |
| Accept / decline | `/tcg pvp respond accept:<bool>` (session id or latest pending) |
| Submit hidden pick | `/tcg pvp pick instance_id:<string>` (ephemeral) |

### Trading & lending

| Doc | Proposed slash |
|-----|----------------|
| `!trade @user offer: … request: …` | `/tcg trade offer …` (structured options or follow-up modal later) |
| `!trademarket` | `/tcg trade market [filters]` |
| Lend listing / borrow | `/tcg lend list` · `/tcg lend offer …` · `/tcg lend borrow …` |

### Leaderboards & rank (doc table)

| Doc | Proposed slash |
|-----|----------------|
| `!leaderboard` | `/tcg leaderboard scope:season` |
| `!leaderboard alltime` | `/tcg leaderboard scope:alltime_wins` |
| `!leaderboard region [1-6]` | `/tcg leaderboard scope:pve_region region:<1-6>` |
| `!leaderboard gold` | `/tcg leaderboard scope:gold` |
| `!rank` / `!rank @user` | `/tcg rank [user]` |

### Shop

| Concept | Proposed slash |
|---------|----------------|
| Shop browse | `/tcg shop` |
| Buy | `/tcg shop buy item:<choice> quantity:<n>` |

### Implementation note

Register new commands under [`src/bot/commands/slashCommands/`](../src/bot/commands/slashCommands/) (see [`ready.js`](../src/bot/events/ready/ready.js) loader). Prefer **subcommand groups** (`/tcg pve …`, `/tcg pvp …`) over dozens of root commands.

---

## Target ERD (logical)

Entities reflect [CardSystem.md](../CardSystem.md) and the revised plan (10 elements, 6 regions, weighted drops). Table names are indicative until migrations land in Stage 1+.

```mermaid
erDiagram
  users ||--o| user_wallets : has
  users ||--o{ user_cards : owns
  card_data ||--o{ user_cards : template
  users ||--o{ tcg_region_progress : has
  users ||--o{ tcg_loadouts : has
  users ||--o{ tcg_battle_sessions : participates
  users ||--o{ tcg_trade_offers : sends
  users ||--o{ tcg_trade_offers : receives
  users ||--o{ tcg_lend_contracts : lender
  users ||--o{ tcg_lend_contracts : borrower
  users ||--o{ tcg_season_stats : has

  card_data {
    bigint card_id PK
    string uuid UK
    string name
    string rarity
    string element
    string class
    text image_url
    bigint discord_id
    bigint member_id FK
    int base_atk
    int base_def
    int base_spd
    int base_hp
    int base_power
  }

  user_cards {
    bigint user_card_id PK
    bigint user_id FK
    bigint card_id FK
    string ability_key
    int level
    bigint acquired_at
    bool is_lent
    bool is_escrowed
  }

  user_wallets {
    bigint user_id PK_FK
    bigint gold
    bigint xp_bank
  }

  tcg_region_progress {
    bigint id PK
    bigint user_id FK
    int region
    int highest_tier_cleared
    json boss_pity_state
  }

  tcg_loadouts {
    bigint user_id PK_FK
    bigint main_instance_id
    bigint support1_instance_id
    bigint support2_instance_id
  }

  tcg_battle_sessions {
    bigint id PK
    string type
    string state
    json payload
  }

  tcg_trade_offers {
    bigint id PK
    bigint sender_id FK
    bigint receiver_id FK
    string status
    json offer_json
  }

  tcg_lend_contracts {
    bigint id PK
    bigint lender_id FK
    bigint borrower_id FK
    bigint user_card_id FK
    string status
    bigint ends_at
  }

  tcg_season_stats {
    bigint user_id PK_FK
    int season_id
    int rp
    string rank_tier
  }

  tcg_shop_stock {
    int item_id PK
    string item_key
    int server_remaining
    date reset_date
  }

  element_region_weights {
    int region
    string element_key
    string weight_tier
  }
```

**Current DB (today):** `users`, `card_data`, `user_cards`, `card_trades` exist. After Stage 2 migration, `card_data` holds catalog templates (including `element`, `base_*`, optional `member_id`); `user_cards` is **per owned card instance** (`level`, `ability_key`, lend/escrow flags), referencing `card_data.card_id`. The ERD above extends with **not-yet-created** tables (`user_wallets`, `tcg_*`, `element_region_weights`, etc.) for later stages.

**Objection (Stage 0):** [User.js](../database/models/User.js) uses `id` as `idColumn` so relations resolve against `users.id` (same as `user_cards.user_id`). Use `User.query().findOne({ discord_id })` for Discord lookups. [UserCard.js](../database/models/UserCard.js) models the inventory row. [Card.js](../database/models/Card.js) uses `card_id` as `idColumn`.

---

## Stage 0 completion checklist

- [x] Slash-first decision recorded  
- [x] Command mapping drafted for doc features + catalog  
- [x] Target ERD documented  
- [x] Objection `user_cards` / `users_card` drift fixed; `UserCard` model added  

---

## Stage 1 — Data model & catalog (completed)

- **`src/bot/tcg/elements.js`** — 10 canonical element ids (matches `tools/card_elements/*.png`), matchup sets, `elementAtkMultiplier`, `resolveElementIconPath`, `DISPLAY_LABEL`.
- **`src/bot/tcg/tcgAbilitySeeds.js`** + **`abilityPools.js`** — ability catalog + `pickRandomAbilityKeyForRarity` (tiers 1–3 by rarity; tier 4 = signatures, catalog only).
- **`src/bot/tcg/cardLayout.js`** — `BASE_STATS_L1` + `combatStatsAtLevel()` per [CardSystem.md].
- **Migration** [`migrations/20260424120000_tcg_stage1_elements_abilities.js`](../migrations/20260424120000_tcg_stage1_elements_abilities.js) — `card_data.element`, `card_data.ability_key`, table `tcg_abilities` + seed rows.
- **`src/bot/tcg/abilityIcons.js`** — `resolveAbilityTraitIconPath`, keys must match `tcgAbilitySeeds` / DB `ability_key` (used when assigning abilities to **instances**, not on catalog PNGs).
- **Slash:** `get_card` / `cards` list show element; search includes `element` and `ability_key` (legacy templates may still have `ability_key` on `card_data`).

Run migrations: `npx knex migrate:latest` (requires DB from `config`).

---

## Stage 2 — Catalog PNGs + template stats (current)

- **Migration** [`migrations/20260425120000_tcg_stage2_catalog_and_inventory.js`](../migrations/20260425120000_tcg_stage2_catalog_and_inventory.js) — `card_data.base_*`, optional `member_id` FK to `users`; `user_cards` gains `ability_key`, `level`, `acquired_at`, `is_lent`, `is_escrowed`; drops `quantity` and the composite unique on `(user_id, card_id)` so multiple instances can share the same template.
- **`create_card.js`** — writes `src/bot/media/cards/<slug>/<rarity-folder>/<element>.png`; bakes frame, portrait, element, name, class only; UUID v5 from name + normalized rarity + discord id + element; `card` payload for DB includes `base_*`, `ability_key` null on templates; upserts via `db.createCard` when DB is available.
- **`batch_worker.js`** — generates the full **6 × 10** grid per character (honours `character.rarity` when that object lists explicit keys; otherwise all rarities).
- **`cardLayout.js`** — `rarityPathSlugFromKey`, `cardLayoutForRarityCatalog`, **linear** `statLevelMultiplier` / `powerScoreAtLevel` / `combatStatsAtLevel`.

---

## Appendix: Objection models (Stage 0)

Replace or create these under `database/models/`. **`User.idColumn`** becomes `id` (internal PK); use `User.query().findOne({ discord_id })` for Discord snowflakes.

### `UserCard.js` (new file)

```javascript
const path = require('path');
const { Model } = require('objection');

class UserCard extends Model {
  static get tableName() {
    return 'user_cards';
  }

  static get idColumn() {
    return 'user_card_id';
  }

  static get relationMappings() {
    return {
      user: {
        relation: Model.BelongsToRelation,
        modelClass: path.join(__dirname, 'User.js'),
        join: {
          from: 'user_cards.user_id',
          to: 'users.id',
        },
      },
      card: {
        relation: Model.BelongsToRelation,
        modelClass: path.join(__dirname, 'Card.js'),
        join: {
          from: 'user_cards.card_id',
          to: 'card_data.card_id',
        },
      },
    };
  }
}

module.exports = UserCard;
```

### `User.js` (replace)

```javascript
const path = require('path');
const { Model } = require('objection');

class User extends Model {
  static get tableName() {
    return 'users';
  }

  /**
   * Internal PK (matches user_cards.user_id, user_xp.user_id, etc.).
   * Resolve Discord users with User.query().findOne({ discord_id: snowflake }).
   */
  static get idColumn() {
    return 'id';
  }

  static get relationMappings() {
    return {
      userCards: {
        relation: Model.HasManyRelation,
        modelClass: path.join(__dirname, 'UserCard.js'),
        join: {
          from: 'users.id',
          to: 'user_cards.user_id',
        },
      },
      cards: {
        relation: Model.ManyToManyRelation,
        modelClass: path.join(__dirname, 'Card.js'),
        join: {
          from: 'users.id',
          through: {
            from: 'user_cards.user_id',
            to: 'user_cards.card_id',
          },
          to: 'card_data.card_id',
        },
      },
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        discord_id: { type: 'number' },
        username: { type: 'string' },
        avatar: { type: 'string' },
        roles: { type: 'array' },
        is_admin: { type: 'boolean' },
      },
    };
  }
}

module.exports = User;
```

### `Card.js` (replace)

```javascript
const path = require('path');
const { Model } = require('objection');

class Card extends Model {
  static get tableName() {
    return 'card_data';
  }

  /** DB primary key; use uuid for public lookups where needed. */
  static get idColumn() {
    return 'card_id';
  }

  static get relationMappings() {
    return {
      userCards: {
        relation: Model.HasManyRelation,
        modelClass: path.join(__dirname, 'UserCard.js'),
        join: {
          from: 'card_data.card_id',
          to: 'user_cards.card_id',
        },
      },
      users: {
        relation: Model.ManyToManyRelation,
        modelClass: path.join(__dirname, 'User.js'),
        join: {
          from: 'card_data.card_id',
          through: {
            from: 'user_cards.card_id',
            to: 'user_cards.user_id',
          },
          to: 'users.id',
        },
      },
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      properties: {
        card_id: { type: 'integer' },
        uuid: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'text' },
        image_url: { type: 'text' },
        class: { type: 'string' },
        rarity: { type: 'string' },
        stars: { type: 'number' },
        level: { type: 'number' },
        power: { type: 'number' },
        discord_id: { type: 'number' },
        updated_at: { type: 'number' },
        created_at: { type: 'number' },
      },
    };
  }
}

module.exports = Card;
```
