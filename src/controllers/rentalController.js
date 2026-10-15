// src/controllers/rentalController.js
// Handles the full rental lifecycle:
//   Reservations → Approval → Active rental → Return (with late/damage fees)
//   Payment portal, receipt generation, and penalty management.

import { body, validationResult } from 'express-validator';
import pool from '../config/db.js';

// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------

export const rentalRequestRules = [
  body('tool_id')
    .notEmpty().withMessage('Tool ID is required.')
    .isInt({ min: 1 }).withMessage('Tool ID must be a positive integer.'),

  body('rental_start')
    .notEmpty().withMessage('Rental start date is required.')
    .isISO8601().withMessage('Rental start must be a valid ISO 8601 date.'),

  body('due_date')
    .notEmpty().withMessage('Due date is required.')
    .isISO8601().withMessage('Due date must be a valid ISO 8601 date.')
    .custom((due, { req }) => {
      if (new Date(due) <= new Date(req.body.rental_start)) {
        throw new Error('Due date must be after the rental start date.');
      }
      return true;
    }),
];

export const returnRules = [
  body('return_condition')
    .trim()
    .notEmpty().withMessage('Return condition is required.')
    .isIn(['good', 'fair', 'poor', 'damaged'])
    .withMessage("Condition must be one of: good, fair, poor, damaged."),

  body('damage_fee')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Damage fee must be a non-negative number.'),
];

export const paymentRules = [
  body('pay_method')
    .trim()
    .notEmpty().withMessage('Payment method is required.')
    .isIn(['cash', 'gcash', 'paymaya', 'bank_transfer'])
    .withMessage("Payment method must be one of: cash, gcash, paymaya, bank_transfer."),

  body('refe_no')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('Reference number cannot exceed 50 characters.'),
];

// ---------------------------------------------------------------------------
// Helper: calculate late fee
// ₱50 per day overdue (adjust as needed)
// ---------------------------------------------------------------------------
const LATE_FEE_PER_DAY = 50;

function calcLateFee(dueDate, returnDate) {
  const due = new Date(dueDate);
  const returned = new Date(returnDate);
  if (returned <= due) return 0;
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLate = Math.ceil((returned - due) / msPerDay);
  return daysLate * LATE_FEE_PER_DAY;
}

