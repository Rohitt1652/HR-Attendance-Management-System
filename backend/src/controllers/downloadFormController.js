const DownloadForm = require('../models/DownloadForm');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `form-${Date.now()}${path.extname(file.originalname)}`),
});
exports.upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

exports.listForms = async (req, res, next) => {
  try {
    const forms = await DownloadForm.find({ isActive: true }).sort({ category: 1, title: 1 });
    res.json({ success: true, data: forms });
  } catch (err) { next(err); }
};

exports.createForm = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const form = await DownloadForm.create({
      ...req.body,
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      fileSize: `${(req.file.size / 1024).toFixed(0)} KB`,
    });
    res.status(201).json({ success: true, data: form });
  } catch (err) { next(err); }
};

exports.updateForm = async (req, res, next) => {
  try {
    const update = { ...req.body };
    if (req.file) {
      update.fileUrl = `/uploads/${req.file.filename}`;
      update.fileName = req.file.originalname;
      update.fileSize = `${(req.file.size / 1024).toFixed(0)} KB`;
    }
    const form = await DownloadForm.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });
    res.json({ success: true, data: form });
  } catch (err) { next(err); }
};

exports.deleteForm = async (req, res, next) => {
  try {
    await DownloadForm.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Form deleted' });
  } catch (err) { next(err); }
};

exports.trackDownload = async (req, res, next) => {
  try {
    await DownloadForm.findByIdAndUpdate(req.params.id, { $inc: { downloadCount: 1 } });
    res.json({ success: true });
  } catch (err) { next(err); }
};
