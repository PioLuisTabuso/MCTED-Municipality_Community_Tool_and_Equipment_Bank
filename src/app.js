// src/app.js
// Creates and configures the Express application.
// Kept separate from server.js so tests can import the app without binding a port.

import express    from 'express';
import cors       from 'cors';
import dotenv     from 'dotenv';

import authRoutes     from './routes/authRoutes.js';
import toolRoutes     from './routes/toolRoutes.js';
import rentalRoutes   from './routes/rentalRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';

import { errorHandler } from './middleware/errorMiddleware.js';
import pool             from './config/db.js';

dotenv.config(); // Read .env into process.env

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

// Parse incoming JSON request bodies
app.use(express.json());

// Parse URL-encoded form data (e.g. HTML forms)
app.use(express.urlencoded({ extended: true }));

// Enable CORS so a browser-based frontend can call this API
app.use(cors());

// Serve files in /public as static assets (HTML, CSS, images)
app.use(express.static('public'));

// ── Health Check Route ────────────────────────────────────────────────────────

// GET /api/health
// Returns the API status and whether the database connection is reachable.
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';

  try {
    // Try to borrow a connection from the pool and run a trivial query
    const connection = await pool.getConnection();
    await connection.query('SELECT 1'); // succeeds if MySQL is reachable
    connection.release();               // always return the connection to the pool
    dbStatus = 'connected';
  } catch (err) {
    // Database is not reachable – log the reason but don't crash the server
    console.warn('[Health] Database check failed:', err.message);
  }

  res.json({
    status:   'ok',
    database: dbStatus,
    time:     new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
// Each module's routes are mounted under a logical prefix.
// Routes themselves are empty placeholders for now.

app.use('/api/auth',     authRoutes);
app.use('/api/tools',    toolRoutes);
app.use('/api/rentals',  rentalRoutes);
app.use('/api/feedback', feedbackRoutes);

// ── Global Error Handler ──────────────────────────────────────────────────────
// Must be registered AFTER all routes so it catches errors they throw.
app.use(errorHandler);

export default app;
