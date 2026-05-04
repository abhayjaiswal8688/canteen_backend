// routes/transactions.js  —  read-only transaction log for the dashboard
const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const { adminAuth, studentAuth } = require("../middleware/auth");

router.use(adminAuth);

/**
 * GET /api/transactions
 * Query params: uid?, type?, status?, source?, limit?, page?, date?
 */
router.get("/", async (req, res) => {
  try {
    const { uid, type, status, source, limit = 50, page = 1, date } = req.query;
    const filter = {};

    if (uid) filter.uid = uid.toUpperCase();
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(skip),
      Transaction.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      transactions,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error("GET /api/transactions error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * GET /api/transactions/stats
 * Summary stats for the dashboard overview cards.
 */
router.get("/stats", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayDebits, todayCredits, totalStudentsWithTx] = await Promise.all([
      Transaction.aggregate([
        { $match: { type: "debit", status: "success", createdAt: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        { $match: { type: "credit", status: "success", createdAt: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amount" } } },
      ]),
      Transaction.distinct("uid"),
    ]);

    return res.json({
      success: true,
      today: {
        spend: todayDebits[0]?.total || 0,
        transactions: todayDebits[0]?.count || 0,
        topups: todayCredits[0]?.total || 0,
      },
      totalActiveUids: totalStudentsWithTx.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
