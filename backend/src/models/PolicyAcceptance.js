const mongoose = require('mongoose');

const policyAcceptanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Policy', required: true },
  policyVersion: { type: Number, required: true },
  acceptedAt: { type: Date, default: Date.now },
}, { timestamps: true });

policyAcceptanceSchema.index({ userId: 1, policyId: 1, policyVersion: 1 }, { unique: true });

module.exports = mongoose.model('PolicyAcceptance', policyAcceptanceSchema);
