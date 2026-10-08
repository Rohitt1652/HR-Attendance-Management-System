const CV = require('../models/CV');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `cv-${req.user._id}-${Date.now()}${path.extname(file.originalname)}`),
});
exports.upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const allowed = ['.pdf', '.doc', '.docx'];
  cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
}});

exports.getMyCV = async (req, res, next) => {
  try {
    let cv = await CV.findOne({ userId: req.user._id });
    if (!cv) cv = await CV.create({ userId: req.user._id });
    res.json({ success: true, data: cv });
  } catch (err) { next(err); }
};

exports.updateMyCV = async (req, res, next) => {
  try {
    const cv = await CV.findOneAndUpdate(
      { userId: req.user._id },
      { ...req.body, userId: req.user._id },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, data: cv });
  } catch (err) { next(err); }
};

exports.uploadCVFile = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const cv = await CV.findOneAndUpdate(
      { userId: req.user._id },
      { userId: req.user._id, fileUrl: `/uploads/${req.file.filename}`, fileName: req.file.originalname },
      { new: true, upsert: true }
    );
    res.json({ success: true, data: cv });
  } catch (err) { next(err); }
};

exports.getCVById = async (req, res, next) => {
  try {
    const cv = await CV.findById(req.params.id).populate('userId', 'name email department designation');
    if (!cv) return res.status(404).json({ success: false, message: 'CV not found' });
    res.json({ success: true, data: cv });
  } catch (err) { next(err); }
};

exports.getAllCVs = async (req, res, next) => {
  try {
    const cvs = await CV.find().populate('userId', 'name email department designation profilePhotoUrl');
    res.json({ success: true, data: cvs });
  } catch (err) { next(err); }
};
