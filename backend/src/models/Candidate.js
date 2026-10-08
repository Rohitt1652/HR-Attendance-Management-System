const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  resumeUrl: { type: String },
  resumeFileName: { type: String },
  coverLetter: { type: String },
  source: { type: String, enum: ['LinkedIn', 'Indeed', 'Referral', 'Website', 'Walk-in', 'Other'], default: 'Other' },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  stage: {
    type: String,
    enum: ['Applied', 'Screening', 'Interview', 'Technical', 'HR Round', 'Offer', 'Hired', 'Rejected'],
    default: 'Applied',
  },
  rating: { type: Number, min: 1, max: 5 },
  notes: { type: String },
  expectedSalary: { type: Number },
  noticePeriod: { type: String },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  offerDate: { type: Date },
  joiningDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Candidate', candidateSchema);
