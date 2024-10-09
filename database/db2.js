const { Sequelize } = require('sequelize');
const config = require('../.config');
const logger = require('silly-logger');

const sequelize = new Sequelize(config.mysql.database, config.mysql.user, config.mysql.password, {
  host: config.mysql.host,
  port: config.mysql.port,
  dialect: 'mysql',
  logging: msg => logger.debug(msg),
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

sequelize.authenticate()
  .then(() => {
    logger.info('MySQL connection established successfully.');
  })
  .catch(err => {
    logger.error('Unable to connect to the database:', err);
  });

const UserXP = require('./models/UserXP')(sequelize);
const XPSettings = require('./models/XPSettings')(sequelize);
const CagedUsers = require('./models/CagedUsers')(sequelize);
const ChannelStats = require('./models/ChannelStats')(sequelize);
const Bans = require('./models/Bans')(sequelize);
const Guilds = require('./models/Guilds')(sequelize);
const GuildConfigurable = require('./models/GuildConfigurable')(sequelize);
const AfkUsers = require('./models/AfkUsers')(sequelize);
const Commands = require('./models/Commands')(sequelize);

Guilds.hasOne(GuildConfigurable);
GuildConfigurable.belongsTo(Guilds);

sequelize.sync()
  .then(() => {
    logger.info('Database & tables created!');
  })
  .catch(err => {
    logger.error('Error syncing database:', err);
  });

module.exports = {
  sequelize,
  models: {
    UserXP,
    XPSettings,
    CagedUsers,
    ChannelStats,
    Bans,
    Guilds,
    GuildConfigurable,
    AfkUsers,
    Commands
  }
};