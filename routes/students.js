// routes/students.js  —  admin dashboard CRUD + student self-service
const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const Transaction = require("../models/Transaction");
const { adminAuth, studentAuth } = require("../middleware/auth");

//═══════════════════════════════════════════════════════════════════════════════
// STUDENT SELF-SERVICE ROUTES  (require studentAuth JWT)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/students/me/profile
 * Student sees their own profile and balance.
 */
router.get("/me/profile", studentAuth, async (req, res) => {
  try {
    const student = await Student.findById(req.student.id);
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });
    return res.json({
      success: true,
      student: { ...student.toJSON(), balanceStatus: student.balanceStatus },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * GET /api/students/me/transactions
 * Student sees their own transaction history.
 * Query: limit?, page?
 */
router.get("/me/transactions", studentAuth, async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find({ uid: req.student.uid })
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(skip),
      Transaction.countDocuments({ uid: req.student.uid }),
    ]);

    return res.json({
      success: true,
      transactions,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * POST /api/students/me/topup-request
 * Student submits a top-up request for admin to approve.
 * Body: { amount, note? }
 */
router.post("/me/topup-request", studentAuth, async (req, res) => {
  const { amount, note = "Top-up request" } = req.body;

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ success: false, error: "amount must be a positive number" });
  }
  if (amount > 5000) {
    return res.status(400).json({ success: false, error: "Maximum top-up request is ₹5000" });
  }

  try {
    const student = await Student.findById(req.student.id);
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });

    // Limit pending requests to 3
    const pendingCount = student.topupRequests.filter((r) => r.status === "pending").length;
    if (pendingCount >= 3) {
      return res.status(429).json({
        success: false,
        error: "You already have 3 pending requests. Wait for admin to resolve them.",
      });
    }

    student.topupRequests.push({ amount, note });
    await student.save();

    return res.status(201).json({ success: true, message: "Top-up request submitted. Admin will review it." });
  } catch (err) {
    console.error("POST /api/students/me/topup-request error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * GET /api/students/me/topup-requests
 * Student sees their own top-up request history.
 */
router.get("/me/topup-requests", studentAuth, async (req, res) => {
  try {
    const student = await Student.findById(req.student.id, { topupRequests: 1 });
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });
    return res.json({
      success: true,
      requests: student.topupRequests.sort((a, b) => b.requestedAt - a.requestedAt),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES  (require adminAuth)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/students
 * Returns all students with balance status.
 */
router.get("/", adminAuth, async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { rollNo: { $regex: search, $options: "i" } },
        { uid: { $regex: search, $options: "i" } },
      ];
    }
    if (status) filter.status = status;

    const students = await Student.find(filter).sort({ name: 1 });

    const counts = await Transaction.aggregate([
      { $group: { _id: "$uid", count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));

    const result = students.map((s) => ({
      ...s.toJSON(),
      balanceStatus: s.balanceStatus,
      transactionCount: countMap[s.uid] || 0,
    }));

    return res.json({ success: true, students: result });
  } catch (err) {
    console.error("GET /api/students error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * POST /api/students
 * Register a new student and issue wallet.
 * Body: { name, rollNo, uid, pin, password, initialDeposit? }
 */
router.post("/", adminAuth, async (req, res) => {
  const { name, rollNo, uid, pin, password, initialDeposit = 0 } = req.body;

  if (!name || !rollNo || !uid || !pin || !password) {
    return res.status(400).json({
      success: false,
      error: "name, rollNo, uid, pin, and password are required",
    });
  }
  if (String(pin).length !== 4 || isNaN(Number(pin))) {
    return res.status(400).json({ success: false, error: "PIN must be exactly 4 digits" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
  }

  try {
    const student = new Student({
      name: name.trim(),
      rollNo: rollNo.trim().toUpperCase(),
      uid: uid.trim().toUpperCase(),
      pinHash: String(pin),         // pre-save hook hashes
      passwordHash: String(password), // pre-save hook hashes
      balance: Number(initialDeposit),
    });
    await student.save();

    if (initialDeposit > 0) {
      await Transaction.create({
        uid: student.uid,
        studentId: student._id,
        studentName: student.name,
        type: "credit",
        amount: Number(initialDeposit),
        item: "Initial deposit",
        status: "success",
        balanceBefore: 0,
        balanceAfter: Number(initialDeposit),
        source: "dashboard",
      });
    }

    return res.status(201).json({ success: true, student: student.toJSON() });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ success: false, error: `${field} already exists` });
    }
    console.error("POST /api/students error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * GET /api/students/:uid
 * Fetch a single student by RFID UID.
 */
router.get("/:uid", adminAuth, async (req, res) => {
  try {
    const student = await Student.findOne({ uid: req.params.uid.toUpperCase() });
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });
    return res.json({
      success: true,
      student: { ...student.toJSON(), balanceStatus: student.balanceStatus },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * POST /api/students/:uid/topup
 * Add funds to a student wallet.
 * Body: { amount, note? }
 */
router.post("/:uid/topup", adminAuth, async (req, res) => {
  const { amount, note = "Admin top-up" } = req.body;

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ success: false, error: "amount must be a positive number" });
  }

  try {
    const before = await Student.findOne({ uid: req.params.uid.toUpperCase() });
    if (!before) return res.status(404).json({ success: false, error: "Student not found" });

    const student = await Student.findOneAndUpdate(
      { uid: req.params.uid.toUpperCase() },
      { $inc: { balance: amount } },
      { new: true }
    );

    await Transaction.create({
      uid: student.uid,
      studentId: student._id,
      studentName: student.name,
      type: "credit",
      amount,
      item: note,
      status: "success",
      balanceBefore: before.balance,
      balanceAfter: student.balance,
      source: "dashboard",
    });

    return res.json({ success: true, balance: student.balance, name: student.name });
  } catch (err) {
    console.error("POST /api/students/topup error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * GET /api/students/:uid/topup-requests
 * Admin sees all pending top-up requests for a student.
 */
router.get("/:uid/topup-requests", adminAuth, async (req, res) => {
  try {
    const student = await Student.findOne({ uid: req.params.uid.toUpperCase() });
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });
    return res.json({ success: true, requests: student.topupRequests });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * GET /api/students/topup-requests/pending
 * Admin sees ALL pending top-up requests across all students.
 */
router.get("/topup-requests/pending", adminAuth, async (req, res) => {
  try {
    const students = await Student.find(
      { "topupRequests.status": "pending" },
      { name: 1, rollNo: 1, uid: 1, balance: 1, topupRequests: 1 }
    );
    const pending = [];
    students.forEach((s) => {
      s.topupRequests
        .filter((r) => r.status === "pending")
        .forEach((r) => pending.push({ ...r.toObject(), student: s.toJSON() }));
    });
    return res.json({ success: true, requests: pending });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * PATCH /api/students/:uid/topup-requests/:requestId
 * Admin approves or rejects a student top-up request.
 * Body: { action: "approve" | "reject" }
 */
router.patch("/:uid/topup-requests/:requestId", adminAuth, async (req, res) => {
  const { action } = req.body;
  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ success: false, error: "action must be 'approve' or 'reject'" });
  }

  try {
    const student = await Student.findOne({ uid: req.params.uid.toUpperCase() });
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });

    const request = student.topupRequests.id(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, error: "Request not found" });
    if (request.status !== "pending") {
      return res.status(409).json({ success: false, error: "Request already resolved" });
    }

    request.status = action === "approve" ? "approved" : "rejected";
    request.resolvedAt = new Date();

    if (action === "approve") {
      student.balance += request.amount;
      await Transaction.create({
        uid: student.uid,
        studentId: student._id,
        studentName: student.name,
        type: "credit",
        amount: request.amount,
        item: request.note || "Student top-up request",
        status: "success",
        balanceBefore: student.balance - request.amount,
        balanceAfter: student.balance,
        source: "dashboard",
      });
    }

    await student.save();
    return res.json({ success: true, message: `Request ${action}d` });
  } catch (err) {
    console.error("PATCH topup-request error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * PATCH /api/students/:uid
 * Update student name, status, reset PIN or password.
 * Body: { name?, status?, pin?, password? }
 */
router.patch("/:uid", adminAuth, async (req, res) => {
  const { name, status, pin, password } = req.body;
  try {
    const student = await Student.findOne({ uid: req.params.uid.toUpperCase() });
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });

    if (name) student.name = name.trim();
    if (status) student.status = status;
    if (pin) {
      if (String(pin).length !== 4) {
        return res.status(400).json({ success: false, error: "PIN must be 4 digits" });
      }
      student.pinHash = String(pin); // pre-save hook re-hashes
    }
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
      }
      student.passwordHash = String(password); // pre-save hook hashes
    }
    await student.save();

    return res.json({ success: true, student: student.toJSON() });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * DELETE /api/students/:uid
 * Suspend (soft-delete) a student account.
 */
router.delete("/:uid", adminAuth, async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { uid: req.params.uid.toUpperCase() },
      { status: "suspended" },
      { new: true }
    );
    if (!student) return res.status(404).json({ success: false, error: "Student not found" });
    return res.json({ success: true, message: "Account suspended" });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});



module.exports = router;
