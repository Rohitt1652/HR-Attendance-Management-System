const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true },
  company: { type: String, trim: true },
}, { _id: false });

const officeTaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  category: {
    type: String,
    required: true,
    enum: ['Maintenance', 'Cleaning', 'Security', 'IT Support', 'Plumbing', 'Electrical', 'Carpentry', 'Pest Control', 'Renovation', 'Procurement', 'Other'],
    default: 'Maintenance',
  },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },

  // Status lifecycle: Open → In Progress → Completed / Cancelled
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Open',
  },

  // Who created and who is assigned
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Task timing
  taskStartTime: { type: Date },       // when work actually started
  taskCompleteTime: { type: Date },    // when work was completed
  dueDate: { type: Date },             // expected completion date

  // Vendor details
  vendor: { type: vendorSchema, default: null },

  // Bills / receipts (base64 strings, max 5)
  bills: [{ type: String }],

  // Expense details — submitted by reception, verified by HR
  expenseAmount: { type: Number, default: 0 },
  expenseCategory: {
    type: String,
    enum: ['Maintenance', 'Utilities', 'Office Supplies', 'Hardware', 'Other'],
    default: 'Maintenance',
  },
  expenseStatus: {
    type: String,
    enum: ['Not Submitted', 'Pending', 'Approved', 'Rejected'],
    default: 'Not Submitted',
  },
  expenseSubmittedAt: { type: Date },
  expenseApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expenseRejectionReason: { type: String },
  linkedExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }, // auto-created on approval

  notes: { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('OfficeTask', officeTaskSchema);
