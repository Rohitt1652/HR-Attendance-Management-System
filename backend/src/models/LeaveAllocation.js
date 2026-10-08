const mongoose = require('mongoose');
if (mongoose.models.LeaveAllocation) { module.exports = mongoose.models.LeaveAllocation; } else {
  const schema = new mongoose.Schema({
    role: String,
    leaveTypeCode: String,
    daysAllowed: { type: Number, default: 0 },
    h1Days: { type: Number, default: null },
    carryForward: { type: Boolean, default: true },
    period: { type: String, default: 'biannual' },
    isEarned: { type: Boolean, default: false }, // earned leaves (e.g. Comp Off) — no fixed quota
    notApplicable: { type: Boolean, default: false },
    updatedAt: Date,
  });
  schema.index({ role: 1, leaveTypeCode: 1 }, { unique: true });
  module.exports = mongoose.model('LeaveAllocation', schema);
}
