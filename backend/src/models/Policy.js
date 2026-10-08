const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, default: 'General' },
  content: { type: String, default: '' },
  fileUrl: { type: String, default: null },
  requiresAcceptance: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Policy', policySchema);
