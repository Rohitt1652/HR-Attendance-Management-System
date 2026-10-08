const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: Number, required: true },   // 1-12
  year: { type: Number, required: true },
  basicSalary: { type: Number, default: 0 },
  hra: { type: Number, default: 0 },
  allowances: { type: Number, default: 0 },
  deductions: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  netSalary: { type: Number, default: 0 },
  workingDays: { type: Number, default: 0 },
  presentDays: { type: Number, default: 0 },
  leaveDays: { type: Number, default: 0 },
  status: { type: String, enum: ['Draft', 'Published'], default: 'Draft' },
  notes: { type: String, default: '' },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

payslipSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Payslip', payslipSchema);
