const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserXP = sequelize.define('UserXP', {
    user_id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    xp: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    message_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    tableName: 'user_xp',
    timestamps: false
  });

  return UserXP;
};