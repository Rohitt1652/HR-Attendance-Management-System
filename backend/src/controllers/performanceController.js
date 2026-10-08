const PerformanceReview = require('../models/PerformanceReview');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const User = require('../models/User');
const Department = require('../models/Department');

const FULL_ACCESS_ROLES = ['admin', 'hr', 'md'];
const RATING_KEYS = ['punctuality', 'productivity', 'teamwork', 'communication', 'initiative', 'quality'];

async function getVisibleEmployeeIds(user) {
  if (FULL_ACCESS_ROLES.includes(user.role)) return null;
  if (user.role !== 'team_lead') return [user._id];

  const ledDepartments = await Department.find({
    teamLeaderId: user._id,
    status: 'active',
  }).distinct('name');

  return User.find({
    status: 'Active',
    role: 'employee',
    $or: [
      { teamLeadId: user._id },
      ...(ledDepartments.length ? [{ department: { $in: ledDepartments } }] : []),
    ],
  }).distinct('_id');
}

async function applyVisibilityScope(filter, user) {
  const visibleEmployeeIds = await getVisibleEmployeeIds(user);
  if (visibleEmployeeIds) filter.employeeId = { $in: visibleEmployeeIds };
  return filter;
}

function hasCompleteRatings(review) {
  return RATING_KEYS.every(key => {
    const value = review.ratings?.[key];
    return typeof value === 'number' && value >= 1 && value <= 5;
  });
}

function canManageAll(req) {
  return (req.permissions || []).includes('performance:manage');
}

function canManageTeam(req) {
  return req.user.role === 'team_lead'
    && (req.permissions || []).includes('performance:manage_team');
}

async function canManageTarget(req, employeeId) {
  const target = await User.findById(employeeId).select('_id role status');
  if (!target || target.status !== 'Active') return { allowed: false, target: null };
  if (canManageAll(req)) {
    return { allowed: ['employee', 'team_lead'].includes(target.role), target };
  }
  if (!canManageTeam(req) || target.role !== 'employee') return { allowed: false, target };
  const visibleEmployeeIds = await getVisibleEmployeeIds(req.user);
  return {
    allowed: visibleEmployeeIds.some(id => String(id) === String(target._id)),
    target,
  };
}

exports.getReviewableEmployees = async (req, res, next) => {
  try {
    let filter = { status: 'Active', role: { $in: ['employee', 'team_lead'] } };
    if (!canManageAll(req)) {
      if (!canManageTeam(req)) {
        return res.status(403).json({ success: false, message: 'Performance management permission required' });
      }
      const visibleEmployeeIds = await getVisibleEmployeeIds(req.user);
      filter = { ...filter, role: 'employee', _id: { $in: visibleEmployeeIds } };
    }
    const employees = await User.find(filter)
      .select('name employeeId department designation role profilePhotoUrl')
      .sort({ name: 1 });
    res.json({ success: true, data: employees });
  } catch (err) { next(err); }
};

// Admin: list all reviews
exports.listReviews = async (req, res, next) => {
  try {
    const { year, month, employeeId, status } = req.query;
    const filter = {};
    if (year) filter.year = parseInt(year);
    if (month) filter.month = parseInt(month);
    if (employeeId) filter.employeeId = employeeId;
    if (status) filter.status = status;
    const visibleEmployeeIds = await getVisibleEmployeeIds(req.user);
    if (visibleEmployeeIds) {
      if (employeeId && !visibleEmployeeIds.some(id => String(id) === String(employeeId))) {
        return res.status(403).json({ success: false, message: 'You can only view reviews for your team' });
      }
      filter.employeeId = { $in: visibleEmployeeIds };
    }
    const reviews = await PerformanceReview.find(filter)
      .populate('employeeId', 'name employeeId department designation profilePhotoUrl')
      .populate('reviewedBy', 'name')
      .sort({ year: -1, month: -1 });
    res.json({ success: true, data: reviews });
  } catch (err) { next(err); }
};

// Employee: own reviews (published only)
exports.getMyReviews = async (req, res, next) => {
  try {
    const reviews = await PerformanceReview.find({ employeeId: req.user._id, status: 'Published' })
      .populate('reviewedBy', 'name')
      .sort({ year: -1, month: -1 });
    res.json({ success: true, data: reviews });
  } catch (err) { next(err); }
};

