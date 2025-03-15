const { Model } = require('objection');
const Card = require('./Card');

class User extends Model {
  static get tableName() {
    return 'users';
  }

  static get idColumn() {
    return 'discord_id';
  }

  static get relationMappings() {
    return {
      cards: {
        relation: Model.HasManyRelation,
        modelClass: Card,
        join: {
          from: 'users.discord_id',
          through: {
            from: 'users_card.user_id',
            to: 'users_card.card_uuid',
          },
          to: 'card_data.uuid',
        },
      }
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      properties: {
        discord_id: { type: 'number' },
        username: { type: 'string' },
        avatar: { type: 'string' },
        roles: { type: 'array' },
        is_admin: { type: 'boolean' }
      }
    };
  }
}

module.exports = User;
