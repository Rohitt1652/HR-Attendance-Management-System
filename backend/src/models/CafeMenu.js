const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },
  category: { type: String, enum: ['Breakfast', 'Lunch', 'Snacks', 'Beverages', 'Dinner'], default: 'Lunch' },
  isVeg: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  imageUrl: { type: String, default: '' },
  imageUpdatedAt: { type: Date, default: null },
});

const cafeMenuSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true,
    unique: true,
  },
  items: [menuItemSchema],
  specialNote: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

cafeMenuSchema.statics.seedDefaults = async function () {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of days) {
    const exists = await this.findOne({ day });
    if (!exists) await this.create({ day, items: [] });
  }
};

module.exports = mongoose.model('CafeMenu', cafeMenuSchema);

// Cafe configuration (timings, cutoffs)
const cafeConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  lunchCutoff: { type: String, default: '11:30' },
  snacksCutoff: { type: String, default: '17:00' },
  updatedAt: { type: Date, default: Date.now },
});

const CafeConfig = mongoose.model('CafeConfig', cafeConfigSchema);
module.exports.CafeConfig = CafeConfig;
