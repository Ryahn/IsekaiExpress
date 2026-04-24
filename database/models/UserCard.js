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

  static get jsonSchema() {
    return {
      type: 'object',
      properties: {
        user_card_id: { type: 'integer' },
        user_id: { type: 'integer' },
        card_id: { type: 'integer' },
        ability_key: { type: ['string', 'null'] },
        level: { type: 'integer' },
        acquired_at: { type: ['integer', 'null'] },
        is_lent: { type: 'boolean' },
        is_escrowed: { type: 'boolean' },
        element_reroll_count: { type: 'integer' },
        updated_at: { type: 'number' },
        created_at: { type: 'number' },
      },
    };
  }
}

module.exports = UserCard;
