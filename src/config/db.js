// src/config/db.js
// Creates a shared MySQL connection pool using mysql2/promise.
// All database queries throughout the app import this pool.

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config(); // Load variables from .env

// mysql2 createPool keeps a set of reusable connections, which is
// more efficient than opening a new connection for every request.
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,   // queue requests when the pool is full
  connectionLimit:    10,     // max concurrent connections
  queueLimit:         0,      // 0 = unlimited queue
});

export default pool;
