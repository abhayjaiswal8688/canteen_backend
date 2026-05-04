// routes/auth.js  —  login/signup for both admin and student portals
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Student = require("../models/Student");

// ─── ADMIN LOGIN ─────────────────────────────────────────────────────────────
/**
 * POST /api/auth/admin/login
 * Body: { username, password }
 * Checks against ADMIN_USERNAME + ADMIN_PASSWORD_HASH env vars.
 * Returns a signed JWT valid for 8 hours.
 */
router.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: "username and password are required" });
  }

  // Compare against env — no DB needed for single admin
  const usernameOk = username === process.env.ADMIN_USERNAME;
  const passwordOk = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);

  if (!usernameOk || !passwordOk) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { role: "admin", username },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "8h" }
  );

  return res.json({
    success: true,
    token,
    expiresIn: 8 * 60 * 60, // seconds
    role: "admin",
  });
});

// ─── STUDENT LOGIN ────────────────────────────────────────────────────────────
/**
 * POST /api/auth/student/login
 * Body: { rollNo, password }
 * Returns a signed JWT valid for 24 hours.
 */
router.post("/student/login", async (req, res) => {
  const { rollNo, password } = req.body;

  if (!rollNo || !password) {
    return res.status(400).json({ success: false, error: "rollNo and password are required" });
  }

  try {
    const student = await Student.findOne({ rollNo: rollNo.toUpperCase() });
    if (!student) {
      return res.status(401).json({ success: false, error: "Invalid roll number or password" });
    }
    if (student.status === "suspended") {
      return res.status(403).json({ success: false, error: "Account suspended. Contact admin." });
    }

    const passwordOk = await student.verifyPassword(password);
    if (!passwordOk) {
      return res.status(401).json({ success: false, error: "Invalid roll number or password" });
    }

    const token = jwt.sign(
      { role: "student", id: student._id, rollNo: student.rollNo, uid: student.uid },
      process.env.STUDENT_JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({
      success: true,
      token,
      expiresIn: 24 * 60 * 60,
      role: "student",
      student: student.toJSON(),
    });
  } catch (err) {
    console.error("POST /api/auth/student/login error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// ─── STUDENT CHANGE PASSWORD ──────────────────────────────────────────────────
/**
 * POST /api/auth/student/change-password
 * Body: { rollNo, currentPassword, newPassword }
 * Students can change their own portal password.
 */
router.post("/student/change-password", async (req, res) => {
  const { rollNo, currentPassword, newPassword } = req.body;

  if (!rollNo || !currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: "rollNo, currentPassword, and newPassword are required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: "New password must be at least 6 characters" });
  }

  try {
    const student = await Student.findOne({ rollNo: rollNo.toUpperCase() });
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });

    const ok = await student.verifyPassword(currentPassword);
    if (!ok) return res.status(401).json({ success: false, error: "Current password is wrong" });

    student.passwordHash = newPassword; // pre-save hook will hash it
    await student.save();

    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("POST /api/auth/student/change-password error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
