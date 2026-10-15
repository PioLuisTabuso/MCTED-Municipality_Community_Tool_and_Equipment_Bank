// src/controllers/toolController.js
// Handles CRUD for tools, inventory management, tool photo uploads,
// and maintenance/repair tracking — all features from the MCTED feature spec.

import fs from 'fs';
import path from 'path';
import { body, query, validationResult } from 'express-validator';
import pool from '../config/db.js';

// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------

export const toolValidationRules = [
  body('tool_name')
    .trim()
    .notEmpty().withMessage('Tool name is required.')
    .isLength({ max: 100 }).withMessage('Tool name cannot exceed 100 characters.'),

  body('category')
    .trim()
    .notEmpty().withMessage('Category is required.')
    .isLength({ max: 50 }).withMessage('Category cannot exceed 50 characters.'),

  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Description cannot exceed 255 characters.'),

  body('specifications')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Specifications cannot exceed 255 characters.'),

  body('quantity')
    .notEmpty().withMessage('Quantity is required.')
    .isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer.'),

  body('fee')
    .notEmpty().withMessage('Daily rental fee is required.')
    .isFloat({ min: 0 }).withMessage('Fee must be a non-negative number.'),

  body('tool_condition')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['good', 'fair', 'poor', 'under_repair'])
    .withMessage("Condition must be one of: good, fair, poor, under_repair."),
];

