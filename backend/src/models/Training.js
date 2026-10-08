const mongoose = require('mongoose');

const trainingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String, enum: ['Technical', 'Soft Skills', 'Compliance', 'Leadership', 'Other'], default: 'Technical' },
  type: { type: String, enum: ['Internal', 'External', 'Online'], default: 'Internal' },
  isPaid: { type: Boolean, default: false },
  fee: { type: Number, default: 0 }, // per participant
  trainer: { type: String },
  trainerExternal: { type: Boolean, default: false },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  schedule: { type: String }, // e.g. "Mon-Fri 9am-5pm"
  venue: { type: String },
  onlineLink: { type: String },
  maxParticipants: { type: Number },
  status: { type: String, enum: ['Upcoming', 'Ongoing', 'Completed', 'Cancelled'], default: 'Upcoming' },
  materials: [{ name: String, url: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Training', trainingSchema);
