// src/routes/adminRoutes.js
// Administrative routes for ID verification and user management.
// All endpoints in this file are restricted to users with 'admin' or 'staff' roles.

import { Router } from 'express';
import {
  getPendingUsers,
  getUserIdImage,
  updateVerificationStatus,
  verificationValidationRules,
} from '../controllers/adminController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

// Apply authentication and role check to all admin routes
router.use(authenticate, requireRole('admin', 'staff'));

// GET /api/admin/users/pending - List users awaiting verification
router.get('/users/pending', getPendingUsers);

// GET /api/admin/users/:id/id-image - Securely stream ID photo
router.get('/users/:id/id-image', getUserIdImage);

// PATCH /api/admin/users/:id/verification - Approve or reject user verification
router.patch(
  '/users/:id/verification',
  verificationValidationRules,
  updateVerificationStatus
);

export default router;
