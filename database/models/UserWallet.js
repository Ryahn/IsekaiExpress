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
        updated_at: { type: 'integer' },
      },
    };
  }
}

module.exports = UserWallet;
