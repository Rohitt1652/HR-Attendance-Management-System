const mongoose = require('mongoose');

// Admin-configurable leave types with rules
const leaveTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },       // e.g. "Sick Leave"
  code: { type: String, required: true, unique: true },       // e.g. "SL"
  color: { type: String, default: '#6366f1' },                // for UI badges
  allowFullDay: { type: Boolean, default: true },             // allow full-day leaves
  allowHourly: { type: Boolean, default: false },             // allow partial-day (hourly) leaves
  allowHalfDay: { type: Boolean, default: true },             // allow half-day leaves
  maxDaysPerYear: { type: Number, default: null },            // null = unlimited
  maxHoursPerApplication: { type: Number, default: null },    // null = unlimited (for hourly leaves)
  maxPerMonth: { type: Number, default: null },               // null = unlimited (monthly cap)
  requiresApproval: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  // Free-hand leave: no quota enforcement, unlimited applications, admin approves ad-hoc.
  // Examples: Compensatory Off, Loss of Pay. Always shows in dropdown as "∞".
  isFreeHand: { type: Boolean, default: false },
  birthdayOnly: { type: Boolean, default: false },
  // If non-empty, only employees with these roles see this leave type in dropdown.
  // Empty array = visible to ALL roles (default behaviour).
  visibleToRoles: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

leaveTypeSchema.statics.seedDefaults = async function () {
  const defaults = [
    // ── Core leaves (always active) ────────────────────────────────────────
    { name: 'Casual Leave',             code: 'CL',   color: '#6366f1', allowFullDay: true, allowHourly: false, allowHalfDay: true,  maxDaysPerYear: 12 },
    { name: 'Medical Leave',            code: 'ML',   color: '#ef4444', allowFullDay: true, allowHourly: false, allowHalfDay: true,  maxDaysPerYear: 10 },
    { name: 'Short Leave',              code: 'SL',   color: '#f97316', allowFullDay: false, allowHourly: true,  allowHalfDay: false, maxDaysPerYear: null, maxHoursPerApplication: 2, maxPerMonth: 2 },
    { name: 'Birthday Short Leave',     code: 'BSL',  color: '#ec4899', allowFullDay: false, allowHourly: true,  allowHalfDay: false, maxDaysPerYear: null, maxHoursPerApplication: 2, birthdayOnly: true },
    { name: 'Paid Leave',               code: 'PL',   color: '#22c55e', allowFullDay: true, allowHourly: false, allowHalfDay: false, maxDaysPerYear: 15 },
    { name: 'Work From Home',           code: 'WFH',  color: '#f59e0b', allowFullDay: true, allowHourly: false, allowHalfDay: true,  maxDaysPerYear: null },
    { name: 'Emergency Leave',          code: 'EL',   color: '#a855f7', allowFullDay: true, allowHourly: true,  allowHalfDay: true,  maxDaysPerYear: 3 },
    { name: 'Privileged Leave',         code: 'PRIV', color: '#0ea5e9', allowFullDay: true, allowHourly: false, allowHalfDay: true,  maxDaysPerYear: 15 },
    // ── Family / life event leaves ─────────────────────────────────────────
    { name: 'Maternity Leave',          code: 'MTL',  color: '#ec4899', allowHourly: false, allowHalfDay: false, maxDaysPerYear: 180 },
    { name: 'Paternity Leave',          code: 'PTL',  color: '#0ea5e9', allowHourly: false, allowHalfDay: false, maxDaysPerYear: 15 },
    { name: 'Parental Leave',           code: 'PARL', color: '#d946ef', allowHourly: false, allowHalfDay: false, maxDaysPerYear: 30 },
    { name: 'Marital Leave',            code: 'MARL', color: '#f43f5e', allowHourly: false, allowHalfDay: false, maxDaysPerYear: 5 },
    { name: 'Demise Leave',             code: 'DL',   color: '#64748b', allowHourly: false, allowHalfDay: false, maxDaysPerYear: 3 },
    // ── Special / miscellaneous leaves ────────────────────────────────────
    { name: 'Compensatory Off',         code: 'COMP', color: '#14b8a6', allowHourly: false, allowHalfDay: true,  maxDaysPerYear: null, isFreeHand: true },
    { name: 'Loss of Pay',              code: 'LOP',  color: '#ef4444', allowHourly: false, allowHalfDay: true,  maxDaysPerYear: null, isFreeHand: true },
    { name: 'Official Visit',           code: 'OV',   color: '#3b82f6', allowHourly: false, allowHalfDay: false, maxDaysPerYear: null },
    { name: 'Relaxation Leave',         code: 'RL',   color: '#8b5cf6', allowHourly: false, allowHalfDay: true,  maxDaysPerYear: null },
    { name: 'Mandatory Leave',          code: 'MDL',  color: '#f97316', allowHourly: false, allowHalfDay: false, maxDaysPerYear: null },
    { name: 'Blood Donation Leave',     code: 'BDL',  color: '#dc2626', allowFullDay: false, allowHourly: false, allowHalfDay: true, maxDaysPerYear: 2 },
    { name: 'Organ Donor Leave',        code: 'ODL',  color: '#b91c1c', allowHourly: false, allowHalfDay: false, maxDaysPerYear: null },
    { name: 'School Visitation Leave',  code: 'SVL',  color: '#16a34a', allowHourly: false, allowHalfDay: true,  maxDaysPerYear: 2 },
  ];
  for (const lt of defaults) {
    // Only insert if the leave type doesn't exist yet — NEVER overwrite admin's manual changes
    const exists = await this.findOne({ $or: [{ code: lt.code }, { name: lt.name }] });
    if (!exists) {
      await this.create(lt);
    }
  }
};

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
