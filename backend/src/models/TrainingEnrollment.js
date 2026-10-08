const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  trainingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Training', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who enrolled
  status: { type: String, enum: ['Enrolled', 'Completed', 'Dropped', 'Absent'], default: 'Enrolled' },
  attendance: { type: Number, default: 0 }, // percentage
  score: { type: Number }, // assessment score
  certificate: { type: String }, // certificate URL
  feedback: { type: String },
  rating: { type: Number, min: 1, max: 5 },
  // Payment
  paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Waived', 'Refunded'], default: 'Pending' },
  amountDue: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  paidAt: { type: Date },
  paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'UPI', 'Deduction', null], default: null },
  paymentRef: { type: String },
  collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

enrollmentSchema.index({ trainingId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('TrainingEnrollment', enrollmentSchema);
