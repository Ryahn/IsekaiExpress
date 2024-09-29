const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
  console.log(`Database '${process.env.DB_NAME}' created or already exists.`);

  await connection.query(`USE ${process.env.DB_NAME}`);

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await connection.query(sql);
  console.log(`Schema created.`);

  await connection.end();
}

module.exports = {
  setupDatabase
};
