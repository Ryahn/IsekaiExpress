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
        level: { type: ['number', 'null'] },
        power: { type: ['number', 'null'] },
        discord_id: { type: 'number' },
        member_id: { type: ['integer', 'null'] },
        element: { type: ['string', 'null'] },
        ability_key: { type: ['string', 'null'] },
        base_atk: { type: ['number', 'null'] },
        base_def: { type: ['number', 'null'] },
        base_spd: { type: ['number', 'null'] },
        base_hp: { type: ['number', 'null'] },
        base_power: { type: ['number', 'null'] },
        tcg_region: { type: ['integer', 'null'] },
        updated_at: { type: 'number' },
        created_at: { type: 'number' },
      },
    };
  }
}

module.exports = Card;
