// src/routes/authRoutes.js
// Defines routing endpoints for user authentication and authorization.

import { Router } from 'express';
import {
  register,
  login,
  getProfile,
  registerValidationRules,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { uploadIdImage } from '../middleware/uploadMiddleware.js';

const router = Router();

// POST /api/auth/register (multipart/form-data with ID image upload)
router.post(
  '/register',
  uploadIdImage.single('id_image'),
  registerValidationRules,
  register
);

// POST /api/auth/login (JSON: email and password)
router.post('/login', login);

// GET /api/auth/me (Protected: returns profile of authenticated user)
router.get('/me', authenticate, getProfile);

export default router;
