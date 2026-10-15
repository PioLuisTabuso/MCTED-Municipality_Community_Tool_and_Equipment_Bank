// src/controllers/adminController.js
// Handles administrative operations such as review of pending user accounts and ID verification.

import path from 'path';
import fs from 'fs';
import { body, validationResult } from 'express-validator';
import pool from '../config/db.js';

/**
 * Controller: getPendingUsers
 * Retrieves all registered users awaiting ID verification.
 * Only returns relevant profile information and never exposes password hashes.
 */
export async function getPendingUsers(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT user_id, user_f, user_l, user_m, email, contact_no, brgy, id_type, birthday
       FROM users
       WHERE verified_status = 'pending'
       ORDER BY user_id ASC`
    );

    // Format output with concatenated full name
    const pendingUsers = rows.map((u) => ({
      user_id: u.user_id,
      name: `${u.user_f} ${u.user_l}`.trim(),
      email: u.email,
      contact_no: u.contact_no,
      brgy: u.brgy,
      id_type: u.id_type,
      birthday: u.birthday,
    }));

    return res.status(200).json({
      status: 'success',
      users: pendingUsers,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controller: getUserIdImage
 * Streams a user's uploaded ID image directly from uploads/ids/.
 * Includes strict path resolution checks to prevent directory traversal attacks.
 */
export async function getUserIdImage(req, res, next) {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid user ID format.',
      });
    }

    // Retrieve user and their registered ID image path
    const [rows] = await pool.query(
      'SELECT user_id, id_image_path FROM users WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0 || !rows[0].id_image_path) {
      return res.status(404).json({
        status: 'fail',
        message: 'ID image not found for this user.',
      });
    }

    const idImagePath = rows[0].id_image_path;

    // Security check: resolve canonical absolute path and ensure it is strictly within uploads/ids/
    const baseDir = path.resolve('uploads/ids');
    const resolvedPath = path.resolve(idImagePath);

    if (!resolvedPath.startsWith(baseDir + path.sep)) {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied: invalid file location.',
      });
    }

    // Verify file actually exists on the filesystem
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        status: 'fail',
        message: 'ID image file does not exist on disk.',
      });
    }

    // Stream image to client with proper Content-Type
    return res.sendFile(resolvedPath);
  } catch (err) {
    next(err);
  }
}

/**
 * Validation rules for verification decision.
 */
export const verificationValidationRules = [
  body('decision')
    .trim()
    .isIn(['verified', 'rejected'])
    .withMessage("Decision must be either 'verified' or 'rejected'."),
];

/**
 * Controller: updateVerificationStatus
 * Approves or rejects a user's account verification.
 * Only allows changing accounts that are currently 'pending' (returns 409 otherwise).
 */
export async function updateVerificationStatus(req, res, next) {
  try {
    // 1. Validate decision body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed.',
        errors: errors.array(),
      });
    }

    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid user ID format.',
      });
    }

    const { decision } = req.body;

    // 2. Fetch current verified_status of the user
    const [rows] = await pool.query(
      'SELECT user_id, verified_status FROM users WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found.',
      });
    }

    const user = rows[0];

    // 3. Prevent modifying accounts that are not in 'pending' status
    if (user.verified_status !== 'pending') {
      return res.status(409).json({
        status: 'fail',
        message: `Cannot update verification. Account is already '${user.verified_status}', not 'pending'.`,
      });
    }

    // 4. Update status in database
    await pool.query(
      'UPDATE users SET verified_status = ? WHERE user_id = ? AND verified_status = "pending"',
      [decision, userId]
    );

    return res.status(200).json({
      status: 'success',
      message: `User verification status updated to '${decision}'.`,
      user_id: userId,
      verified_status: decision,
    });
  } catch (err) {
    next(err);
  }
}
