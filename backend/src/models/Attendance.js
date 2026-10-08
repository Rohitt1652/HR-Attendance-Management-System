const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    checkIn: { type: Date },
    checkOut: { type: Date },
    workingHours: { type: Number },
    status: {
      type: String,
      enum: ['Present', 'Half Day', 'Full Day', 'Absent', 'Holiday', 'Weekend', 'On Leave'],
    },
    isLate: { type: Boolean, default: false },
    ipAddress: { type: String },
    deviceInfo: { type: String },
    source: { type: String, enum: ['manual', 'biometric', 'portal'], default: 'portal' },
    workMode: { type: String, enum: ['office', 'wfh'], default: 'office' },
    wfhReason: { type: String, trim: true, maxlength: 500 },
    wfhAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
