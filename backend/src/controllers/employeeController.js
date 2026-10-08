const User = require('../models/User');
const path = require('path');
const {
  pickEmployeePayload,
  resolveRoleForCreate,
  applyRoleUpdatePolicy,
} = require('../utils/accessControl');

const PAGE_LIMIT = 50;

exports.suggestEmployeeId = async (req, res, next) => {
  try {
    const prefix = (req.query.prefix || 'EMP').toUpperCase().trim();
    // Find highest number for this prefix
    const regex = new RegExp(`^${prefix}-(\\d+)$`);
    const users = await User.find({ employeeId: { $regex: regex } }).select('employeeId');
    let maxNum = 0;
    users.forEach(u => {
      const match = u.employeeId?.match(regex);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });
    const suggested = `${prefix}-${maxNum + 1}`;
    res.json({ success: true, data: { suggested, prefix, nextNum: maxNum + 1 } });
  } catch (err) { next(err); }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const payload = pickEmployeePayload(req.body);
    if (payload.biometricId !== undefined) {
      payload.biometricId = String(payload.biometricId || '').trim() || undefined;
    }
    payload.role = resolveRoleForCreate(req, payload.role);
    const user = new User(payload);
    // Auto-assign team lead if not provided and role is employee
    if (!user.teamLeadId && user.role === 'employee' && user.department) {
      const teamLead = await User.findOne({ role: 'team_lead', department: user.department, status: 'Active' });
      if (teamLead) user.teamLeadId = teamLead._id;
    }
    await user.save();
    const { password: _pw, ...data } = user.toObject();
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      const label = field === 'biometricId' ? 'Biometric ID' : field === 'employeeId' ? 'Employee ID' : 'Email';
      return res.status(409).json({ success: false, message: `${label} already exists` });
    }
    next(err);
  }
};

