const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['Travel', 'Food', 'Office Supplies', 'Software', 'Hardware', 'Training', 'Entertainment', 'Utilities', 'Maintenance', 'Other'],
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    date: { type: Date, required: true },
    description: { type: String, trim: true },
    receiptUrl: { type: String }, // base64 or URL, optional
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String },
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Paid'],
      default: 'Unpaid',
    },
    paidAt: { type: Date },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
