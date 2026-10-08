const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['leave_approved', 'leave_rejected', 'leave_applied', 'announcement', 'document_verified', 'document_rejected', 'general'],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String, default: null },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
