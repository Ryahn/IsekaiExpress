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
      wallet: {
        relation: Model.HasOneRelation,
        modelClass: path.join(__dirname, 'UserWallet.js'),
        join: {
          from: 'users.id',
          to: 'user_wallets.user_id',
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
