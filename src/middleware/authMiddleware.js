// src/middleware/authMiddleware.js
// Handles authentication and role-based authorization for protected routes.

import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

/**
 * Middleware: authenticate
 * Reads the Authorization header, verifies the JWT, and loads the active user from the database.
 * Responds with 401 if missing, invalid, expired, or user not found.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Check if the header is present and begins with 'Bearer '
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'fail',
        message: 'Authentication required. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token using application secret
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid or expired token.',
      });
    }

    // Retrieve fresh user record from the database (excluding password_hash)
    const [rows] = await pool.query(
      `SELECT user_id, birthday, user_f, user_l, user_m, contact_no,
              status, house_no, street, brgy, email, role, id_type,
              verified_status
       FROM users
       WHERE user_id = ?`,
      [decoded.user_id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        status: 'fail',
        message: 'User account not found.',
      });
    }

    const user = rows[0];

    // Block suspended accounts immediately
    if (user.status === 'suspended') {
      return res.status(403).json({
        status: 'fail',
        message: 'Account is suspended. Please contact administrator.',
      });
    }

    // Attach user profile to request object for downstream handlers
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware factory: requireRole
 * Restricts route access to specific user roles (e.g., 'admin', 'staff').
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied: insufficient permissions.',
      });
    }
    next();
  };
}
