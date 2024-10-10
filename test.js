const db = require('./database/db');
const { timestamp } = require('./libs/utils');
(async () => {
  const expiredUsers = await db.getExpiredCagedUsers(timestamp());
  if (expiredUsers) {
    console.log(expiredUsers);
  } else {
    console.log('No expired users');
  }
})();