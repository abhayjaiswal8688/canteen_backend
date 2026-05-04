// routes/pay.js  —  called by the ESP32 hardware terminal
const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const Transaction = require("../models/Transaction");
const { esp32Auth } = require("../middleware/auth");

/**
 * POST /api/pay
 * Body: { uid, pin, amount, item? }
 * Auth: X-API-Key header (ESP32 API key)
 *
 * Flow:
 *  1. Find student by RFID UID
 *  2. Verify PIN
 *  3. Check balance >= amount
 *  4. Deduct atomically using findOneAndUpdate
 *  5. Log transaction
 *  6. Return new balance
 */
router.post("/", esp32Auth, async (req, res) => {
  const { uid, pin, amount, item = "Canteen purchase" } = req.body;

  if (!uid || !pin || !amount) {
    return res.status(400).json({ success: false, error: "uid, pin, and amount are required" });
  }
  if (typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ success: false, error: "amount must be a positive number" });
  }

  let student;
  try {
    // ── Find student ──────────────────────────────────────────────────────────
    student = await Student.findOne({ uid: uid.toUpperCase(), status: "active" });
    if (!student) {
      await Transaction.create({
        uid, type: "debit", amount, item, status: "failed",
        failReason: "student_not_found", source: "esp32",
      });
      return res.status(404).json({ success: false, error: "Card not recognised" });
    }

    // ── Verify PIN ────────────────────────────────────────────────────────────
    const pinOk = await student.verifyPin(String(pin));
    if (!pinOk) {
      await Transaction.create({
        uid, studentId: student._id, studentName: student.name,
        type: "debit", amount, item, status: "failed",
        failReason: "wrong_pin", source: "esp32",
        balanceBefore: student.balance, balanceAfter: student.balance,
      });
      return res.status(401).json({ success: false, error: "Wrong PIN" });
    }

    // ── Check balance ─────────────────────────────────────────────────────────
    if (student.balance < amount) {
      await Transaction.create({
        uid, studentId: student._id, studentName: student.name,
        type: "debit", amount, item, status: "failed",
        failReason: "insufficient_balance", source: "esp32",
        balanceBefore: student.balance, balanceAfter: student.balance,
      });
      return res.status(402).json({
        success: false,
        error: "Insufficient balance",
        balance: student.balance,
      });
    }

    // ── Atomic deduction ──────────────────────────────────────────────────────
    const updated = await Student.findOneAndUpdate(
      { _id: student._id, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );

    if (!updated) {
      return res.status(402).json({ success: false, error: "Insufficient balance" });
    }

    // ── Log transaction ───────────────────────────────────────────────────────
    await Transaction.create({
      uid: uid.toUpperCase(),
      studentId: student._id,
      studentName: student.name,
      type: "debit",
      amount,
      item,
      status: "success",
      balanceBefore: student.balance,
      balanceAfter: updated.balance,
      source: "esp32",
    });

    // ── Lean response for ESP32 (low RAM) ────────────────────────────────────
    return res.json({
      ok: true,
      name: student.name,
      amt: amount,
      bal: updated.balance,
    });

  } catch (err) {
    console.error("POST /api/pay error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * GET /api/pay/balance/:uid
 * Returns current balance for a UID — called by ESP32 after card tap.
 * Auth: X-API-Key header
 * Lean response to save ESP32 memory.
 */
router.get("/balance/:uid", esp32Auth, async (req, res) => {
  try {
    const student = await Student.findOne({
      uid: req.params.uid.toUpperCase(),
      status: "active",
    }).select("name balance uid rollNo");

    if (!student) {
      return res.status(404).json({ ok: false, error: "Card not recognised" });
    }

    return res.json({
      ok: true,
      name: student.name,
      uid: student.uid,
      roll: student.rollNo,
      bal: student.balance,
    });
  } catch (err) {
    console.error("GET /api/pay/balance error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
