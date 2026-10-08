const mongoose = require('mongoose');

const downloadFormSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'General' },
  fileUrl: { type: String, required: true },
  fileName: { type: String },
  fileSize: { type: String },
  isActive: { type: Boolean, default: true },
  downloadCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('DownloadForm', downloadFormSchema);
