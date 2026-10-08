const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItemId: { type: String },
  name: { type: String, required: true },
  category: { type: String },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  isVeg: { type: Boolean, default: true },
});

const cafeOrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderDate: { type: Date, default: Date.now },
  lunchDate: { type: Date, default: null }, // The date lunch is being booked FOR (today or future)
  day: { type: String },
  items: [orderItemSchema],
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Delivered', 'Cancelled'], default: 'Pending' },
  // Payment
  paymentStatus: { type: String, enum: ['Unpaid', 'Submitted', 'Paid', 'Refunded'], default: 'Unpaid' },
  paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Wallet', 'Deduction', null], default: null },
  paidAt: { type: Date },
  collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paymentRef: { type: String },       // UPI transaction ID
  paymentScreenshot: { type: String }, // base64 or URL of screenshot
  paymentNote: { type: String },       // employee's note with payment
  notes: { type: String },
  cancelReason: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('CafeOrder', cafeOrderSchema);
