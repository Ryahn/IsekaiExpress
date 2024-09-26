const mysql = require('mysql2');  // Use mysql2 without the promise-based version
require('dotenv').config({ path: '../.env' });

// Create a pool of connections with mysql2
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS,
  database: process.env.MYSQL_DB,
  port: process.env.MYSQL_PORT
});

module.exports = {
  query: function (...args) {
    let callback = args[args.length - 1]; // Extract the last argument, assuming it's the callback
    let sql_args = [];

    // Ensure that the callback is a function
    if (typeof callback !== 'function') {
      throw new TypeError('Expected last argument to be a callback function');
    }

    // If more than 2 arguments are provided, treat the second one as SQL parameters
    if (args.length > 2) {
      sql_args = args[1];
    }

    // Fetch a connection from the pool
    pool.getConnection((err, connection) => {
      if (err) {
        // Handle connection errors
        console.error('Error getting database connection:', err);
        return callback(err);
      }

      // Execute the query
      connection.query(args[0], sql_args, (queryErr, results, fields) => {
        // Release the connection back to the pool
        connection.release();

        if (queryErr) {
          // Handle query execution errors
          console.error('Error executing query:', queryErr);
          return callback(queryErr);
        }

        // Execute the callback with results
        return callback(null, results, fields);
      });
    });
  }
};
