const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const knex = require('knex');
const logger = require('./libs/logger');

const exampleEnv = path.join(__dirname, '.env.example');
const envPath = path.join(__dirname, '.env');

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(exampleEnv)) {
    fs.copyFileSync(exampleEnv, envPath);
    logger.info('Created .env from .env.example — edit it with your secrets.');
  } else {
    logger.error('Missing .env.example. Cannot create .env.');
    process.exit(1);
  }
}

require('dotenv').config({ path: envPath });

let envText = fs.readFileSync(envPath, 'utf8');
if (!/^\s*SESSION_SECRET=/m.test(envText) || /SESSION_SECRET=\"\"\s*$/m.test(envText) || /SESSION_SECRET=\s*$/m.test(envText)) {
  if (!/SESSION_SECRET=/.test(envText)) {
    fs.appendFileSync(envPath, `\nSESSION_SECRET=${generateToken()}\n`);
  } else {
    envText = envText.replace(/SESSION_SECRET=.*/g, `SESSION_SECRET=${generateToken()}`);
    fs.writeFileSync(envPath, envText, 'utf8');
  }
  logger.info('Set SESSION_SECRET in .env');
}

delete require.cache[require.resolve('./config')];
const config = require('./config');

if (!config.mysql.user || !config.mysql.database) {
  logger.error('Set MYSQL_USER and MYSQL_DB in .env before running setup.');
  process.exit(1);
}

const knexConfig = {
  client: 'mysql2',
  connection: {
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    port: config.mysql.port
  }
};

const db = knex(knexConfig);

db.migrate.latest({
  directory: './migrations',
}).then(() => {
  logger.info('Migrations complete');
  return db.seed.run({
    directory: './seeds',
  });
}).then(() => {
  logger.info('Seeds complete');
}).catch((err) => {
  logger.error('Error running migrations or seeds', err);
}).finally(() => {
  db.destroy();
});

logger.info('Setup step finished. Ensure .env has Discord and MySQL values.');
