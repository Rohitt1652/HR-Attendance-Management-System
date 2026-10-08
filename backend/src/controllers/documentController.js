const EmployeeDocument = require('../models/EmployeeDocument');
const multer = require('multer');
const path = require('path');
const {
  canViewEmployeeDocuments,
  canUploadEmployeeDocument,
  canDeleteDocument,
} = require('../utils/accessControl');

const storage = multer.diskStorage({
  destination: 'uploads/documents/',
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `doc-${Date.now()}-${safe}`);
  },
});
exports.upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.xls', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

// Get all docs for an employee (admin sees all, employee sees own)
exports.getDocuments = async (req, res, next) => {
  try {
    const targetId = req.params.employeeId || req.user._id;
    if (!(await canViewEmployeeDocuments(req, targetId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const docs = await EmployeeDocument.find({ employeeId: targetId, isActive: true })
      .populate('uploadedBy', 'name')
      .populate('verifiedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
  } catch (err) { next(err); }
};

// Upload a document (single file - legacy support)
exports.uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const targetId = req.params.employeeId || req.user._id;
    if (!(await canUploadEmployeeDocument(req, targetId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const doc = await EmployeeDocument.create({
      employeeId: targetId,
      title: req.body.title || req.file.originalname,
      category: req.body.category || 'Other',
      fileUrl: `/uploads/documents/${req.file.filename}`,
      fileName: req.file.originalname,
      fileSize: `${(req.file.size / 1024).toFixed(0)} KB`,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
    });
    await doc.populate('uploadedBy', 'name');
    res.status(201).json({ success: true, data: doc });
  } catch (err) { next(err); }
};

// Upload multiple documents at once
exports.uploadMultipleDocuments = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'At least one file required' });
    const targetId = req.params.employeeId || req.user._id;
    if (!(await canUploadEmployeeDocument(req, targetId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    // titles and categories can be sent as JSON arrays or comma-separated
    let titles = [];
    let categories = [];
    try { titles = JSON.parse(req.body.titles || '[]'); } catch { titles = (req.body.titles || '').split(','); }
    try { categories = JSON.parse(req.body.categories || '[]'); } catch { categories = (req.body.categories || '').split(','); }

    const docs = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const doc = await EmployeeDocument.create({
        employeeId: targetId,
        title: (titles[i] || '').trim() || file.originalname,
        category: (categories[i] || '').trim() || req.body.category || 'Other',
        fileUrl: `/uploads/documents/${file.filename}`,
        fileName: file.originalname,
        fileSize: `${(file.size / 1024).toFixed(0)} KB`,
        mimeType: file.mimetype,
        uploadedBy: req.user._id,
      });
      await doc.populate('uploadedBy', 'name');
      docs.push(doc);
    }
    res.status(201).json({ success: true, data: docs, count: docs.length });
  } catch (err) { next(err); }
};

// Verify a document (admin only)
exports.verifyDocument = async (req, res, next) => {
  try {
    const doc = await EmployeeDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    doc.status = 'Verified';
    doc.verifiedBy = req.user._id;
    doc.rejectionReason = null;
    doc.updatedAt = new Date();
    await doc.save();
    await doc.populate('uploadedBy', 'name');
    await doc.populate('verifiedBy', 'name');
    res.json({ success: true, data: doc });
  } catch (err) { next(err); }
};

// Reject a document (admin only)
exports.rejectDocument = async (req, res, next) => {
  try {
    const doc = await EmployeeDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    doc.status = 'Rejected';
    doc.verifiedBy = req.user._id;
    doc.rejectionReason = req.body.reason || null;
    doc.updatedAt = new Date();
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (err) { next(err); }
};

// Delete a document
exports.deleteDocument = async (req, res, next) => {
  try {
    const doc = await EmployeeDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    if (!canDeleteDocument(req, doc)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    doc.isActive = false;
    await doc.save();
    res.json({ success: true, message: 'Document deleted' });
  } catch (err) { next(err); }
};

// Admin/TL: get all documents across all employees (with filters)
// Team leads only see their team's documents
exports.getAllDocuments = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;

    // Team-scoped: team leads only see documents of their team + own
    const userPerms = req.permissions || [];
    if (!userPerms.includes('employees:edit') && !['admin', 'md', 'hr'].includes(req.user.role)) {
      const Department = require('../models/Department');
      const User = require('../models/User');
      const ledDepts = await Department.find({ teamLeaderId: req.user._id, status: 'active' }).select('name');
      const ledDeptNames = ledDepts.map(d => d.name);
      const teamMembers = await User.find({
        $or: [
          { department: { $in: ledDeptNames } },
          { teamLeadId: req.user._id },
        ],
      }).distinct('_id');
      // Include own documents too
      teamMembers.push(req.user._id);
      filter.employeeId = req.query.employeeId
        ? (teamMembers.some(id => id.toString() === req.query.employeeId) ? req.query.employeeId : null)
        : { $in: teamMembers };
      if (filter.employeeId === null) {
        return res.json({ success: true, data: [] });
      }
    }

    const docs = await EmployeeDocument.find(filter)
      .populate('employeeId', 'name employeeId department')
      .populate('uploadedBy', 'name')
      .populate('verifiedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
  } catch (err) { next(err); }
};
