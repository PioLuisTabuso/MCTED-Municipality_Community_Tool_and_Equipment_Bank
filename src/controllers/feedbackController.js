// src/controllers/feedbackController.js
// Handles community reviews/ratings, complaint (defective tool) reports,
// information update requests, and notification management.

import fs from 'fs';
import { body, validationResult } from 'express-validator';
import pool from '../config/db.js';

// ===========================================================================
// REVIEWS & RATINGS
// ===========================================================================

export const reviewRules = [
  body('receipt_id')
    .notEmpty().withMessage('Receipt ID is required.')
    .isInt({ min: 1 }).withMessage('Receipt ID must be a positive integer.'),

  body('rating')
    .notEmpty().withMessage('Rating is required.')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be an integer between 1 and 5.'),

  body('review')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Review cannot exceed 255 characters.'),
];

// ---------------------------------------------------------------------------
// POST /api/feedback/reviews
// Resident: submit a rating/review for a completed rental
// ---------------------------------------------------------------------------
export async function submitReview(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const { receipt_id, rating, review } = req.body;
    const user_id = req.user.user_id;

    // Verify receipt belongs to this user AND the rental is returned (completed)
    const [receiptRows] = await pool.query(
      `SELECT r.receipt_id, r.pay_stat, ir.rental_status, ir.user_id
       FROM receipt r
       JOIN inve_rec ir ON ir.receipt_id = r.receipt_id
       WHERE r.receipt_id = ?`,
      [receipt_id]
    );

    if (receiptRows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Receipt not found.' });
    }

    const rec = receiptRows[0];
    if (rec.user_id !== user_id) {
      return res.status(403).json({ status: 'fail', message: 'You can only review your own rentals.' });
    }
    if (rec.rental_status !== 'returned') {
      return res.status(409).json({
        status: 'fail',
        message: 'Reviews can only be submitted after the tool has been returned.',
      });
    }

    // Prevent duplicate review for same receipt
    const [existing] = await pool.query(
      'SELECT feedback_id FROM feedback_sys WHERE receipt_id = ? AND user_id = ?',
      [receipt_id, user_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ status: 'fail', message: 'You have already submitted a review for this rental.' });
    }

    const [result] = await pool.query(
      `INSERT INTO feedback_sys (user_id, receipt_id, rating, review)
       VALUES (?, ?, ?, ?)`,
      [user_id, receipt_id, parseInt(rating), review || null]
    );

    return res.status(201).json({
      status: 'success',
      message: 'Review submitted successfully.',
      feedback_id: result.insertId,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/feedback/reviews?tool_id=
// Public: list visible reviews for a tool
// ---------------------------------------------------------------------------
export async function getReviews(req, res, next) {
  try {
    const { tool_id, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT fs.feedback_id, fs.rating, fs.review, fs.submitted_at,
             u.user_f, u.user_l,
             t.tool_name, t.tool_id
      FROM feedback_sys fs
      JOIN users u ON fs.user_id = u.user_id
      JOIN receipt r ON fs.receipt_id = r.receipt_id
      JOIN tools t ON r.tool_id = t.tool_id
      WHERE fs.status = 'submitted'
    `;
    const params = [];

    if (tool_id) {
      sql += ' AND t.tool_id = ?';
      params.push(parseInt(tool_id));
    }

    const [countRows] = await pool.query(
      sql.replace(/SELECT[\s\S]+?FROM/, 'SELECT COUNT(*) AS total FROM'),
      params
    );
    const total = countRows[0].total;

    sql += ' ORDER BY fs.submitted_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(sql, params);

    return res.status(200).json({
      status: 'success',
      data: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/feedback/reviews/:id/moderate
// Admin/Staff: hide or re-show a review
// ---------------------------------------------------------------------------
export const moderateReviewRules = [
  body('status')
    .trim()
    .isIn(['submitted', 'reviewed', 'hidden'])
    .withMessage("Status must be 'submitted', 'reviewed', or 'hidden'."),
];

export async function moderateReview(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const feedbackId = parseInt(req.params.id, 10);
    if (isNaN(feedbackId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid feedback ID.' });
    }

    const { status } = req.body;
    const [result] = await pool.query(
      'UPDATE feedback_sys SET status = ? WHERE feedback_id = ?',
      [status, feedbackId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'fail', message: 'Review not found.' });
    }

    return res.status(200).json({ status: 'success', message: `Review status updated to '${status}'.` });
  } catch (err) {
    next(err);
  }
}

// ===========================================================================
// COMPLAINTS (Defective Tool Reports)
// ===========================================================================

export const complaintRules = [
  body('receipt_id')
    .notEmpty().withMessage('Receipt ID is required.')
    .isInt({ min: 1 }).withMessage('Receipt ID must be a positive integer.'),

  body('description')
    .trim()
    .notEmpty().withMessage('Complaint description is required.')
    .isLength({ max: 255 }).withMessage('Description cannot exceed 255 characters.'),
];

// ---------------------------------------------------------------------------
// POST /api/feedback/complaints
// Resident: file a defective-tool complaint (with optional photo/video)
// ---------------------------------------------------------------------------
export async function fileComplaint(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const { receipt_id, description } = req.body;
    const user_id = req.user.user_id;

    // Verify receipt belongs to this user
    const [receiptRows] = await pool.query(
      `SELECT r.receipt_id, ir.user_id, t.tool_name, t.owner_id
       FROM receipt r
       JOIN inve_rec ir ON ir.receipt_id = r.receipt_id
       JOIN tools t ON r.tool_id = t.tool_id
       WHERE r.receipt_id = ?`,
      [receipt_id]
    );

    if (receiptRows.length === 0) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ status: 'fail', message: 'Receipt not found.' });
    }

    const rec = receiptRows[0];
    if (rec.user_id !== user_id) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ status: 'fail', message: 'You can only file complaints for your own rentals.' });
    }

    const media_path = req.file ? `uploads/complaints/${req.file.filename}` : null;

    const [result] = await pool.query(
      `INSERT INTO complaints (user_id, receipt_id, description, media_path)
       VALUES (?, ?, ?, ?)`,
      [user_id, receipt_id, description, media_path]
    );

    // Notify staff
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, ref_id)
       VALUES (?, 'complaint_filed', ?, ?)`,
      [
        rec.owner_id,
        `A complaint was filed about "${rec.tool_name}" by user #${user_id}.`,
        result.insertId,
      ]
    ).catch(() => {});

    return res.status(201).json({
      status: 'success',
      message: 'Complaint submitted. Our staff will review it shortly.',
      complaint_id: result.insertId,
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/feedback/complaints
// Staff/Admin: list all complaints; Resident: list own complaints
// ---------------------------------------------------------------------------
export async function getComplaints(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const isStaff = ['admin', 'staff'].includes(req.user.role);

    let sql = `
      SELECT c.complaint_id, c.description, c.media_path, c.status, c.submitted_at,
             u.user_f, u.user_l, u.email,
             t.tool_name, t.tool_id, r.receipt_id
      FROM complaints c
      JOIN users u ON c.user_id = u.user_id
      JOIN receipt r ON c.receipt_id = r.receipt_id
      JOIN tools t ON r.tool_id = t.tool_id
      WHERE 1=1
    `;
    const params = [];

    if (!isStaff) {
      sql += ' AND c.user_id = ?';
      params.push(req.user.user_id);
    }
    if (status) {
      sql += ' AND c.status = ?';
      params.push(status);
    }

    const [countRows] = await pool.query(
      sql.replace(/SELECT[\s\S]+?FROM/, 'SELECT COUNT(*) AS total FROM'),
      params
    );
    const total = countRows[0].total;

    sql += ' ORDER BY c.submitted_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(sql, params);

    return res.status(200).json({
      status: 'success',
      data: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
}

// ===========================================================================
// INFO UPDATE REQUESTS
// Residents ask the municipality to correct their official profile data.
// ===========================================================================

export const infoUpdateRules = [
  body('field')
    .trim()
    .notEmpty().withMessage('Field name is required.')
    .isIn(['user_f', 'user_l', 'user_m', 'contact_no', 'birthday', 'brgy', 'street', 'house_no', 'email'])
    .withMessage('Invalid field name for update request.'),

  body('requested_value')
    .trim()
    .notEmpty().withMessage('Requested value is required.')
    .isLength({ max: 100 }).withMessage('Requested value cannot exceed 100 characters.'),

  body('reason')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Reason cannot exceed 255 characters.'),
];

// ---------------------------------------------------------------------------
// POST /api/feedback/info-update
// Resident: request a correction to their profile data
// ---------------------------------------------------------------------------
export async function requestInfoUpdate(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const { field, requested_value, reason } = req.body;
    const user_id = req.user.user_id;

    const [result] = await pool.query(
      `INSERT INTO info_update_requests (user_id, field_name, requested_value, reason)
       VALUES (?, ?, ?, ?)`,
      [user_id, field, requested_value, reason || null]
    );

    return res.status(201).json({
      status: 'success',
      message: 'Info update request submitted. Staff will review and apply the change.',
      request_id: result.insertId,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/feedback/info-update
// Staff/Admin: list all pending info update requests
// ---------------------------------------------------------------------------
export async function getInfoUpdateRequests(req, res, next) {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows] = await pool.query(
      `SELECT iur.request_id, iur.field_name, iur.requested_value, iur.reason,
              iur.status, iur.submitted_at, iur.reviewed_at,
              u.user_id, u.user_f, u.user_l, u.email
       FROM info_update_requests iur
       JOIN users u ON iur.user_id = u.user_id
       WHERE iur.status = ?
       ORDER BY iur.submitted_at ASC
       LIMIT ? OFFSET ?`,
      [status, parseInt(limit), offset]
    );

    return res.status(200).json({ status: 'success', data: rows });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/feedback/info-update/:id/resolve
// Staff/Admin: approve or reject an info update request
// ---------------------------------------------------------------------------
export const resolveInfoUpdateRules = [
  body('decision')
    .trim()
    .isIn(['approved', 'rejected'])
    .withMessage("Decision must be 'approved' or 'rejected'."),
];

export async function resolveInfoUpdate(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const requestId = parseInt(req.params.id, 10);
    if (isNaN(requestId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid request ID.' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM info_update_requests WHERE request_id = ?',
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Info update request not found.' });
    }

    const request = rows[0];
    if (request.status !== 'pending') {
      return res.status(409).json({
        status: 'fail',
        message: `Request is already '${request.status}'.`,
      });
    }

    const { decision } = req.body;

    // If approved, apply the change to the user's profile
    if (decision === 'approved') {
      const allowedFields = ['user_f', 'user_l', 'user_m', 'contact_no', 'birthday', 'brgy', 'street', 'house_no'];
      if (allowedFields.includes(request.field_name)) {
        await pool.query(
          `UPDATE users SET \`${request.field_name}\` = ? WHERE user_id = ?`,
          [request.requested_value, request.user_id]
        );
      }
    }

    await pool.query(
      `UPDATE info_update_requests SET status = ?, reviewed_at = NOW()
       WHERE request_id = ?`,
      [decision, requestId]
    );

    // Notify the resident
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, ref_id)
       VALUES (?, 'info_update_resolved', ?, ?)`,
      [
        request.user_id,
        `Your request to update "${request.field_name}" has been ${decision}.`,
        requestId,
      ]
    ).catch(() => {});

    return res.status(200).json({
      status: 'success',
      message: `Info update request ${decision}.`,
    });
  } catch (err) {
    next(err);
  }
}

// ===========================================================================
// NOTIFICATIONS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/feedback/notifications
// Authenticated: list notifications for the current user
// ---------------------------------------------------------------------------
export async function getNotifications(req, res, next) {
  try {
    const { read, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT notification_id, type, message, ref_id, is_read, created_at
      FROM notifications
      WHERE user_id = ?
    `;
    const params = [req.user.user_id];

    if (read !== undefined) {
      sql += ' AND is_read = ?';
      params.push(read === 'true' ? 1 : 0);
    }

    const [countRows] = await pool.query(
      sql.replace(/SELECT[\s\S]+?FROM/, 'SELECT COUNT(*) AS total FROM'),
      params
    );
    const total = countRows[0].total;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(sql, params);

    return res.status(200).json({
      status: 'success',
      data: rows,
      unread_count: rows.filter((n) => !n.is_read).length,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/feedback/notifications/:id/read
// Mark a notification as read
// ---------------------------------------------------------------------------
export async function markNotificationRead(req, res, next) {
  try {
    const notifId = parseInt(req.params.id, 10);
    if (isNaN(notifId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid notification ID.' });
    }

    const [result] = await pool.query(
      `UPDATE notifications SET is_read = 1
       WHERE notification_id = ? AND user_id = ?`,
      [notifId, req.user.user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'fail', message: 'Notification not found.' });
    }

    return res.status(200).json({ status: 'success', message: 'Notification marked as read.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/feedback/notifications/read-all
// Mark all of the user's notifications as read
// ---------------------------------------------------------------------------
export async function markAllNotificationsRead(req, res, next) {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.user_id]
    );
    return res.status(200).json({ status: 'success', message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
}
