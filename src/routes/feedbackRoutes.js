// src/routes/feedbackRoutes.js
// Endpoints for community ratings/reviews, defective tool complaints,
// resident info-update requests, and user notifications.

import { Router } from 'express';
import {
  submitReview,
  getReviews,
  moderateReview,
  fileComplaint,
  getComplaints,
  requestInfoUpdate,
  getInfoUpdateRequests,
  resolveInfoUpdate,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  reviewRules,
  moderateReviewRules,
  complaintRules,
  infoUpdateRules,
  resolveInfoUpdateRules,
} from '../controllers/feedbackController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';
import { uploadComplaintMedia } from '../middleware/uploadMiddleware.js';

const router = Router();

// ===========================================================================
// REVIEWS & RATINGS
// ===========================================================================

// GET /api/feedback/reviews - Public view of tool ratings and community reviews
router.get('/reviews', getReviews);

// POST /api/feedback/reviews - Authenticated resident submits rating for completed rental
router.post('/reviews', authenticate, reviewRules, submitReview);

// PATCH /api/feedback/reviews/:id/moderate - Staff/Admin hides or approves review
router.patch(
  '/reviews/:id/moderate',
  authenticate,
  requireRole('admin', 'staff'),
  moderateReviewRules,
  moderateReview
);

// ===========================================================================
// COMPLAINTS (Defective Tools / Issues)
// ===========================================================================

// POST /api/feedback/complaints - Resident reports tool defect with photo/evidence
router.post(
  '/complaints',
  authenticate,
  uploadComplaintMedia.single('media'),
  complaintRules,
  fileComplaint
);

// GET /api/feedback/complaints - Staff/Admin reviews incoming complaints
router.get(
  '/complaints',
  authenticate,
  requireRole('admin', 'staff'),
  getComplaints
);

// ===========================================================================
// RESIDENT INFO-UPDATE REQUESTS
// ===========================================================================

// POST /api/feedback/info-update - Resident submits request to correct personal info
router.post('/info-update', authenticate, infoUpdateRules, requestInfoUpdate);

// GET /api/feedback/info-update - Staff/Admin lists pending info correction requests
router.get(
  '/info-update',
  authenticate,
  requireRole('admin', 'staff'),
  getInfoUpdateRequests
);

// PATCH /api/feedback/info-update/:id/resolve - Staff approves or rejects info update
router.patch(
  '/info-update/:id/resolve',
  authenticate,
  requireRole('admin', 'staff'),
  resolveInfoUpdateRules,
  resolveInfoUpdate
);

// ===========================================================================
// NOTIFICATIONS
// ===========================================================================

// GET /api/feedback/notifications - View user notifications (unread / all)
router.get('/notifications', authenticate, getNotifications);

// PATCH /api/feedback/notifications/:id/read - Mark single notification as read
router.patch('/notifications/:id/read', authenticate, markNotificationRead);

// PATCH /api/feedback/notifications/read-all - Mark all user notifications as read
router.patch('/notifications/read-all', authenticate, markAllNotificationsRead);

export default router;
