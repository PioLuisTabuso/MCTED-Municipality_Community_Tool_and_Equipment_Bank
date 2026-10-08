// src/middleware/authMiddleware.js
// Placeholder – JWT verification middleware.
// This will check the Authorization header and attach the decoded user to req.user.

// TODO:
// import jwt from 'jsonwebtoken';
// export function verifyToken(req, res, next) {
//   const token = req.headers.authorization?.split(' ')[1];
//   if (!token) return res.status(401).json({ error: 'No token provided' });
//   try {
//     req.user = jwt.verify(token, process.env.JWT_SECRET);
//     next();
//   } catch (err) {
//     return res.status(403).json({ error: 'Invalid token' });
//   }
// }
