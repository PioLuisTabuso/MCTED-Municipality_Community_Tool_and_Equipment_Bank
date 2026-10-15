// src/middleware/uploadMiddleware.js
// Configures Multer for handling secure user ID photo uploads.
// ID images are restricted to JPEG/PNG, max 2 MB, and stored with random filenames.

import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// Ensure the target upload directory exists
const ID_UPLOAD_DIR = path.resolve('uploads/ids');
if (!fs.existsSync(ID_UPLOAD_DIR)) {
  fs.mkdirSync(ID_UPLOAD_DIR, { recursive: true });
}

// Storage strategy: disk storage with randomized names to prevent collisions or name-based attacks
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ID_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate a random 16-byte hex string + original extension
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${randomName}${ext}`);
  },
});

// File filter: accept only image/jpeg and image/png files
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG and PNG images are allowed for ID upload.'));
  }
};

// 2 MB max file size
export const uploadIdImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 Megabytes
  },
});

// Tool photo uploads
const TOOL_UPLOAD_DIR = path.resolve('uploads/tools');
if (!fs.existsSync(TOOL_UPLOAD_DIR)) {
  fs.mkdirSync(TOOL_UPLOAD_DIR, { recursive: true });
}

const toolStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TOOL_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${randomName}${ext}`);
  },
});

export const uploadToolImage = multer({
  storage: toolStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// Complaint photo uploads
const COMPLAINT_UPLOAD_DIR = path.resolve('uploads/complaints');
if (!fs.existsSync(COMPLAINT_UPLOAD_DIR)) {
  fs.mkdirSync(COMPLAINT_UPLOAD_DIR, { recursive: true });
}

const complaintStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, COMPLAINT_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${randomName}${ext}`);
  },
});

export const uploadComplaintMedia = multer({
  storage: complaintStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

