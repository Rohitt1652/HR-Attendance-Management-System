const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  category: {
    type: String,
    enum: ['Identity', 'Education', 'Experience', 'Contract', 'Medical', 'Tax', 'Other'],
    default: 'Other',
  },
  fileUrl: { type: String, required: true },
  fileName: { type: String },
  fileSize: { type: String },
  mimeType: { type: String },
  status: {
    type: String,
    enum: ['Pending', 'Verified', 'Rejected'],
    default: 'Pending',
  },
  rejectionReason: { type: String, default: null },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who uploaded
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('EmployeeDocument', documentSchema);
