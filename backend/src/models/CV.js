const mongoose = require('mongoose');

const cvSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Personal
  fullName: { type: String },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  linkedIn: { type: String },
  website: { type: String },
  summary: { type: String },
  // Education
  education: [{
    institution: String,
    degree: String,
    field: String,
    startYear: String,
    endYear: String,
    grade: String,
  }],
  // Experience
  experience: [{
    company: String,
    title: String,
    location: String,
    startDate: String,
    endDate: String,
    current: { type: Boolean, default: false },
    description: String,
  }],
  // Skills
  skills: [{ name: String, level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'], default: 'Intermediate' } }],
  // Certifications
  certifications: [{ name: String, issuer: String, year: String, url: String }],
  // Languages
  languages: [{ name: String, proficiency: String }],
  // Projects
  projects: [{ name: String, description: String, url: String, year: String }],
  isPublic: { type: Boolean, default: false },
  template: { type: String, default: 'modern' },
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('CV', cvSchema);
