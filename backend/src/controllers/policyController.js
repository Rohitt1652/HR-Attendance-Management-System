const fs = require('fs');
const Policy = require('../models/Policy');
const PolicyAcceptance = require('../models/PolicyAcceptance');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const { fileUrlToAbsolutePath, UPLOADS_ROOT } = require('../utils/uploadPath');

if (!fs.existsSync(UPLOADS_ROOT)) {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOADS_ROOT,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `policy-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

exports.upload = upload;

function policyRequiresAcceptance(policy) {
  return policy.requiresAcceptance !== false;
}

function enrichPolicyRecord(policy, acceptanceMap) {
  const fileUrl = policy.fileUrl || policy.attachmentUrl || policy.documentUrl || null;
  const absolutePath = fileUrl ? fileUrlToAbsolutePath(fileUrl) : null;
  const version = policy.version || 1;
  const acceptance = acceptanceMap.get(String(policy._id));
  const accepted = acceptance && acceptance.policyVersion >= version;
  return {
    ...policy,
    fileUrl,
    hasFile: Boolean(fileUrl && absolutePath && fs.existsSync(absolutePath)),
    version,
    requiresAcceptance: policyRequiresAcceptance(policy),
    accepted,
    acceptedAt: accepted ? acceptance.acceptedAt : null,
    pendingAcceptance: policyRequiresAcceptance(policy) && !accepted,
  };
}

async function getAcceptanceMapForUser(userId) {
  const acceptances = await PolicyAcceptance.find({ userId }).lean();
  const map = new Map();
  acceptances.forEach((a) => {
    const key = String(a.policyId);
    const existing = map.get(key);
    if (!existing || a.policyVersion > existing.policyVersion) {
      map.set(key, a);
    }
  });
  return map;
}

exports.listPolicies = async (req, res, next) => {
  try {
    const policies = await Policy.find({ isActive: { $ne: false } }).sort({ category: 1, title: 1 }).lean();
    const acceptanceMap = await getAcceptanceMapForUser(req.user._id);
    const data = policies.map((policy) => enrichPolicyRecord(policy, acceptanceMap));
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getPendingPolicies = async (req, res, next) => {
  try {
    const policies = await Policy.find({ isActive: { $ne: false } }).sort({ category: 1, title: 1 }).lean();
    const acceptanceMap = await getAcceptanceMapForUser(req.user._id);
    const data = policies
      .map((policy) => enrichPolicyRecord(policy, acceptanceMap))
      .filter((p) => p.pendingAcceptance);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.acceptPolicy = async (req, res, next) => {
  try {
    const policy = await Policy.findOne({ _id: req.params.id, isActive: { $ne: false } }).lean();
    if (!policy) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }
    if (!policyRequiresAcceptance(policy)) {
      return res.status(400).json({ success: false, message: 'This policy does not require acceptance' });
    }

    const version = policy.version || 1;
    const acceptance = await PolicyAcceptance.findOneAndUpdate(
      { userId: req.user._id, policyId: policy._id, policyVersion: version },
      { userId: req.user._id, policyId: policy._id, policyVersion: version, acceptedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.json({ success: true, data: { acceptedAt: acceptance.acceptedAt, policyVersion: version } });
  } catch (err) { next(err); }
};

exports.getPolicyFile = async (req, res, next) => {
  try {
    const policy = await Policy.findOne({ _id: req.params.id, isActive: { $ne: false } }).lean();
    const fileUrl = policy?.fileUrl || policy?.attachmentUrl || policy?.documentUrl;
    if (!fileUrl) {
      return res.status(404).json({ success: false, message: 'Policy file not found' });
    }

    const absolutePath = fileUrlToAbsolutePath(fileUrl);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    res.sendFile(absolutePath);
  } catch (err) { next(err); }
};

function parseBoolField(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return defaultValue;
}

exports.createPolicy = async (req, res, next) => {
  try {
    const policy = await Policy.create({
      title: req.body.title,
      category: req.body.category || 'General',
      content: req.body.content || '',
      requiresAcceptance: parseBoolField(req.body.requiresAcceptance, true),
      version: 1,
      fileUrl: req.file ? `/uploads/${req.file.filename}` : null,
    });
    res.status(201).json({ success: true, data: policy });
  } catch (err) { next(err); }
};

exports.updatePolicy = async (req, res, next) => {
  try {
    const existing = await Policy.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Policy not found' });

    const update = { updatedAt: new Date() };
    if (req.body.title !== undefined) update.title = req.body.title;
    if (req.body.category !== undefined) update.category = req.body.category;
    if (req.body.content !== undefined) update.content = req.body.content;
    if (req.body.requiresAcceptance !== undefined) {
      update.requiresAcceptance = parseBoolField(req.body.requiresAcceptance, true);
    }
    if (req.file) update.fileUrl = `/uploads/${req.file.filename}`;

    const materialChange =
      req.file
      || (update.content !== undefined && update.content !== existing.content)
      || (update.title !== undefined && update.title !== existing.title);

    if (materialChange) {
      update.version = (existing.version || 1) + 1;
    }

    const policy = await Policy.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ success: true, data: policy });
  } catch (err) { next(err); }
};

exports.deletePolicy = async (req, res, next) => {
  try {
    await Policy.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Policy deleted' });
  } catch (err) { next(err); }
};

exports.getAcceptanceReport = async (req, res, next) => {
  try {
    const users = await User.find({ status: 'Active' })
      .select('name email employeeId department designation role')
      .sort({ name: 1 })
      .lean();

    const policies = await Policy.find({ isActive: { $ne: false } })
      .sort({ category: 1, title: 1 })
      .lean();

    const acceptancePolicies = policies.filter((p) => policyRequiresAcceptance(p));
    const policyIds = acceptancePolicies.map((p) => p._id);
    const acceptances = policyIds.length
      ? await PolicyAcceptance.find({ policyId: { $in: policyIds } }).lean()
      : [];

    const acceptanceByPolicyUser = new Map();
    acceptances.forEach((a) => {
      const key = `${String(a.policyId)}:${String(a.userId)}`;
      const existing = acceptanceByPolicyUser.get(key);
      if (!existing || a.policyVersion > existing.policyVersion) {
        acceptanceByPolicyUser.set(key, a);
      }
    });

    const policyReports = acceptancePolicies.map((policy) => {
      const version = policy.version || 1;
      const accepted = [];
      const pending = [];

      users.forEach((user) => {
        const key = `${String(policy._id)}:${String(user._id)}`;
        const acc = acceptanceByPolicyUser.get(key);
        const isAccepted = acc && acc.policyVersion >= version;
        const row = {
          userId: user._id,
          name: user.name,
          email: user.email,
          employeeId: user.employeeId,
          department: user.department,
          designation: user.designation,
          role: user.role,
          acceptedAt: isAccepted ? acc.acceptedAt : null,
        };
        if (isAccepted) accepted.push(row);
        else pending.push(row);
      });

      return {
        policyId: policy._id,
        title: policy.title,
        category: policy.category,
        version,
        totalEmployees: users.length,
        acceptedCount: accepted.length,
        pendingCount: pending.length,
        accepted,
        pending,
      };
    });

    const totalPendingEmployees = new Set();
    policyReports.forEach((p) => {
      p.pending.forEach((u) => totalPendingEmployees.add(String(u.userId)));
    });

    res.json({
      success: true,
      data: {
        totalEmployees: users.length,
        policiesWithPending: policyReports.filter((p) => p.pendingCount > 0).length,
        employeesWithPending: totalPendingEmployees.size,
        policies: policyReports,
      },
    });
  } catch (err) { next(err); }
};
