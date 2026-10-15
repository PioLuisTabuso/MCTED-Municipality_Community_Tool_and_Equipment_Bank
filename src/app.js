
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import toolRoutes from './routes/toolRoutes.js';
import rentalRoutes from './routes/rentalRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';

import { errorHandler } from './middleware/errorMiddleware.js';
import pool from './config/db.js';

dotenv.config();

const app = express();


app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(cors());

app.use(express.static('public'));


app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';

  try {
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
    dbStatus = 'connected';
  } catch (err) {
    console.warn('[Health] Database check failed:', err.message);
  }

  res.json({
    status: 'ok',
    database: dbStatus,
    time: new Date().toISOString(),
  });
});


app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/feedback', feedbackRoutes);

app.use(errorHandler);

export default app;
