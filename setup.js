const fs = require('fs');
const crypto = require('crypto');
const logger = require('silly-logger');
const path = require('path');
const knex = require('knex');
const sampleConfig = require('./.config-example.js');

const knexConfig = {
  client: 'mysql2',
  connection: {
    host: sampleConfig.mysql.host,
    user: sampleConfig.mysql.user,
    password: sampleConfig.mysql.password,
    database: sampleConfig.mysql.database,
  },
};

if (sampleConfig.mysql.user === 'NOTSET' || sampleConfig.mysql.password === 'NOTSET' || sampleConfig.mysql.database === 'NOTSET') {
  logger.error('Please set the mysql user, password and database in .config-example.js');
  process.exit(1);
}

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

fs.renameSync(path.join(__dirname, '.config-example.js'), path.join(__dirname, '.config.js'));

let configContent = fs.readFileSync(path.join(__dirname, '.config.js'), 'utf8');

const sessionSecret = generateToken();
const uploadToken = generateToken();

configContent = configContent.replace('YOUR_SESSION_SECRET', sessionSecret);
configContent = configContent.replace('YOUR_UPLOAD_TOKEN', uploadToken);

fs.writeFileSync(path.join(__dirname, '.config.js'), configContent, 'utf8');

const db = knex(knexConfig);

db.migrate.latest({
  directory: './migrations',
}).then(() => {
  logger.info('Migrations complete');
}).catch((err) => {
  logger.error('Error running migrations', err);
});
db.destroy();

logger.info('Setup complete. .config.js has been created with new tokens.');
logger.warn('Update all mysql info.')