// ---------------------------------------------------------------------------
// GET /api/tools
// Public: list all tools with optional filters
// ---------------------------------------------------------------------------
export async function getTools(req, res, next) {
  try {
    const { category, status, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT t.tool_id, t.tool_name, t.category, t.description, t.specifications,
             t.quantity, t.fee, t.availability_status, t.tool_condition, t.image_path,
             u.user_f, u.user_l, u.brgy
      FROM tools t
      JOIN users u ON t.owner_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      sql += ' AND t.category = ?';
      params.push(category);
    }
    if (status) {
      sql += ' AND t.availability_status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (t.tool_name LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Count total for pagination
    const countSql = sql.replace(
      /SELECT[\s\S]+?FROM/,
      'SELECT COUNT(*) AS total FROM'
    );
    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0].total;

    sql += ' ORDER BY t.tool_id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(sql, params);

    return res.status(200).json({
      status: 'success',
      data: rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/tools/categories
// Public: list distinct tool categories (for filter dropdowns)
// ---------------------------------------------------------------------------
export async function getCategories(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT category FROM tools ORDER BY category ASC'
    );
    return res.status(200).json({
      status: 'success',
      categories: rows.map((r) => r.category),
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/tools/:id
// Public: single tool detail with average rating
// ---------------------------------------------------------------------------
export async function getToolById(req, res, next) {
  try {
    const toolId = parseInt(req.params.id, 10);
    if (isNaN(toolId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid tool ID.' });
    }

    const [rows] = await pool.query(
      `SELECT t.*, u.user_f, u.user_l, u.brgy,
              ROUND(AVG(fs.rating), 1) AS avg_rating,
              COUNT(fs.feedback_id)    AS review_count
       FROM tools t
       JOIN users u ON t.owner_id = u.user_id
       LEFT JOIN receipt r ON r.tool_id = t.tool_id
       LEFT JOIN feedback_sys fs ON fs.receipt_id = r.receipt_id AND fs.status != 'hidden'
       WHERE t.tool_id = ?
       GROUP BY t.tool_id`,
      [toolId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Tool not found.' });
    }

    return res.status(200).json({ status: 'success', data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/tools
// Staff/Admin only: create a new tool listing
// ---------------------------------------------------------------------------
export async function createTool(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const { tool_name, category, description, specifications, quantity, fee, tool_condition } = req.body;
    const image_path = req.file ? `uploads/tools/${req.file.filename}` : null;
    // owner_id = the staff/admin who registers the tool on behalf of the municipality
    const owner_id = req.user.user_id;

    const [result] = await pool.query(
      `INSERT INTO tools (tool_name, category, description, specifications, quantity, fee, tool_condition, image_path, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tool_name, category, description || null, specifications || null,
       parseInt(quantity), parseFloat(fee), tool_condition || 'good', image_path, owner_id]
    );

    return res.status(201).json({
      status: 'success',
      message: 'Tool created successfully.',
      tool_id: result.insertId,
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/tools/:id
// Staff/Admin only: update tool details
// ---------------------------------------------------------------------------
export async function updateTool(req, res, next) {
  try {
    const toolId = parseInt(req.params.id, 10);
    if (isNaN(toolId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid tool ID.' });
    }

    // Fetch existing tool
    const [existing] = await pool.query('SELECT * FROM tools WHERE tool_id = ?', [toolId]);
    if (existing.length === 0) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ status: 'fail', message: 'Tool not found.' });
    }

    const tool = existing[0];
    const { tool_name, category, description, specifications, quantity, fee, tool_condition, availability_status } = req.body;

    // If a new image was uploaded, delete the old one
    let image_path = tool.image_path;
    if (req.file) {
      if (tool.image_path) {
        const oldPath = path.resolve(tool.image_path);
        if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
      }
      image_path = `uploads/tools/${req.file.filename}`;
    }

    await pool.query(
      `UPDATE tools SET
        tool_name = ?, category = ?, description = ?, specifications = ?,
        quantity = ?, fee = ?, tool_condition = ?, availability_status = ?, image_path = ?
       WHERE tool_id = ?`,
      [
        tool_name ?? tool.tool_name,
        category ?? tool.category,
        description !== undefined ? description : tool.description,
        specifications !== undefined ? specifications : tool.specifications,
        quantity !== undefined ? parseInt(quantity) : tool.quantity,
        fee !== undefined ? parseFloat(fee) : tool.fee,
        tool_condition ?? tool.tool_condition,
        availability_status ?? tool.availability_status,
        image_path,
        toolId,
      ]
    );

    return res.status(200).json({ status: 'success', message: 'Tool updated successfully.' });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/tools/:id
// Admin only: remove a tool from the catalog
// Prevents deletion if tool has active/approved rentals.
// ---------------------------------------------------------------------------
export async function deleteTool(req, res, next) {
  try {
    const toolId = parseInt(req.params.id, 10);
    if (isNaN(toolId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid tool ID.' });
    }

    const [existing] = await pool.query('SELECT * FROM tools WHERE tool_id = ?', [toolId]);
    if (existing.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Tool not found.' });
    }

    // Block deletion if there are active rentals
    const [activeRentals] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM inve_rec
       WHERE tool_id = ? AND rental_status IN ('requested', 'approved', 'active')`,
      [toolId]
    );
    if (activeRentals[0].cnt > 0) {
      return res.status(409).json({
        status: 'fail',
        message: 'Cannot delete tool with active or pending rentals.',
      });
    }

    // Delete image file if it exists
    const tool = existing[0];
    if (tool.image_path) {
      const imgPath = path.resolve(tool.image_path);
      if (fs.existsSync(imgPath)) fs.unlink(imgPath, () => {});
    }

    await pool.query('DELETE FROM tools WHERE tool_id = ?', [toolId]);

    return res.status(200).json({ status: 'success', message: 'Tool deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/tools/:id/maintenance
// Staff/Admin: list all maintenance/complaint records for a tool
// ---------------------------------------------------------------------------
export async function getToolMaintenance(req, res, next) {
  try {
    const toolId = parseInt(req.params.id, 10);
    if (isNaN(toolId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid tool ID.' });
    }

    const [rows] = await pool.query(
      `SELECT c.complaint_id, c.description, c.media_path, c.status, c.submitted_at,
              u.user_f, u.user_l, u.email
       FROM complaints c
       JOIN users u ON c.user_id = u.user_id
       JOIN receipt r ON c.receipt_id = r.receipt_id
       WHERE r.tool_id = ?
       ORDER BY c.submitted_at DESC`,
      [toolId]
    );

    return res.status(200).json({ status: 'success', data: rows });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/tools/:id/maintenance/:complaintId
// Staff/Admin: update maintenance/complaint status
// ---------------------------------------------------------------------------
export const maintenanceStatusRules = [
  body('status')
    .trim()
    .isIn(['open', 'in_review', 'resolved', 'dismissed'])
    .withMessage("Status must be one of: open, in_review, resolved, dismissed."),
];

export async function updateMaintenanceStatus(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const complaintId = parseInt(req.params.complaintId, 10);
    if (isNaN(complaintId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid complaint ID.' });
    }

    const { status } = req.body;
    const [result] = await pool.query(
      'UPDATE complaints SET status = ? WHERE complaint_id = ?',
      [status, complaintId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'fail', message: 'Complaint record not found.' });
    }

    // If resolved/dismissed, set tool back to available
    if (status === 'resolved') {
      const toolId = parseInt(req.params.id, 10);
      await pool.query(
        `UPDATE tools SET availability_status = 'available', tool_condition = 'good'
         WHERE tool_id = ? AND availability_status = 'unavailable'`,
        [toolId]
      );
    }

    return res.status(200).json({ status: 'success', message: `Complaint status updated to '${status}'.` });
  } catch (err) {
    next(err);
  }
}
