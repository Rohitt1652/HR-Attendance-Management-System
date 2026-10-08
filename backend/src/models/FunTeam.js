const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: Date },
  images: [{ type: String }],       // array of image URLs / paths
  videoUrls: [{ type: String }],    // array of YouTube/video URLs
  createdAt: { type: Date, default: Date.now },
});

const funTeamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  logoUrl: { type: String, default: null },
  color: { type: String, default: '#6366f1' },
  captain: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  events: [eventSchema],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('FunTeam', funTeamSchema);
