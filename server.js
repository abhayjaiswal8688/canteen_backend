// server.js — Canteen Pay API
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const payRouter = require("./routes/pay");
const studentsRouter = require("./routes/students");
const transactionsRouter = require("./routes/transactions");

const app = express();
const PORT = process.env.PORT || 5000;
const authRouter = require("./routes/auth");  // Or whatever your auth route file is named


// ── CORS ───────────────────────────────────────────────────────────────────────
// Allow the React dashboard and the Jetson (any origin for hardware terminal)
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL,
      "http://localhost:3001", // local dev
      "http://localhost:5173", // Vite dev
    ],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  })
);

// ── Body parsing ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/api/auth", authRouter);

// ── Rate limiting ──────────────────────────────────────────────────────────────
// Global: 200 requests per minute per IP
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests" },
  })
);

// Stricter limit on /api/pay (hardware terminal only sends one at a time)
app.use(
  "/api/pay",
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { success: false, error: "Payment rate limit exceeded" },
  })
);

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use("/api/pay", payRouter);
app.use("/api/students", studentsRouter);
app.use("/api/transactions", transactionsRouter);

// ── Health check ───────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── 404 catch-all ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ── MongoDB connection + server start ──────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✓ Connected to MongoDB Atlas");
    app.listen(PORT, () => {
      console.log(`✓ Canteen API running on port ${PORT}`);
      console.log(`  Health: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received — closing server");
  await mongoose.connection.close();
  process.exit(0);
});

