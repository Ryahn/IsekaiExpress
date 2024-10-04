const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../.config');
const logger = require('silly-logger');

async function seedTable(table) {
  if (!fs.existsSync(path.join(__dirname, 'schemas', `${table}.json`))) {
    logger.info(`No data to seed for table '${table}'.`);
    return;
  }

  const connection = await mysql.createConnection({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database
  });

  const jsonData = fs.readFileSync(path.join(__dirname, 'schemas', `${table}.json`), 'utf8');
  const data = JSON.parse(jsonData);

  if (!Array.isArray(data)) {
    logger.error(`Invalid data format for table '${table}'. Expected an array.`);
    await connection.end();
    return;
  }

  const columns = Object.keys(data[0]).join(', ');
  const placeholders = Object.keys(data[0]).map(() => '?').join(', ');

  const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;

  try {
    for (const row of data) {
      await connection.query(query, Object.values(row));
    }
    logger.info(`Seeded table '${table}' with ${data.length} rows of data.`);
  } catch (error) {
    logger.error(`Error seeding table '${table}':`, error);
  } finally {
    await connection.end();
  }
}

async function setupDatabase() {
	const lockFilePath = path.join(__dirname, 'db_setup.lock');

	try {
		// Check if the lock file exists
		if (fs.existsSync(lockFilePath)) {
			logger.info('Database setup has already been completed. Skipping...');
			return;
		}

		const connection = await mysql.createConnection({
			host: config.mysql.host,
			user: config.mysql.user,
			password: config.mysql.password,
		});

		const [rows] = await connection.query(`SHOW DATABASES LIKE '${config.mysql.database}'`);
		const databaseExists = rows.length > 0;

		if (databaseExists) {
			logger.info(`Database '${config.mysql.database}' already exists.`);
		} else {
			await connection.query(`CREATE DATABASE IF NOT EXISTS ${config.mysql.database}`);
			logger.info(`Database '${config.mysql.database}' created.`);
			await connection.query(`USE ${config.mysql.database}`);
			logger.info(`Using database '${config.mysql.database}'.`);

			fs.readdirSync(path.join(__dirname, 'schemas')).forEach(async (file) => {
				logger.info(`Creating schema from file '${file}'...`);
				const sql = fs.readFileSync(path.join(__dirname, 'schemas', file), 'utf8');
				await connection.query(sql);
        logger.info(`Schema from file '${file}' created.`);
				await seedTable(file);
			});
			logger.info(`All schemas created.`);
		}

		await connection.end();

		// Create lock file after successful setup
		fs.writeFileSync(lockFilePath, 'Database setup completed');
		logger.info('Database setup completed successfully.');
	} catch (error) {
		logger.error('Error during database setup:', error);
		throw error;
	}
}

module.exports = {
	setupDatabase
};