// ---------------------------------------------------------------------------
// POST /api/rentals
// Resident: request a rental (reservation with date-conflict checking)
// ---------------------------------------------------------------------------
export async function requestRental(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const { tool_id, rental_start, due_date } = req.body;
    const user_id = req.user.user_id;

    // 1. Check that resident is verified
    if (req.user.verified_status !== 'verified') {
      return res.status(403).json({
        status: 'fail',
        message: 'Your account must be verified before renting tools.',
      });
    }

    // 2. Check for unpaid penalties
    const [penaltyRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM inve_rec WHERE user_id = ? AND penalty_status = 'unpaid'`,
      [user_id]
    );
    if (penaltyRows[0].cnt > 0) {
      return res.status(403).json({
        status: 'fail',
        message: 'You have unpaid penalties. Please settle them before making new rental requests.',
      });
    }

    // 3. Check tool exists and is available
    const [toolRows] = await pool.query(
      'SELECT * FROM tools WHERE tool_id = ?',
      [tool_id]
    );
    if (toolRows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Tool not found.' });
    }
    const tool = toolRows[0];
    if (tool.availability_status !== 'available') {
      return res.status(409).json({
        status: 'fail',
        message: `Tool is currently '${tool.availability_status}' and cannot be rented.`,
      });
    }

    // 4. Date-conflict check: look for overlapping approved/active rentals
    const [conflictRows] = await pool.query(
      `SELECT inverec_id FROM inve_rec
       WHERE tool_id = ?
         AND rental_status IN ('approved', 'active')
         AND NOT (due_date < ? OR rental_start > ?)`,
      [tool_id, rental_start, due_date]
    );
    if (conflictRows.length > 0) {
      return res.status(409).json({
        status: 'fail',
        message: 'The requested dates conflict with an existing rental. Please choose different dates.',
      });
    }

    // 5. Create rental record (status = 'requested')
    const [result] = await pool.query(
      `INSERT INTO inve_rec (user_id, tool_id, rental_start, due_date, rental_status)
       VALUES (?, ?, ?, ?, 'requested')`,
      [user_id, tool_id, rental_start, due_date]
    );

    // 6. Send notification to staff (insert into notifications)
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, ref_id)
       VALUES (?, 'rental_request', ?, ?)`,
      [
        tool.owner_id,
        `New rental request for "${tool.tool_name}" from ${req.user.user_f} ${req.user.user_l}.`,
        result.insertId,
      ]
    ).catch(() => {}); // non-fatal if notifications table doesn't exist yet

    return res.status(201).json({
      status: 'success',
      message: 'Rental request submitted. Awaiting staff approval.',
      inverec_id: result.insertId,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/rentals
// Resident: view own rentals | Staff/Admin: view all rentals
// Supports ?status= and ?user_id= filters
// ---------------------------------------------------------------------------
export async function getRentals(req, res, next) {
  try {
    const { status, user_id: filterUserId, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const isStaff = ['admin', 'staff'].includes(req.user.role);
    const effectiveUserId = isStaff ? (filterUserId || null) : req.user.user_id;

    let sql = `
      SELECT ir.*, t.tool_name, t.category, t.fee AS daily_fee, t.image_path,
             u.user_f, u.user_l, u.email, u.contact_no,
             r.receipt_id, r.pay_stat, r.pay_method, r.paid_at
      FROM inve_rec ir
      JOIN tools t ON ir.tool_id = t.tool_id
      JOIN users u ON ir.user_id = u.user_id
      LEFT JOIN receipt r ON ir.receipt_id = r.receipt_id
      WHERE 1=1
    `;
    const params = [];

    if (!isStaff) {
      sql += ' AND ir.user_id = ?';
      params.push(req.user.user_id);
    } else if (effectiveUserId) {
      sql += ' AND ir.user_id = ?';
      params.push(parseInt(effectiveUserId));
    }

    if (status) {
      sql += ' AND ir.rental_status = ?';
      params.push(status);
    }

    const [countRows] = await pool.query(
      sql.replace(/SELECT[\s\S]+?FROM/, 'SELECT COUNT(*) AS total FROM'),
      params
    );
    const total = countRows[0].total;

    sql += ' ORDER BY ir.inverec_id DESC LIMIT ? OFFSET ?';
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
// GET /api/rentals/:id
// Get a single rental record with full detail
// ---------------------------------------------------------------------------
export async function getRentalById(req, res, next) {
  try {
    const inverecId = parseInt(req.params.id, 10);
    if (isNaN(inverecId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid rental ID.' });
    }

    const [rows] = await pool.query(
      `SELECT ir.*, t.tool_name, t.category, t.fee AS daily_fee, t.image_path,
              u.user_f, u.user_l, u.email, u.contact_no,
              r.receipt_id, r.pay_stat, r.pay_method, r.refe_no, r.paid_at
       FROM inve_rec ir
       JOIN tools t ON ir.tool_id = t.tool_id
       JOIN users u ON ir.user_id = u.user_id
       LEFT JOIN receipt r ON ir.receipt_id = r.receipt_id
       WHERE ir.inverec_id = ?`,
      [inverecId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Rental record not found.' });
    }

    // Residents can only view their own records
    const rental = rows[0];
    if (req.user.role === 'resident' && rental.user_id !== req.user.user_id) {
      return res.status(403).json({ status: 'fail', message: 'Access denied.' });
    }

    return res.status(200).json({ status: 'success', data: rental });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/rentals/:id/approve
// Staff/Admin: approve a rental request → create a receipt record
// ---------------------------------------------------------------------------
export async function approveRental(req, res, next) {
  try {
    const inverecId = parseInt(req.params.id, 10);
    if (isNaN(inverecId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid rental ID.' });
    }

    const [rows] = await pool.query(
      `SELECT ir.*, t.fee, t.tool_name FROM inve_rec ir
       JOIN tools t ON ir.tool_id = t.tool_id
       WHERE ir.inverec_id = ?`,
      [inverecId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Rental record not found.' });
    }
    const rental = rows[0];
    if (rental.rental_status !== 'requested') {
      return res.status(409).json({
        status: 'fail',
        message: `Cannot approve. Rental is currently '${rental.rental_status}'.`,
      });
    }

    // Calculate total fee (days × daily rate)
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.max(1, Math.ceil(
      (new Date(rental.due_date) - new Date(rental.rental_start)) / msPerDay
    ));
    const totalFee = parseFloat(rental.fee) * days;

    // Create a receipt (pending payment)
    const [receiptResult] = await pool.query(
      `INSERT INTO receipt (user_id, tool_id, fee, pay_stat)
       VALUES (?, ?, ?, 'pending')`,
      [rental.user_id, rental.tool_id, totalFee]
    );

    // Link receipt to rental, change status to 'approved'
    await pool.query(
      `UPDATE inve_rec SET rental_status = 'approved', receipt_id = ?
       WHERE inverec_id = ?`,
      [receiptResult.insertId, inverecId]
    );

    // Mark tool as rented
    await pool.query(
      `UPDATE tools SET availability_status = 'rented' WHERE tool_id = ?`,
      [rental.tool_id]
    );

    // Notify the renter
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, ref_id)
       VALUES (?, 'rental_approved', ?, ?)`,
      [
        rental.user_id,
        `Your rental request for "${rental.tool_name}" has been approved. Please proceed to payment.`,
        inverecId,
      ]
    ).catch(() => {});

    return res.status(200).json({
      status: 'success',
      message: 'Rental approved. Receipt created and awaiting payment.',
      receipt_id: receiptResult.insertId,
      total_fee: totalFee,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/rentals/:id/decline
// Staff/Admin: decline a rental request
// ---------------------------------------------------------------------------
export async function declineRental(req, res, next) {
  try {
    const inverecId = parseInt(req.params.id, 10);
    if (isNaN(inverecId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid rental ID.' });
    }

    const [rows] = await pool.query(
      `SELECT ir.*, t.tool_name FROM inve_rec ir JOIN tools t ON ir.tool_id = t.tool_id
       WHERE ir.inverec_id = ?`,
      [inverecId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Rental record not found.' });
    }
    const rental = rows[0];
    if (rental.rental_status !== 'requested') {
      return res.status(409).json({
        status: 'fail',
        message: `Cannot decline. Rental is currently '${rental.rental_status}'.`,
      });
    }

    await pool.query(
      `UPDATE inve_rec SET rental_status = 'declined' WHERE inverec_id = ?`,
      [inverecId]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, type, message, ref_id)
       VALUES (?, 'rental_declined', ?, ?)`,
      [
        rental.user_id,
        `Your rental request for "${rental.tool_name}" was declined. Contact staff for more details.`,
        inverecId,
      ]
    ).catch(() => {});

    return res.status(200).json({ status: 'success', message: 'Rental request declined.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/rentals/:id/cancel
// Resident: cancel their own 'requested' rental before approval
// ---------------------------------------------------------------------------
export async function cancelRental(req, res, next) {
  try {
    const inverecId = parseInt(req.params.id, 10);
    if (isNaN(inverecId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid rental ID.' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM inve_rec WHERE inverec_id = ?',
      [inverecId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Rental record not found.' });
    }
    const rental = rows[0];

    if (rental.user_id !== req.user.user_id) {
      return res.status(403).json({ status: 'fail', message: 'You can only cancel your own rentals.' });
    }
    if (rental.rental_status !== 'requested') {
      return res.status(409).json({
        status: 'fail',
        message: `Cannot cancel. Rental is currently '${rental.rental_status}'.`,
      });
    }

    await pool.query(
      `UPDATE inve_rec SET rental_status = 'cancelled' WHERE inverec_id = ?`,
      [inverecId]
    );

    return res.status(200).json({ status: 'success', message: 'Rental cancelled successfully.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/rentals/:id/activate
// Staff/Admin: mark rental as active after payment is confirmed
// ---------------------------------------------------------------------------
export async function activateRental(req, res, next) {
  try {
    const inverecId = parseInt(req.params.id, 10);
    if (isNaN(inverecId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid rental ID.' });
    }

    const [rows] = await pool.query(
      `SELECT ir.*, r.pay_stat FROM inve_rec ir
       LEFT JOIN receipt r ON ir.receipt_id = r.receipt_id
       WHERE ir.inverec_id = ?`,
      [inverecId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Rental record not found.' });
    }
    const rental = rows[0];

    if (rental.rental_status !== 'approved') {
      return res.status(409).json({
        status: 'fail',
        message: `Cannot activate. Rental is currently '${rental.rental_status}'.`,
      });
    }
    if (rental.pay_stat !== 'paid') {
      return res.status(409).json({
        status: 'fail',
        message: 'Cannot activate rental until payment is confirmed.',
      });
    }

    await pool.query(
      `UPDATE inve_rec SET rental_status = 'active' WHERE inverec_id = ?`,
      [inverecId]
    );

    return res.status(200).json({ status: 'success', message: 'Rental is now active.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/rentals/:id/return
// Staff/Admin: process a tool return with condition logging + late/damage fees
// ---------------------------------------------------------------------------
export async function processReturn(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const inverecId = parseInt(req.params.id, 10);
    if (isNaN(inverecId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid rental ID.' });
    }

    const [rows] = await pool.query(
      `SELECT ir.*, t.tool_name FROM inve_rec ir
       JOIN tools t ON ir.tool_id = t.tool_id
       WHERE ir.inverec_id = ?`,
      [inverecId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Rental record not found.' });
    }
    const rental = rows[0];
    if (rental.rental_status !== 'active') {
      return res.status(409).json({
        status: 'fail',
        message: `Cannot process return. Rental is currently '${rental.rental_status}'.`,
      });
    }

    const { return_condition, damage_fee = 0 } = req.body;
    const returnNow = new Date();
    const lateFee = calcLateFee(rental.due_date, returnNow);
    const totalPenalty = lateFee + parseFloat(damage_fee);
    const penaltyStatus = totalPenalty > 0 ? 'unpaid' : 'none';

    await pool.query(
      `UPDATE inve_rec SET
         rental_status = 'returned',
         actual_return_date = ?,
         return_condition = ?,
         penalty_amount = ?,
         penalty_status = ?
       WHERE inverec_id = ?`,
      [returnNow, return_condition, totalPenalty, penaltyStatus, inverecId]
    );

    // Update tool condition and availability
    const newCondition = return_condition === 'damaged' ? 'poor' : return_condition;
    const newAvailability = return_condition === 'damaged' ? 'unavailable' : 'available';
    await pool.query(
      `UPDATE tools SET availability_status = ?, tool_condition = ? WHERE tool_id = ?`,
      [newAvailability, newCondition, rental.tool_id]
    );

    // Notify renter of penalty if any
    if (totalPenalty > 0) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, message, ref_id)
         VALUES (?, 'penalty_issued', ?, ?)`,
        [
          rental.user_id,
          `A penalty of ₱${totalPenalty.toFixed(2)} has been applied to your rental of "${rental.tool_name}". ` +
          `(Late fee: ₱${lateFee.toFixed(2)}, Damage fee: ₱${parseFloat(damage_fee).toFixed(2)})`,
          inverecId,
        ]
      ).catch(() => {});
    }

    return res.status(200).json({
      status: 'success',
      message: 'Return processed successfully.',
      return_condition,
      late_fee: lateFee,
      damage_fee: parseFloat(damage_fee),
      total_penalty: totalPenalty,
      penalty_status: penaltyStatus,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/rentals/:id/pay
// Staff/Admin: record payment for a rental receipt (payment portal)
// ---------------------------------------------------------------------------
export async function recordPayment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const inverecId = parseInt(req.params.id, 10);
    if (isNaN(inverecId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid rental ID.' });
    }

    const [rows] = await pool.query(
      `SELECT ir.*, r.receipt_id, r.pay_stat, r.fee, t.tool_name
       FROM inve_rec ir
       JOIN receipt r ON ir.receipt_id = r.receipt_id
       JOIN tools t ON ir.tool_id = t.tool_id
       WHERE ir.inverec_id = ?`,
      [inverecId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Rental or receipt not found.' });
    }
    const rental = rows[0];

    if (rental.pay_stat === 'paid') {
      return res.status(409).json({ status: 'fail', message: 'Payment has already been recorded.' });
    }

    const { pay_method, refe_no } = req.body;

    await pool.query(
      `UPDATE receipt SET pay_stat = 'paid', pay_method = ?, refe_no = ?, paid_at = NOW()
       WHERE receipt_id = ?`,
      [pay_method, refe_no || null, rental.receipt_id]
    );

    await pool.query(
      `INSERT INTO notifications (user_id, type, message, ref_id)
       VALUES (?, 'payment_confirmed', ?, ?)`,
      [
        rental.user_id,
        `Payment of ₱${parseFloat(rental.fee).toFixed(2)} confirmed for "${rental.tool_name}". Method: ${pay_method}.`,
        rental.receipt_id,
      ]
    ).catch(() => {});

    return res.status(200).json({
      status: 'success',
      message: 'Payment recorded successfully.',
      receipt_id: rental.receipt_id,
      amount: rental.fee,
      pay_method,
      refe_no: refe_no || null,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/rentals/:id/receipt
// Resident/Staff: get a printable receipt for a rental
// ---------------------------------------------------------------------------
export async function getReceipt(req, res, next) {
  try {
    const inverecId = parseInt(req.params.id, 10);
    if (isNaN(inverecId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid rental ID.' });
    }

    const [rows] = await pool.query(
      `SELECT ir.inverec_id, ir.rental_start, ir.due_date, ir.actual_return_date,
              ir.rental_status, ir.return_condition, ir.penalty_amount, ir.penalty_status,
              r.receipt_id, r.fee AS rental_fee, r.pay_stat, r.pay_method, r.refe_no, r.paid_at,
              t.tool_name, t.category, t.fee AS daily_fee,
              u.user_f, u.user_l, u.email, u.contact_no, u.brgy
       FROM inve_rec ir
       JOIN receipt r ON ir.receipt_id = r.receipt_id
       JOIN tools t ON ir.tool_id = t.tool_id
       JOIN users u ON ir.user_id = u.user_id
       WHERE ir.inverec_id = ?`,
      [inverecId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Receipt not found.' });
    }

    const receipt = rows[0];
    if (req.user.role === 'resident' && receipt.user_f !== req.user.user_f) {
      // extra guard: re-check by user_id
      const [ownerCheck] = await pool.query(
        'SELECT user_id FROM inve_rec WHERE inverec_id = ?', [inverecId]
      );
      if (ownerCheck.length === 0 || ownerCheck[0].user_id !== req.user.user_id) {
        return res.status(403).json({ status: 'fail', message: 'Access denied.' });
      }
    }

    return res.status(200).json({ status: 'success', receipt });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/rentals/:id/penalty/settle
// Staff/Admin: mark a penalty as paid or waived
// ---------------------------------------------------------------------------
export const penaltySettleRules = [
  body('penalty_status')
    .trim()
    .isIn(['paid', 'waived'])
    .withMessage("Penalty status must be 'paid' or 'waived'."),
];

export async function settlePenalty(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'fail', message: 'Validation failed.', errors: errors.array() });
    }

    const inverecId = parseInt(req.params.id, 10);
    if (isNaN(inverecId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid rental ID.' });
    }

    const { penalty_status } = req.body;

    const [result] = await pool.query(
      `UPDATE inve_rec SET penalty_status = ?
       WHERE inverec_id = ? AND penalty_status = 'unpaid'`,
      [penalty_status, inverecId]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        status: 'fail',
        message: 'No unpaid penalty found for this rental.',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: `Penalty marked as '${penalty_status}'.`,
    });
  } catch (err) {
    next(err);
  }
}
