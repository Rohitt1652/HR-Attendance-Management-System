const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: String, required: true },       // "YYYY-MM-DD"
  endDate: { type: String, default: null },      // for multi-day events
  startTime: { type: String, default: null },    // "HH:MM"
  endTime: { type: String, default: null },
  color: { type: String, default: '#6366f1' },
  type: {
    type: String,
    enum: ['meeting', 'event', 'reminder', 'birthday', 'holiday', 'other'],
    default: 'event',
  },
  isAllDay: { type: Boolean, default: true },
  companyHoliday: { type: Boolean, default: false },
  targetRoles: [{ type: String }],              // empty = visible to all
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('CalendarEvent', eventSchema);