exports.listEmployees = async (req, res, next) => {
  try {
    const { resolveAuthorizedWorkforceScope } = require('../services/scopeService');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || PAGE_LIMIT);
    const filter = {};

    const workforceScope = await resolveAuthorizedWorkforceScope(req.user);
    if (!workforceScope.isUnrestricted) {
      filter._id = { $in: workforceScope.authorizedEmployeeIds || [] };
    }

    if (req.query.department) filter.department = req.query.department;
    if (req.query.designation) filter.designation = req.query.designation;
    if (req.query.role) filter.role = req.query.role;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.joiningFrom || req.query.joiningTo) {
      filter.joiningDate = {};
      if (req.query.joiningFrom) filter.joiningDate.$gte = new Date(req.query.joiningFrom);
      if (req.query.joiningTo) filter.joiningDate.$lte = new Date(req.query.joiningTo);
    }
    if (req.query.name) {
      const regex = { $regex: req.query.name, $options: 'i' };
      filter.$or = [{ name: regex }, { email: regex }, { employeeId: regex }, { department: regex }, { designation: regex }];
    }
    const sortField = req.query.sortBy || 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
    const total = await User.countDocuments(filter);
    const employees = await User.find(filter)
      .select('-password')
      .populate('teamLeadId', 'name')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ [sortField]: sortDir });

    // Resolve team leader for each employee: prefer Department.teamLeaderId, fallback User.teamLeadId
    const Department = require('../models/Department');
    const deptTeamLeaders = await Department.find({ status: 'active', teamLeaderId: { $ne: null } })
      .populate('teamLeaderId', 'name profilePhotoUrl')
      .lean();
    const deptTLMap = Object.fromEntries(deptTeamLeaders.map(d => [d.name, d.teamLeaderId]));

    const enriched = employees.map(emp => {
      const e = emp.toObject();
      // Prefer department-level team leader
      const deptTL = deptTLMap[e.department];
      if (deptTL) {
        e.resolvedTeamLeader = { _id: deptTL._id, name: deptTL.name, profilePhotoUrl: deptTL.profilePhotoUrl };
      } else if (e.teamLeadId) {
        e.resolvedTeamLeader = { _id: e.teamLeadId._id, name: e.teamLeadId.name, profilePhotoUrl: e.teamLeadId.profilePhotoUrl };
      } else {
        e.resolvedTeamLeader = null;
      }
      return e;
    });

    res.json({
      success: true,
      data: enriched,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getEmployee = async (req, res, next) => {
  try {
    const { resolveAuthorizedWorkforceScope } = require('../services/scopeService');
    const workforceScope = await resolveAuthorizedWorkforceScope(req.user);
    if (!workforceScope.isUnrestricted) {
      const allowedIds = (workforceScope.authorizedEmployeeIds || []).map(id => String(id));
      if (!allowedIds.includes(String(req.params.id)) && String(req.user._id) !== String(req.params.id)) {
        return res.status(403).json({ success: false, message: 'Access denied: employee outside managed team scope' });
      }
    }
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const payload = pickEmployeePayload(req.body);
    const { password, employeeId, biometricId, ...updates } = payload;
    applyRoleUpdatePolicy(req, updates);

    // Team-scoped edit: if user only has employees:edit_team (not employees:edit),
    // restrict to employees in their team (department they lead or direct reports)
    const userPerms = req.permissions || [];
    const hasFullEdit = userPerms.includes('employees:edit');
    const hasTeamEdit = userPerms.includes('employees:edit_team');

    if (!hasFullEdit && hasTeamEdit) {
      const Department = require('../models/Department');
      const targetUser = await User.findById(req.params.id).select('department role teamLeadId');
      if (!targetUser) return res.status(404).json({ success: false, message: 'Employee not found' });

      // Get departments led by the requester
      const ledDepts = await Department.find({ teamLeaderId: req.user._id, status: 'active' }).select('name');
      const ledDeptNames = ledDepts.map(d => d.name);

      // Allow edit only if target is in a department they lead OR has them as teamLeadId
      const inLedDept = targetUser.department && ledDeptNames.includes(targetUser.department);
      const isDirectReport = targetUser.teamLeadId && targetUser.teamLeadId.toString() === req.user._id.toString();

      if (!inLedDept && !isDirectReport) {
        return res.status(403).json({ success: false, message: 'You can only edit employees in your team.' });
      }
    }

    // Allow setting employeeId if provided and not already set
    if (employeeId) {
      const existing = await User.findById(req.params.id).select('employeeId');
      if (!existing?.employeeId) updates.employeeId = employeeId;
      else if (existing.employeeId === employeeId) {} // same, no change
      // else: different - allow admin to change it
      else updates.employeeId = employeeId;
    }
    if (hasFullEdit && biometricId !== undefined) {
      updates.biometricId = String(biometricId || '').trim() || undefined;
      if (!updates.biometricId) {
        delete updates.biometricId;
        updates.$unset = { ...(updates.$unset || {}), biometricId: 1 };
      }
    }
    // Allow teamLeadId to be set/cleared
    if (updates.teamLeadId === '') updates.teamLeadId = null;

    // Auto-assign team lead if not explicitly set and employee has no team lead
    if (updates.teamLeadId === undefined || updates.teamLeadId === null) {
      const existing = await User.findById(req.params.id).select('role department teamLeadId');
      if (existing && existing.role === 'employee') {
        const dept = updates.department || existing.department;
        if (dept) {
          const teamLead = await User.findOne({ role: 'team_lead', department: dept, status: 'Active' });
          if (teamLead) updates.teamLeadId = teamLead._id;
        }
      }
    }

    const unset = updates.$unset;
    delete updates.$unset;
    const updateDoc = unset ? { $set: updates, $unset: unset } : updates;

    const user = await User.findByIdAndUpdate(req.params.id, updateDoc, {
      new: true,
      runValidators: true,
    }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      const label = field === 'biometricId' ? 'Biometric ID' : field === 'employeeId' ? 'Employee ID' : 'Email';
      return res.status(409).json({ success: false, message: `${label} already exists` });
    }
    next(err);
  }
};

exports.deleteEmployee = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'Inactive' },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

exports.searchEmployees = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });
    const regex = { $regex: q, $options: 'i' };
    const employees = await User.find({
      $or: [{ name: regex }, { department: regex }, { designation: regex }],
    }).select('-password');
    res.json({ success: true, data: employees });
  } catch (err) {
    next(err);
  }
};

exports.uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { profilePhotoUrl: url },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

exports.uploadMyPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (!req.file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'Only image files are allowed' });
    }
    const url = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePhotoUrl: url },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

exports.getMyTeam = async (req, res, next) => {
  try {
    const user = req.user;
    if (user.role === 'team_lead') {
      // Team lead sees their team members
      const members = await User.find({
        $or: [
          { teamLeadId: user._id },
          { department: user.department, role: 'employee', teamLeadId: null },
        ],
        status: 'Active',
      }).select('-password');
      res.json({ success: true, data: members, role: 'team_lead' });
    } else if (user.role === 'employee') {
      // Employee sees their team lead — prefer Department.teamLeaderId, fallback to User.teamLeadId
      const Department = require('../models/Department');
      let teamLead = null;

      // Primary: look up from Department collection
      if (user.department) {
        const dept = await Department.findOne({ name: user.department, status: 'active' })
          .populate('teamLeaderId', 'name employeeId department designation profilePhotoUrl');
        if (dept?.teamLeaderId) {
          teamLead = dept.teamLeaderId;
        }
      }

      // Fallback: User.teamLeadId (legacy)
      if (!teamLead) {
        const fullUser = await User.findById(user._id).populate('teamLeadId', 'name employeeId department designation profilePhotoUrl');
        teamLead = fullUser.teamLeadId || null;
      }

      res.json({ success: true, data: teamLead, role: 'employee' });
    } else {
      res.json({ success: true, data: [], role: user.role });
    }
  } catch (err) { next(err); }
};

