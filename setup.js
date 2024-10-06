const fs = require('fs');
const crypto = require('crypto');
const logger = require('silly-logger');
const path = require('path');
const { setupDatabase } = require('./database/dbSetup');

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

logger.info('Setup complete. .config.js has been created with new tokens.');
logger.warn('Update all mysql info.')

setupDatabase();
