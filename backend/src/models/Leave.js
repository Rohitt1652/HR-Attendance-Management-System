const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // leaveType now references LeaveType.code for flexibility
  leaveType: { type: String, required: true },
  leaveTypeCode: { type: String },   // e.g. "SL"

  // Duration type
  durationType: {
    type: String,
    enum: ['full_day', 'half_day', 'hourly'],
    default: 'full_day',
  },

  // Date range (for full_day / half_day)
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },

  // Half-day specifics
  halfDayPeriod: {
    type: String,
    enum: ['morning', 'afternoon', null],
    default: null,
  },

  // Hourly specifics (same-day only)
  startTime: { type: String, default: null },  // "HH:MM"
  endTime: { type: String, default: null },    // "HH:MM"

  // Computed
  totalDays: { type: Number, default: null },   // 1, 0.5, or null for hourly
  totalHours: { type: Number, default: null },  // for hourly leaves
  durationMinutes: { type: Number, default: null },
  durationHours: { type: Number, default: null },

  reason: { type: String, required: true },
  currentProject: { type: String, default: null }, // project employee is working on
  proofUrl: { type: String, default: null },
  proofFileName: { type: String, default: null },
  leaveMode: { type: String, enum: ['Planned', 'Unplanned'], default: 'Planned' },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: null },
  appliedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Leave', leaveSchema);