// Get single review
exports.getReview = async (req, res, next) => {
  try {
    const review = await PerformanceReview.findById(req.params.id)
      .populate('employeeId', 'name employeeId department designation profilePhotoUrl email')
      .populate('reviewedBy', 'name');
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    const visibleEmployeeIds = await getVisibleEmployeeIds(req.user);
    const canSeeEmployee = !visibleEmployeeIds
      || visibleEmployeeIds.some(id => String(id) === String(review.employeeId._id));
    const ownPublishedOnly = !FULL_ACCESS_ROLES.includes(req.user.role) && req.user.role !== 'team_lead';
    if (!canSeeEmployee || (ownPublishedOnly && review.status !== 'Published')) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
};

// Admin: create/update review
exports.upsertReview = async (req, res, next) => {
  try {
    const { employeeId, month, year, periodType, ratings, strengths, improvements, goals, managerComments } = req.body;
    const management = await canManageTarget(req, employeeId);
    if (!management.target) {
      return res.status(400).json({ success: false, message: 'Select an active employee or team leader' });
    }
    if (!management.allowed) {
      return res.status(403).json({ success: false, message: 'You can only manage performance reviews for your team' });
    }

    // Auto-generate period label
    const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
    let period = `${MONTHS[month] || ''} ${year}`.trim();
    if (periodType === 'quarterly') {
      const q = Math.ceil(month / 3);
      period = `Q${q} ${year}`;
    } else if (periodType === 'yearly') {
      period = `${year}`;
    }

    const existing = await PerformanceReview.findOne({ employeeId, month, year });
    let review;
    if (existing) {
      Object.assign(existing, { periodType, period, ratings, strengths, improvements, goals, managerComments, reviewedBy: req.user._id, updatedAt: new Date() });
      review = await existing.save();
    } else {
      review = await PerformanceReview.create({ employeeId, month, year, periodType, period, ratings, strengths, improvements, goals, managerComments, reviewedBy: req.user._id });
    }
    await review.populate('employeeId', 'name employeeId department');
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
};

// Publish review
exports.publishReview = async (req, res, next) => {
  try {
    const review = await PerformanceReview.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Not found' });
    const management = await canManageTarget(req, review.employeeId);
    if (!management.allowed) {
      return res.status(403).json({ success: false, message: 'You cannot publish this performance review' });
    }
    if (!hasCompleteRatings(review)) {
      return res.status(400).json({
        success: false,
        message: 'All six performance ratings are required before publishing',
      });
    }
    review.status = 'Published';
    review.updatedAt = new Date();
    await review.save();
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
};

exports.deleteReview = async (req, res, next) => {
  try {
    const review = await PerformanceReview.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Not found' });
    const management = await canManageTarget(req, review.employeeId);
    if (!management.allowed) {
      return res.status(403).json({ success: false, message: 'You cannot delete this performance review' });
    }
    await review.deleteOne();
    res.json({ success: true });
  } catch (err) { next(err); }
};

// Team performance summary (for dashboard widget)
exports.getTeamSummary = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const filter = {};
    if (year) filter.year = parseInt(year);
    if (month) filter.month = parseInt(month);
    await applyVisibilityScope(filter, req.user);

    // Get all reviews for counts/totals
    const allReviews = await PerformanceReview.find(filter)
      .populate('employeeId', 'name department profilePhotoUrl');

    // Published reviews for scores/grades
    const publishedReviews = allReviews.filter(r => r.status === 'Published');
    const scoredReviews = publishedReviews.filter(r => Number.isFinite(r.overallScore));

    const summary = {
      total: allReviews.length,
      published: publishedReviews.length,
      avgScore: scoredReviews.length
        ? parseFloat((scoredReviews.reduce((s, r) => s + r.overallScore, 0) / scoredReviews.length).toFixed(2))
        : 0,
      gradeDistribution: { 'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, D: 0, F: 0 },
      topPerformers: [],
    };
    publishedReviews.forEach(r => { if (r.grade) summary.gradeDistribution[r.grade]++; });
    summary.topPerformers = publishedReviews
      .filter(r => r.overallScore)
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 5)
      .map(r => ({ name: r.employeeId?.name, score: r.overallScore, grade: r.grade, photo: r.employeeId?.profilePhotoUrl }));
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
};
