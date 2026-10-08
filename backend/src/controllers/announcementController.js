const Announcement = require('../models/Announcement');
const User = require('../models/User');
const notify = require('../utils/notify');

const normalizeRoles = (targetRoles) => {
  if (!Array.isArray(targetRoles)) return [];
  return targetRoles.filter(Boolean);
};

const parseExpiry = (expiresAt) => {
  if (!expiresAt) return null;
  const parsed = new Date(expiresAt);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(expiresAt))) {
    parsed.setHours(23, 59, 59, 999);
  }
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const isAdminRole = (role) => ['admin', 'hr', 'md'].includes(role);

const isActiveAnnouncement = (ann) => {
  if (ann.isActive === false) return false;
  if (['inactive', 'deleted', 'archived'].includes(String(ann.status || '').toLowerCase())) return false;
  return true;
};

const getExpiryForComparison = (expiresAt) => {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return undefined;
  if (
    expiry.getUTCHours() === 0 &&
    expiry.getUTCMinutes() === 0 &&
    expiry.getUTCSeconds() === 0 &&
    expiry.getUTCMilliseconds() === 0
  ) {
    expiry.setUTCHours(23, 59, 59, 999);
  }
  return expiry;
};

const isExpiredAnnouncement = (ann, now) => {
  const expiry = getExpiryForComparison(ann.expiresAt);
  if (!expiry) return false;
  return expiry < now;
};

const normalizeTargetList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
};

const isVisibleToUser = (ann, user) => {
  if (isAdminRole(user?.role)) return true;

  const targetRoles = [
    ...normalizeTargetList(ann.targetRoles),
    ...normalizeTargetList(ann.targetRole),
    ...normalizeTargetList(ann.audience),
  ];
  const targetDepartments = normalizeTargetList(ann.targetDepartments);

  const roleMatches = !targetRoles.length || targetRoles.includes(user?.role) || targetRoles.includes('all');
  const departmentMatches = !targetDepartments.length || targetDepartments.includes(user?.department);
  return roleMatches && departmentMatches;
};

exports.getAnnouncements = async (req, res, next) => {
  try {
    const now = new Date();
    const role = req.user?.role;
    const department = req.user?.department;

    const rawCount = await Announcement.countDocuments({});
    const candidateDocs = await Announcement.find({
      $or: [{ isActive: { $exists: false } }, { isActive: true }],
    })
      .populate('postedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(200);

    const activeDocs = candidateDocs.filter(isActiveAnnouncement);
    const nonExpiredDocs = activeDocs.filter(ann => !isExpiredAnnouncement(ann, now));
    const announcements = nonExpiredDocs.filter(ann => isVisibleToUser(ann, req.user)).slice(0, 50);

    console.info('[announcements/list] Counts', {
      userId: req.user?._id,
      role,
      department,
      rawCount,
      activeCount: activeDocs.length,
      nonExpiredCount: nonExpiredDocs.length,
      visibleCount: announcements.length,
    });

    if (!announcements.length) {
      console.warn('[announcements/list] No visible announcements', {
        userId: req.user?._id,
        role,
        department,
        rawCount,
        activeCount: activeDocs.length,
        nonExpiredCount: nonExpiredDocs.length,
        newest: candidateDocs.slice(0, 5).map(ann => ({
          id: ann._id,
          title: ann.title,
          isActive: ann.isActive,
          status: ann.status,
          expiresAt: ann.expiresAt,
          targetRoles: ann.targetRoles,
          targetRole: ann.targetRole,
          audience: ann.audience,
        })),
      });
    }

    res.json({
      success: true,
      count: announcements.length,
      data: announcements,
      meta: { role, department, activeOnly: true, now },
    });
  } catch (err) {
    console.error('[announcements/list] Failed to load announcements:', err);
    next(err);
  }
};

exports.createAnnouncement = async (req, res, next) => {
  try {
    const { title, content, priority, targetRoles, expiresAt } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    const parsedExpiry = parseExpiry(expiresAt);
    if (parsedExpiry === undefined) {
      return res.status(400).json({ success: false, message: 'Invalid expiry date' });
    }

    const normalizedRoles = normalizeRoles(targetRoles);
    const ann = await Announcement.create({
      title: title.trim(),
      content: content.trim(),
      priority: priority || 'medium',
      targetRoles: normalizedRoles,
      expiresAt: parsedExpiry,
      isActive: true,
      postedBy: req.user._id,
    });

    console.info('[announcements/create] Announcement saved', {
      id: ann._id,
      targetRoles: ann.targetRoles,
      expiresAt: ann.expiresAt,
      postedBy: req.user._id,
    });

    const roleFilter = normalizedRoles.length ? { role: { $in: normalizedRoles }, status: 'Active' } : { status: 'Active' };
    const users = await User.find(roleFilter).select('_id');
    for (const u of users) {
      await notify(u._id, 'announcement', `Announcement: ${ann.title}`, ann.content.slice(0, 100), '/announcements');
    }

    res.status(201).json({ success: true, data: ann });
  } catch (err) {
    console.error('[announcements/create] Failed to save announcement:', err);
    next(err);
  }
};

exports.updateAnnouncement = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (updates.title !== undefined) updates.title = updates.title.trim();
    if (updates.content !== undefined) updates.content = updates.content.trim();
    if (updates.targetRoles !== undefined) updates.targetRoles = normalizeRoles(updates.targetRoles);
    if (updates.expiresAt !== undefined) {
      updates.expiresAt = parseExpiry(updates.expiresAt);
      if (updates.expiresAt === undefined) {
        return res.status(400).json({ success: false, message: 'Invalid expiry date' });
      }
    }

    const ann = await Announcement.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!ann) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: ann });
  } catch (err) {
    console.error('[announcements/update] Failed to update announcement:', err);
    next(err);
  }
};

exports.deleteAnnouncement = async (req, res, next) => {
  try {
    await Announcement.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true });
  } catch (err) {
    console.error('[announcements/delete] Failed to delete announcement:', err);
    next(err);
  }
};