const DOB_FIELDS = [
  'dateOfBirth',
  'dob',
  'date_of_birth',
  'birthDate',
  'birth_date',
  'personalInfo.dob',
];

const birthdayFieldExpression = DOB_FIELDS
  .map(field => `$${field}`)
  .reduceRight((fallback, field) => ({ $ifNull: [field, fallback] }), null);

const birthdaySourceExpression = {
  $switch: {
    branches: DOB_FIELDS.map(field => ({
      case: { $ne: [`$${field}`, null] },
      then: field,
    })),
    default: null,
  },
};

async function findBirthdaysByDate({ month, day }) {
  const inactiveStatuses = ['Inactive', 'Deleted', 'inactive', 'deleted'];
  const matchDate = day
    ? {
        $and: [
          { $eq: [{ $month: '$_birthdayDate' }, month] },
          { $eq: [{ $dayOfMonth: '$_birthdayDate' }, day] },
        ],
      }
    : { $eq: [{ $month: '$_birthdayDate' }, month] };

  return User.collection.aggregate([
    {
      $match: {
        $and: [
          { $or: [{ status: { $exists: false } }, { status: { $nin: inactiveStatuses } }] },
          { $or: [{ deleted: { $exists: false } }, { deleted: { $ne: true } }] },
          { $or: [{ isDeleted: { $exists: false } }, { isDeleted: { $ne: true } }] },
        ],
      },
    },
    {
      $addFields: {
        _birthdayRaw: birthdayFieldExpression,
        _birthdaySource: birthdaySourceExpression,
      },
    },
    {
      $addFields: {
        _birthdayDate: {
          $convert: {
            input: '$_birthdayRaw',
            to: 'date',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    {
      $match: {
        _birthdayDate: { $ne: null },
        $expr: matchDate,
      },
    },
    {
      $project: {
        name: 1,
        department: 1,
        designation: 1,
        profilePhotoUrl: 1,
        employeeId: 1,
        dateOfBirth: '$_birthdayDate',
        dobField: '$_birthdaySource',
        birthdayMonth: { $month: '$_birthdayDate' },
        birthdayDay: { $dayOfMonth: '$_birthdayDate' },
      },
    },
    { $sort: { birthdayDay: 1, name: 1 } },
  ]).toArray();
}

exports.getTodayBirthdays = async (req, res, next) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const day = parseInt(req.query.day) || now.getDate();
    const employees = await findBirthdaysByDate({ month, day });
    if (!employees.length) {
      console.warn(`[birthdays/today] No DOB matches found for ${month}/${day}. Checked fields: ${DOB_FIELDS.join(', ')}`);
    }
    res.json({ success: true, data: employees, meta: { month, day, dobFields: DOB_FIELDS } });
  } catch (err) {
    console.error('[birthdays/today] Failed to load birthdays:', err);
    next(err);
  }
};

exports.getMonthBirthdays = async (req, res, next) => {
  try {
    const month = parseInt(req.params.month);
    if (!month || month < 1 || month > 12) return res.status(400).json({ success: false, message: 'Invalid month' });
    const employees = await findBirthdaysByDate({ month });
    if (!employees.length) {
      console.warn(`[birthdays/month] No DOB matches found for month ${month}. Checked fields: ${DOB_FIELDS.join(', ')}`);
    }
    res.json({ success: true, data: employees, meta: { month, dobFields: DOB_FIELDS } });
  } catch (err) {
    console.error('[birthdays/month] Failed to load birthdays:', err);
    next(err);
  }
};
exports.getUpcomingBirthdays = async (req, res, next) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

    const [currentMonthBirthdays, nextMonthBirthdays] = await Promise.all([
      findBirthdaysByDate({ month: currentMonth }),
      findBirthdaysByDate({ month: nextMonth }),
    ]);

    const upcomingCurrent = currentMonthBirthdays.filter(e => (e.birthdayDay || 0) > currentDay);
    const upcoming = [...upcomingCurrent, ...nextMonthBirthdays].slice(0, 10);

    res.json({ success: true, data: upcoming, meta: { currentMonth, nextMonth, count: upcoming.length } });
  } catch (err) {
    console.error('[birthdays/upcoming] Failed to load upcoming birthdays:', err);
    next(err);
  }
};

