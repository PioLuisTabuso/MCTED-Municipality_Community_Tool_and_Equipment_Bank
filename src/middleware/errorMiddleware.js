// src/middleware/errorMiddleware.js
// Central error handling middleware.
// Catches unhandled errors, cleans up failed file uploads, and prevents sensitive details (stack traces, SQL syntax) from leaking to clients.

import fs from 'fs';
import multer from 'multer';

export function errorHandler(err, req, res, next) {
  // If an uploaded file exists when an error occurs, clean it up to prevent orphaned files
  if (req.file && req.file.path) {
    fs.unlink(req.file.path, (unlinkErr) => {
      if (unlinkErr) {
        console.error('[Cleanup Error] Failed to delete file on error:', unlinkErr.message);
      }
    });
  }

  // Handle Multer file upload errors gracefully
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: 'fail',
        message: 'File size exceeds the 2 MB limit.',
      });
    }
    return res.status(400).json({
      status: 'fail',
      message: err.message,
    });
  }

  // Handle custom upload validation errors (e.g. invalid file type from fileFilter)
  if (err.message && err.message.includes('Only JPG and PNG images')) {
    return res.status(400).json({
      status: 'fail',
      message: err.message,
    });
  }

  // Determine status code: default to 500 for unexpected errors
  const statusCode = err.status || err.statusCode || 500;

  // Log full error internally for debugging
  console.error('[Server Error]', err);

  // Return clean JSON response without leaking stack traces or internal SQL queries
  if (statusCode >= 500) {
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error. Please try again later.',
    });
  }

  return res.status(statusCode).json({
    status: 'fail',
    message: err.message || 'Request failed.',
  });
}
