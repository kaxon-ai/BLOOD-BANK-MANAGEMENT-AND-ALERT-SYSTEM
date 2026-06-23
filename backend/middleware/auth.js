const jwt = require("jsonwebtoken");

/**
 * Verifies the Bearer JWT on every protected route.
 * Attaches the decoded user payload to req.user.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;   // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalid or expired." });
  }
}

/**
 * Allows only users with the ADMIN role.
 * Must be chained after requireAuth.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
