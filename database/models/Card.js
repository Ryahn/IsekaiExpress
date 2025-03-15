const { Model } = require('objection');
const User = require('./User');

class Card extends Model {
  static get tableName() {
    return 'card_data';
  }

  static get idColumn() {
    return 'uuid';
  }

  static get relationMappings() {
    return {
      users: {
        relation: Model.ManyToManyRelation,
        modelClass: User,
        join: {
          from: 'card_data.uuid',
          through: {
            from: 'users_card.card_uuid',
            to: 'users_card.user_id',
          },
          to: 'users.discord_id',
        },
      },
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      properties: {
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
      }
    };
  }
}

module.exports = Card;
