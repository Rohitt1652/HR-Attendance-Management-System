const mongoose = require('mongoose');

const jobPostingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  department: { type: String, required: true },
  location: { type: String, default: 'On-site' },
  type: { type: String, enum: ['Full-time', 'Part-time', 'Contract', 'Internship'], default: 'Full-time' },
  description: { type: String, required: true },
  requirements: [String],
  responsibilities: [String],
  salaryMin: { type: Number },
  salaryMax: { type: Number },
  status: { type: String, enum: ['Draft', 'Open', 'Closed', 'On Hold'], default: 'Draft' },
  deadline: { type: Date },
  openings: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('JobPosting', jobPostingSchema);
