// src/server.js
// Entry point: loads the configured Express app and starts listening.
// Keeping this minimal means app.js can be tested independently.

import dotenv from 'dotenv';
import app    from './app.js';

dotenv.config(); // Ensure .env is loaded even if this file is run directly

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ MCTEB server is running on http://localhost:${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/api/health`);
});
