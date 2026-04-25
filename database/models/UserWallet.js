const path = require('path');
const { Model } = require('objection');

class UserWallet extends Model {
  static get tableName() {
    return 'user_wallets';
  }

  static get idColumn() {
    return 'user_id';
  }

  static get relationMappings() {
    return {
      user: {
        relation: Model.BelongsToRelation,
        modelClass: path.join(__dirname, 'User.js'),
        join: {
          from: 'user_wallets.user_id',
          to: 'users.id',
        },
      },
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      properties: {
        user_id: { type: 'integer' },
        gold: { type: 'integer' },
        tcg_daily_claim_at: { type: ['integer', 'null'] },
        tcg_first_win_utc_date: { type: ['string', 'null'] },
        tcg_inventory_bonus_slots: { type: 'integer' },
        tcg_shard_focus_charges: { type: 'integer' },
        tcg_iron_veil_charges: { type: 'integer' },
        tcg_overclock_charges: { type: 'integer' },
        tcg_null_ward_charges: { type: 'integer' },
        tcg_revive_shard_charges: { type: 'integer' },
        tcg_fusion_catalyst_charges: { type: 'integer' },
        tcg_rarity_dust_next_fuse: { type: 'integer' },
        tcg_trade_license_charges: { type: 'integer' },
        tcg_recall_token_charges: { type: 'integer' },
        tcg_preservation_seal_charges: { type: 'integer' },
        tcg_xp_booster_until: { type: ['integer', 'null'] },
        updated_at: { type: 'integer' },
      },
    };
  }
}

module.exports = UserWallet;
