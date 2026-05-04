const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
      uppercase: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
    },
    studentName: String, // denormalized for fast reads

    type: {
      type: String,
      enum: ["debit", "credit"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    balanceBefore: Number,
    balanceAfter: Number,

    item: {
      type: String,
      default: "Canteen purchase",
    },

    status: {
      type: String,
      enum: ["success", "failed"],
      default: "success",
    },
    failReason: String, // "insufficient_balance" | "student_not_found" | "wrong_pin"

    source: {
      // "esp32" = hardware terminal, "dashboard" = web admin, "student" = student portal
      type: String,
      enum: ["esp32", "dashboard", "student"],
      default: "esp32",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast queries
transactionSchema.index({ uid: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ status: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
