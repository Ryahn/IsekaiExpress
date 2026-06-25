const knex = require('knex');
const config = require('../config');
const logger = require('../libs/logger');

/**
 * Single shared knex connection for the whole app. Repositories require THIS module
 * (never database/db.js) so there is no circular dependency: db.js → repositories → knex.
 */
const db = knex({
  client: 'mysql2',
  connection: {
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    port: config.mysql.port,
  },
  pool: { min: 2, max: 10 },
});

db.raw('SELECT 1')
  .then(() => {
    logger.info('Knex pool established');
  })
  .catch((err) => {
    logger.error('Error connecting to the database:', err);
  });

module.exports = db;
