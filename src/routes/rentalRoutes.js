// src/routes/rentalRoutes.js
// Handles the complete municipal tool rental lifecycle:
// Reservation -> Staff Approval/Decline -> Payment -> Pick-up (Active) -> Return/Inspection -> Penalties & Receipts.

import { Router } from 'express';
import {
  requestRental,
  getRentals,
  getRentalById,
  approveRental,
  declineRental,
  cancelRental,
  activateRental,
  processReturn,
  recordPayment,
  getReceipt,
  settlePenalty,
  rentalRequestRules,
  returnRules,
  paymentRules,
  penaltySettleRules,
} from '../controllers/rentalController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

// All rental endpoints require authenticated session
router.use(authenticate);

// POST /api/rentals - Resident creates reservation request
router.post('/', rentalRequestRules, requestRental);

// GET /api/rentals - List rentals (residents see their own; staff/admin see all with filters)
router.get('/', getRentals);

// GET /api/rentals/:id - View details of specific rental
router.get('/:id', getRentalById);

// PATCH /api/rentals/:id/approve - Staff approves request & creates provisional receipt
router.patch('/:id/approve', requireRole('admin', 'staff'), approveRental);

// PATCH /api/rentals/:id/decline - Staff declines request
router.patch('/:id/decline', requireRole('admin', 'staff'), declineRental);

// PATCH /api/rentals/:id/cancel - Resident cancels their pending request
router.patch('/:id/cancel', cancelRental);

// PATCH /api/rentals/:id/activate - Staff marks rental as released/active (physical handover)
router.patch('/:id/activate', requireRole('admin', 'staff'), activateRental);

// POST /api/rentals/:id/return - Staff inspects returned tool, calculates late/damage penalties
router.post('/:id/return', requireRole('admin', 'staff'), returnRules, processReturn);

// POST /api/rentals/:id/payment - Process payment simulation / payment confirmation
router.post('/:id/payment', paymentRules, recordPayment);

// GET /api/rentals/:id/receipt - Retrieve digital receipt and payment breakdown
router.get('/:id/receipt', getReceipt);

// PATCH /api/rentals/:id/penalty - Staff settles or waives late/damage penalty
router.patch('/:id/penalty', requireRole('admin', 'staff'), penaltySettleRules, settlePenalty);

export default router;
