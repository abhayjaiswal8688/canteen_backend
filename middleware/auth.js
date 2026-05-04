// middleware/auth.js
const jwt = require("jsonwebtoken");

/**
 * esp32Auth — validates the X-API-Key header sent by the ESP32.
 * The ESP32 hardcodes ESP32_API_KEY in its sketch (config.h).
 */
const esp32Auth = (req, res, next) => {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.ESP32_API_KEY) {
    return res.status(401).json({ success: false, error: "Unauthorized: invalid API key" });
  }
  next();
};

/**
 * adminAuth — verifies a JWT signed with ADMIN_JWT_SECRET.
 * Issued by POST /api/auth/admin/login.
 */
const adminAuth = (req, res, next) => {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized: no token" });
  }
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({ success: false, error: "Forbidden: admins only" });
    }
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Unauthorized: invalid or expired token" });
  }
};

/**
 * studentAuth — verifies a JWT signed with STUDENT_JWT_SECRET.
 * Issued by POST /api/auth/student/login.
 * Attaches req.student = { id, rollNo, uid }
 */
const studentAuth = (req, res, next) => {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized: no token" });
  }
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.STUDENT_JWT_SECRET);
    if (payload.role !== "student") {
      return res.status(403).json({ success: false, error: "Forbidden: students only" });
    }
    req.student = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Unauthorized: invalid or expired token" });
  }
};

module.exports = { esp32Auth, adminAuth, studentAuth };
