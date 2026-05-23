const { admin } = require('../firebase-admin');

/**
 * Verifies the Firebase ID token from the Authorization header.
 * Attaches `req.user` = { uid, email, admin (bool) }.
 */
async function verifyAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      admin: decoded.admin === true,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Requires admin custom claim. Use AFTER verifyAuth. */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.admin) {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
}

module.exports = { verifyAuth, requireAdmin };
