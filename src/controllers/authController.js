// src/controllers/authController.js
// Handles user registration, authentication (login), and user profile retrieval.

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import fs from 'fs';
import pool from '../config/db.js';

/**
 * Validation rules for user registration.
 * Checks all required fields, Philippine mobile format, and 18+ age requirement.
 */
export const registerValidationRules = [
  body('user_f')
    .trim()
    .notEmpty()
    .withMessage('First name is required.')
    .isLength({ max: 100 })
    .withMessage('First name cannot exceed 100 characters.'),

  body('user_l')
    .trim()
    .notEmpty()
    .withMessage('Last name is required.')
    .isLength({ max: 100 })
    .withMessage('Last name cannot exceed 100 characters.'),

  body('user_m')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Middle name cannot exceed 100 characters.'),

  body('birthday')
    .notEmpty()
    .withMessage('Birthday is required.')
    .isISO8601()
    .withMessage('Birthday must be a valid date in YYYY-MM-DD format.')
    .custom((value) => {
      // Calculate age based on current date
      const birthDate = new Date(value);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      // Adjust age if birthday hasn't occurred yet this year
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      if (age < 18) {
        throw new Error('User must be at least 18 years old to register.');
      }
      return true;
    }),

  body('contact_no')
    .trim()
    .notEmpty()
    .withMessage('Contact number is required.')
    .matches(/^(09|\+639)\d{9}$/)
    .withMessage('Contact number must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).'),

  body('house_no')
    .optional({ checkFalsy: true })
    .isInt()
    .withMessage('House number must be a valid integer.'),

  body('street')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Street cannot exceed 50 characters.'),

  body('brgy')
    .trim()
    .notEmpty()
    .withMessage('Barangay is required.')
    .isLength({ max: 50 })
    .withMessage('Barangay cannot exceed 50 characters.'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required.')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long.'),

  body('id_type')
    .trim()
    .notEmpty()
    .withMessage('ID type is required.')
    .isLength({ max: 30 })
    .withMessage('ID type cannot exceed 30 characters.'),
];

/**
 * Controller: register
 * Registers a new resident account with uploaded ID photo.
 */
export async function register(req, res, next) {
  try {
    // 1. Check for express-validator errors
    const errors = validationResult(req);

    // Also verify that an ID image file was actually uploaded
    if (!req.file) {
      errors.errors.push({
        type: 'field',
        path: 'id_image',
        msg: 'ID image file is required.',
      });
    }

    // If validation failed, delete the uploaded file immediately to prevent orphaned images
    if (!errors.isEmpty()) {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed.',
        errors: errors.array(),
      });
    }

    const {
      user_f,
      user_l,
      user_m,
      birthday,
      contact_no,
      house_no,
      street,
      brgy,
      email,
      password,
      id_type,
    } = req.body;

    // 2. Check for duplicate email (reject with 409)
    const [existingUsers] = await pool.query(
      'SELECT user_id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      // Remove uploaded image if email already exists
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(409).json({
        status: 'fail',
        message: 'Email is already registered.',
      });
    }

    // 3. Hash password securely with bcrypt (10 salt rounds)
    const password_hash = await bcrypt.hash(password, 10);

    // 4. Save relative file path (standard forward slashes)
    const id_image_path = `uploads/ids/${req.file.filename}`;

    // 5. Insert new user into database with parameterized query
    // Enforce role = 'resident' and verified_status = 'pending' regardless of client input
    const [insertResult] = await pool.query(
      `INSERT INTO users (
        birthday, user_f, user_l, user_m, contact_no, status,
        house_no, street, brgy, email, password_hash,
        role, id_type, id_image_path, verified_status
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 'resident', ?, ?, 'pending')`,
      [
        birthday,
        user_f,
        user_l,
        user_m || null,
        contact_no,
        house_no ? parseInt(house_no, 10) : null,
        street || null,
        brgy,
        email,
        password_hash,
        id_type,
        id_image_path,
      ]
    );

    // 6. Respond 201 with user details (excluding password_hash)
    return res.status(201).json({
      status: 'success',
      message: 'Registration successful. Account is pending verification.',
      user_id: insertResult.insertId,
      email,
      verified_status: 'pending',
    });
  } catch (err) {
    // Clean up uploaded file if an unexpected error occurs
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.error('[Cleanup Error]', cleanupErr.message);
      }
    }
    next(err);
  }
}

/**
 * Controller: login
 * Authenticates user credentials, enforces status and verification rules,
 * checks for unpaid penalties, and issues a 2-hour JWT.
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Validate request body
    if (!email || !password) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password.',
      });
    }

    // 1. Fetch user by email
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    // If user does not exist, return generic 401 error
    if (rows.length === 0) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password.',
      });
    }

    const user = rows[0];

    // 2. Compare password hash using bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password.',
      });
    }

    // 3. Check account active status
    if (user.status === 'suspended') {
      return res.status(403).json({
        status: 'fail',
        message: 'Account is suspended. Please contact administrator.',
      });
    }

    // 4. Check verification status
    if (user.verified_status === 'pending') {
      return res.status(403).json({
        status: 'fail',
        code: 'PENDING_VERIFICATION',
        message: 'Your account is pending ID verification. Please wait for staff approval.',
      });
    }

    if (user.verified_status === 'rejected') {
      return res.status(403).json({
        status: 'fail',
        code: 'REJECTED',
        message: 'Your ID verification was rejected. Please contact support.',
      });
    }

    // 5. Check if user has any unpaid penalties in inve_rec
    const [penaltyRows] = await pool.query(
      `SELECT COUNT(*) AS unpaidCount
       FROM inve_rec
       WHERE user_id = ? AND penalty_status = 'unpaid'`,
      [user.user_id]
    );
    const hasUnpaidPenalty = penaltyRows[0].unpaidCount > 0;

    // 6. Generate JWT (expiring in 2 hours)
    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 7. Return auth response
    return res.status(200).json({
      status: 'success',
      token,
      user: {
        user_id: user.user_id,
        name: `${user.user_f} ${user.user_l}`,
        email: user.email,
        role: user.role,
        verified_status: user.verified_status,
      },
      hasUnpaidPenalty,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controller: getProfile
 * Returns profile information of the currently authenticated user.
 */
export async function getProfile(req, res) {
  // req.user was populated by the authenticate middleware
  return res.status(200).json({
    status: 'success',
    user: req.user,
  });
}
