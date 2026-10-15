
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const TEST_PASSWORD = 'Password123!';

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

try {
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const [result] = await connection.execute(
    "UPDATE users SET password_hash = ? WHERE email LIKE '%@mcteb.test'",
    [hash]
  );
  console.log(`Updated ${result.affectedRows} seeded user(s). Password: ${TEST_PASSWORD}`);
} finally {
  await connection.end();
}
