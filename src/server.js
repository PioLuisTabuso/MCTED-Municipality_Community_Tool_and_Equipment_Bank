// src/server.js
// Application entry point. Verifies critical environment variables before binding to the HTTP port.

import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

// Ensure JWT_SECRET is configured; fail immediately at startup if missing
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  console.error('❌ FATAL: JWT_SECRET environment variable is missing in .env');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ MCTEB server is running on http://localhost:${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/api/health`);
});
