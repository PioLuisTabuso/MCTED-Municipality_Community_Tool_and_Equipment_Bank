// src/middleware/errorMiddleware.js
// Global error handler – must be the LAST middleware added in app.js.
// Express recognises a 4-argument middleware as an error handler.

export function errorHandler(err, req, res, next) {
  // Log the full error in development; only send a safe message to the client.
  console.error('[Error]', err.message);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status:  'error',
    message: err.message || 'Internal Server Error',
  });
}
