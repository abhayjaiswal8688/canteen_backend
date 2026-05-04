const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const studentSchema = new mongoose.Schema(
  {
    rollNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    uid: {
      // RFID card UID — stored uppercase, e.g. "A3F2B19C"
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    pinHash: {
      // bcrypt hash of 4-digit PIN (used by ESP32 hardware terminal)
      type: String,
      required: true,
    },
    passwordHash: {
      // bcrypt hash of student portal password (used by web login)
      type: String,
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    topupRequests: [
      {
        amount: Number,
        note: String,
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        requestedAt: { type: Date, default: Date.now },
        resolvedAt: Date,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Hash PIN before saving if modified
studentSchema.pre("save", async function (next) {
  if (this.isModified("pinHash")) {
    this.pinHash = await bcrypt.hash(this.pinHash, 10);
  }
  if (this.isModified("passwordHash")) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  }
  next();
});

// Verify PIN (ESP32 hardware)
studentSchema.methods.verifyPin = function (pin) {
  return bcrypt.compare(String(pin), this.pinHash);
};

// Verify password (student portal login)
studentSchema.methods.verifyPassword = function (password) {
  return bcrypt.compare(String(password), this.passwordHash);
};

// Never return sensitive hashes in API responses
studentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.pinHash;
  delete obj.passwordHash;
  return obj;
};

// Virtual: balance status label
studentSchema.virtual("balanceStatus").get(function () {
  if (this.balance === 0) return "empty";
  if (this.balance < 100) return "low";
  return "ok";
});

module.exports = mongoose.model("Student", studentSchema);
