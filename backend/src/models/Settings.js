const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  // Company branding
  companyName: { type: String, default: 'WorkforceOS' },
  companyTagline: { type: String, default: 'Smart HR & Attendance Management System' },
  companyLogo: { type: String, default: '' },       // base64 or URL
  companyFavicon: { type: String, default: '' },    // base64 or URL
  companyEmail: { type: String, default: '' },
  companyPhone: { type: String, default: '' },
  companyAddress: { type: String, default: '' },
  companyWebsite: { type: String, default: '' },
  // Attendance
  officeStartTime: { type: String, default: '09:00' },
  lateThreshold: { type: String, default: '10:00' },
  fullDayRequiredHours: { type: Number, default: 9 },
  halfDayRequiredHours: { type: Number, default: 4.5 },
  saturdayRequiredHours: { type: Number, default: 4 },
  lastAttendanceImportDate: { type: String, default: '' },
  lastAttendanceImportedAt: { type: Date, default: null },
  saturdayOffRule: {
    type: String,
    enum: ['all_saturdays_off', 'first_second_off', 'second_fourth_off', 'no_saturday_off', 'custom'],
    default: 'second_fourth_off',
  },
  customSaturdayOffs: { type: [Number], default: [] },
  weekendDays: { type: [Number], default: [0, 6] },
  holidays: [{ date: Date, name: String }],
  departments: [{ type: String }], // DEPRECATED — use Department collection instead. Kept for backward compat.
  shifts: [{ name: String, startTime: String, endTime: String }],
  inactivityTimeoutMinutes: { type: Number, default: 30 },
  // Email / SMTP
  smtpHost: { type: String, default: '' },
  smtpPort: { type: Number, default: 587 },
  smtpUser: { type: String, default: '' },
  smtpPass: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

settingsSchema.statics.getGlobal = async function () {
  let settings = await this.findOne({ key: 'global' });
  if (!settings) {
    settings = await this.create({ key: 'global' });
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
