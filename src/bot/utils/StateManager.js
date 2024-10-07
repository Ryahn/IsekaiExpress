const { EventEmitter } = require('events');
const mysql = require('mysql2/promise');
require('dotenv').config();

class StateManager extends EventEmitter {
    constructor() {
        super();
        this.pool = null;
        this.retryAttempts = 3;
    }

    async initPool() {
        if (!this.pool) {
            try {
                this.pool = mysql.createPool({
                    host: process.env.MYSQL_HOST,
                    user: process.env.MYSQL_USER,
                    password: process.env.MYSQL_PASS,
                    database: process.env.MYSQL_DB,
                    waitForConnections: true,
                    connectionLimit: 20,
                    queueLimit: 0,
                    connectTimeout: 10000,
                    debug: process.env.MYSQL_DEBUG === 'true',
                });
                console.log('MySQL pool established');
            } catch (err) {
                console.error('Error creating MySQL pool:', err);
                throw new Error('Failed to initialize database connection pool');
            }
        }
    }

    async query(sql, params) {
        let attempts = 0;
        let connection;

        while (attempts < this.retryAttempts) {
            try {
                if (!this.pool) {
                    await this.initPool();
                }
                connection = await this.pool.getConnection(); 
                const [results] = await connection.execute(sql, params);
                return results;
            } catch (err) {
                attempts++;
                console.error(`Error executing query (Attempt ${attempts}):`, err);

                // Handle specific MySQL errors that might warrant a retry
                if (['PROTOCOL_CONNECTION_LOST', 'ER_LOCK_WAIT_TIMEOUT', 'ER_QUERY_TIMEOUT', 'PROTOCOL_PACKETS_OUT_OF_ORDER'].includes(err.code)) {
                    console.log(`Retrying query (Attempt ${attempts})...`);
                    continue; // Retry the query
                }

                throw err;
            } finally {
                if (connection) connection.release();
            }
        }

        throw new Error('Query failed after maximum retry attempts');
    }

    async closePool(filename) {
        if (this.pool) {
            try {
                await this.pool.end();
                this.pool = null;
                console.log(`MySQL pool for ${filename} closed`);
            } catch (err) {
                console.error('Error closing MySQL pool:', err);
            }
        }
    }
}

module.exports = StateManager;
