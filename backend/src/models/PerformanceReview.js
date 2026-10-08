const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  period: { type: String, required: true },   // e.g. "Q1 2026", "April 2026"
  periodType: { type: String, enum: ['monthly', 'quarterly', 'yearly'], default: 'monthly' },
  month: { type: Number },   // 1-12
  year: { type: Number, required: true },

  // Ratings 1-5
  ratings: {
    punctuality:    { type: Number, min: 1, max: 5, default: null },
    productivity:   { type: Number, min: 1, max: 5, default: null },
    teamwork:       { type: Number, min: 1, max: 5, default: null },
    communication:  { type: Number, min: 1, max: 5, default: null },
    initiative:     { type: Number, min: 1, max: 5, default: null },
    quality:        { type: Number, min: 1, max: 5, default: null },
  },

  overallScore: { type: Number, default: null },   // auto-computed avg
  grade: { type: String, enum: ['A+','A','B+','B','C','D','F', null], default: null },

  strengths: { type: String, default: '' },
  improvements: { type: String, default: '' },
  goals: { type: String, default: '' },
  managerComments: { type: String, default: '' },

  status: { type: String, enum: ['Draft', 'Published'], default: 'Draft' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Auto-compute overall score and grade before save
reviewSchema.pre('save', function (next) {
  const r = this.ratings;
  const vals = [r.punctuality, r.productivity, r.teamwork, r.communication, r.initiative, r.quality].filter(v => v !== null);
  if (vals.length > 0) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    this.overallScore = parseFloat(avg.toFixed(2));
    if (avg >= 4.5) this.grade = 'A+';
    else if (avg >= 4.0) this.grade = 'A';
    else if (avg >= 3.5) this.grade = 'B+';
    else if (avg >= 3.0) this.grade = 'B';
    else if (avg >= 2.5) this.grade = 'C';
    else if (avg >= 2.0) this.grade = 'D';
    else this.grade = 'F';
  }
  next();
});

module.exports = mongoose.model('PerformanceReview', reviewSchema);
