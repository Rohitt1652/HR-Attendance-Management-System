const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  round: { type: Number, default: 1 },
  type: { type: String, enum: ['Phone', 'Video', 'In-person', 'Technical', 'HR', 'Panel'], default: 'In-person' },
  scheduledAt: { type: Date, required: true },
  duration: { type: Number, default: 60 }, // minutes
  interviewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  location: { type: String },
  meetLink: { type: String },
  status: { type: String, enum: ['Scheduled', 'Completed', 'Cancelled', 'No Show'], default: 'Scheduled' },
  feedback: { type: String },
  rating: { type: Number, min: 1, max: 5 },
  result: { type: String, enum: ['Pass', 'Fail', 'On Hold', null], default: null },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Interview', interviewSchema);
