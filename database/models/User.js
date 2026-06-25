const { Model } = require('objection');

class User extends Model {
  static get tableName() {
    return 'users';
  }

  /**
   * Internal PK.
   * Resolve Discord users with User.query().findOne({ discord_id: snowflake }).
   */
  static get idColumn() {
    return 'id';
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
