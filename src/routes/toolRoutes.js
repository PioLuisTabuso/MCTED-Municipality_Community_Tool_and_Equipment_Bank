// src/routes/toolRoutes.js
// REST endpoints for tool catalog, search, inventory, photos, and maintenance.

import { Router } from 'express';
import {
  getTools,
  getCategories,
  getToolById,
  createTool,
  updateTool,
  deleteTool,
  getToolMaintenance,
  updateMaintenanceStatus,
  toolValidationRules,
  maintenanceStatusRules,
} from '../controllers/toolController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';
import { uploadToolImage } from '../middleware/uploadMiddleware.js';

const router = Router();

// --- Public Endpoints ---
// GET /api/tools - Browse tools (search, category filter, availability status, pagination)
router.get('/', getTools);

// GET /api/tools/categories - Distinct categories list with counts
router.get('/categories', getCategories);

// GET /api/tools/:id - Detailed tool profile with ratings and availability
router.get('/:id', getToolById);

// --- Staff / Admin Protected Endpoints ---
// POST /api/tools - Register new tool with optional photo upload
router.post(
  '/',
  authenticate,
  requireRole('admin', 'staff'),
  uploadToolImage.single('image'),
  toolValidationRules,
  createTool
);

// PUT /api/tools/:id - Update existing tool specification, fee, stock, condition
router.put(
  '/:id',
  authenticate,
  requireRole('admin', 'staff'),
  uploadToolImage.single('image'),
  toolValidationRules,
  updateTool
);

// DELETE /api/tools/:id - Remove or archive tool from active inventory
router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  deleteTool
);

// GET /api/tools/:id/maintenance - View maintenance history and active complaints for a tool
router.get(
  '/:id/maintenance',
  authenticate,
  requireRole('admin', 'staff'),
  getToolMaintenance
);

// PATCH /api/tools/:id/maintenance - Update tool condition/maintenance state
router.patch(
  '/:id/maintenance',
  authenticate,
  requireRole('admin', 'staff'),
  maintenanceStatusRules,
  updateMaintenanceStatus
);

export default router;
