const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../.config');
const logger = require('silly-logger');

const excludedTables = ['dmca', 'games', 'uploaders'];

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

async function setupDatabase(skipLockFile = false) {
	const lockFilePath = path.join(__dirname, 'db_setup.lock');

	try {
		if (fs.existsSync(lockFilePath) && !skipLockFile) {
			logger.info('Database setup has already been completed. Skipping...');
			return;
		} else if (skipLockFile) {
			logger.info('--skip-lock flag detected. Skipping lock file creation.');
		}

		const connection = await mysql.createConnection({
			host: config.mysql.host,
			user: config.mysql.user,
			password: config.mysql.password,
		});

		const [rows] = await connection.query(`SHOW DATABASES LIKE '${config.mysql.database}'`);
		const databaseExists = rows.length > 0;

		if (databaseExists && !skipLockFile) {
			logger.info(`Database '${config.mysql.database}' already exists.`);
		} else {
			await connection.query(`CREATE DATABASE IF NOT EXISTS ${config.mysql.database}`);
			logger.info(`Database '${config.mysql.database}' created or already exists.`);
			await connection.query(`USE ${config.mysql.database}`);
			logger.info(`Using database '${config.mysql.database}'.`);

			for (const file of fs.readdirSync(path.join(__dirname, 'schemas'))) {
				if (file.endsWith('.sql')) {
					const tableName = path.basename(file, '.sql');
					if (excludedTables.includes(tableName)) {
						logger.info(`Table '${tableName}' is excluded. Skipping...`);
						continue;
					}

					logger.info(`Processing schema file '${file}'...`);
					const sql = fs.readFileSync(path.join(__dirname, 'schemas', file), 'utf8');
					
					const statements = sql.split(';').filter(statement => statement.trim() !== '');
					const [rows] = await connection.query(`SHOW TABLES LIKE '${tableName}'`);
					if (rows.length > 0) {
						logger.info(`Table '${tableName}' already exists. Skipping creation.`);
						continue;
					} else {
						for (const statement of statements) {
							const trimmedStatement = statement.trim();
							if (trimmedStatement) {
								try {
									logger.info(`Executing statement: ${trimmedStatement.substring(0, 50)}...`);
									await connection.query(trimmedStatement);
									logger.info(`Statement executed successfully.`);
								} catch (error) {
									logger.error(`Error executing statement from '${file}':`, error);
									logger.error(`Full problematic SQL statement: ${trimmedStatement}`);
								}
							}
						}
						await seedTable(tableName);
						logger.info(`Schema file '${file}' processed.`);
					}
				}
			}
			logger.info(`All schema files processed.`);

			fs.writeFileSync(lockFilePath, 'Database setup completed');
			logger.info('Database setup completed successfully.');
		}

		await connection.end();

	} catch (error) {
		logger.error('Error during database setup:', error);
		throw error;
	}
}

module.exports = {
	setupDatabase
};
