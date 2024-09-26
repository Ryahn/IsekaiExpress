const mysql = require('mysql2');
require('dotenv').config();
// Create a connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS,
  database: process.env.MYSQL_DB,
  port: process.env.MYSQL_PORT,
  connectionLimit: 10, // Adjust as needed
});

// Test the connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('MySQL pool established');
  connection.release();
});

module.exports = {
  query: (sql, params) => {
    return new Promise((resolve, reject) => {
      pool.getConnection((err, connection) => {
        if (err) {
          reject(err);
          return;
        }

        connection.query(sql, params, (error, results) => {
          // Always release the connection back to the pool
          connection.release();

          if (error) {
            console.error('Database query error:', error);
            reject(error);
          } else {
            resolve(results);
          }
        });
      });
    });
  },

  // Helper function to end the pool (use when shutting down the app)
  end: () => {
    return new Promise((resolve, reject) => {
      pool.end(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
};