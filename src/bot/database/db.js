require('dotenv').config();
const mysql = require('mysql2/promise');

let pool;

async function getConnection() {
    if (!pool) {
        try {
            pool = mysql.createPool({
                host: process.env.MYSQL_HOST,
                user: process.env.MYSQL_USER,
                password: process.env.MYSQL_PASS,
                database: process.env.MYSQL_DB,
                waitForConnections: true,
                connectionLimit: 10, // You can adjust the limit based on your needs
                queueLimit: 0
            });
            console.log('MySQL pool established');
        } catch (err) {
            console.error('Error creating MySQL pool:', err);
            throw err;
        }
    }
    return pool;
}

module.exports = { getConnection };
