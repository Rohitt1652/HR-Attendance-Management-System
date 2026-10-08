const Department = require('../models/Department');
const User = require('../models/User');
const EmployeeDocument = require('../models/EmployeeDocument');
const Policy = require('../models/Policy');
const DownloadForm = require('../models/DownloadForm');
const CV = require('../models/CV');
const FunTeam = require('../models/FunTeam');
const Candidate = require('../models/Candidate');
const Leave = require('../models/Leave');

const ASSIGNABLE_ROLES = ['employee', 'team_lead', 'hr', 'admin', 'md'];
const PRIVILEGED_ROLES = ['admin', 'md', 'hr'];

const EMPLOYEE_WRITABLE_FIELDS = [
  'name', 'email', 'password', 'phone', 'department', 'designation', 'role',
  'joiningDate', 'dateOfBirth', 'status', 'teamLeadId', 'employeeId', 'biometricId',
  'basicSalary', 'hra', 'allowances', 'deductions', 'tax',
];

function hasPermission(req, ...perms) {
  const userPerms = req.permissions || [];
  return perms.some((p) => userPerms.includes(p));
}

function pickFields(source, allowedFields) {
  const result = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }
  return result;
}

function pickEmployeePayload(body) {
  return pickFields(body, EMPLOYEE_WRITABLE_FIELDS);
}

function assertAssignableRole(role) {
  if (!ASSIGNABLE_ROLES.includes(role)) {
    const err = new Error(`Invalid role "${role}"`);
    err.status = 400;
    throw err;
  }
}

function resolveRoleForCreate(req, requestedRole) {
  const role = requestedRole || 'employee';
  assertAssignableRole(role);
  if (PRIVILEGED_ROLES.includes(role) && !hasPermission(req, 'roles:edit')) {
    const err = new Error('Forbidden: cannot assign privileged roles');
    err.status = 403;
    throw err;
  }
  return role;
}

function applyRoleUpdatePolicy(req, updates) {
  if (!Object.prototype.hasOwnProperty.call(updates, 'role')) return updates;
  if (!hasPermission(req, 'roles:edit')) {
    delete updates.role;
  } else {
    assertAssignableRole(updates.role);
  }
  return updates;
}

function getPayslipEmployeeId(payslip) {
  const employee = payslip?.employeeId;
  if (!employee) return null;
  return employee._id || employee;
}

function canAccessPayslip(req, payslip) {
  const employeeId = getPayslipEmployeeId(payslip);
  if (!employeeId) return false;

  const isOwn = String(employeeId) === String(req.user._id);
  if (isOwn) {
    return payslip.status === 'Published' && hasPermission(req, 'payslips:view_own');
  }

  return hasPermission(req, 'payslips:view_all', 'payslips:manage');
}

function canDownloadPayslipPdf(req, payslip) {
  return canAccessPayslip(req, payslip);
}

async function getTeamMemberIds(userId) {
  const ledDepartments = await Department.find({ teamLeaderId: userId, status: 'active' }).select('name').lean();
  const ledDepartmentNames = ledDepartments.map((d) => d.name);
  const teamIds = await User.find({
    status: 'Active',
    $or: [
      { teamLeadId: userId },
      ...(ledDepartmentNames.length ? [{ department: { $in: ledDepartmentNames }, role: 'employee' }] : []),
    ],
  }).distinct('_id');
  return [userId, ...teamIds];
}

async function buildAttendanceEmployeeFilter(req) {
  const role = req.user?.role;

  if (['admin', 'md', 'hr', 'superadmin', 'Administrator', 'administrator'].includes(role)) {
    return null;
  }

  if (role === 'team_lead') {
    const { resolveAuthorizedWorkforceScope } = require('../services/scopeService');
    const scope = await resolveAuthorizedWorkforceScope(req.user);
    if (scope.isUnrestricted) return null;
    return { $in: scope.authorizedEmployeeIds || [] };
  }

  return req.user._id;
}

async function isTeamMemberOf(managerId, targetEmployeeId) {
  if (String(managerId) === String(targetEmployeeId)) return true;
  const teamIds = await getTeamMemberIds(managerId);
  return teamIds.some((id) => String(id) === String(targetEmployeeId));
}

async function canViewEmployeeDocuments(req, targetEmployeeId) {
  if (!targetEmployeeId) return false;
  if (String(targetEmployeeId) === String(req.user._id)) {
    return hasPermission(req, 'documents:view');
  }
  if (hasPermission(req, 'documents:manage', 'employees:view')) {
    return true;
  }
  if (hasPermission(req, 'employees:edit_team')) {
    return isTeamMemberOf(req.user._id, targetEmployeeId);
  }
  return false;
}

async function canUploadEmployeeDocument(req, targetEmployeeId) {
  if (String(targetEmployeeId) === String(req.user._id)) {
    return hasPermission(req, 'documents:upload');
  }
  if (hasPermission(req, 'employees:edit', 'documents:manage')) {
    return true;
  }
  if (hasPermission(req, 'employees:edit_team')) {
    return isTeamMemberOf(req.user._id, targetEmployeeId);
  }
  return false;
}

function canDeleteDocument(req, doc) {
  const isOwn = String(doc.employeeId) === String(req.user._id);
  if (hasPermission(req, 'documents:manage')) return true;
  if (isOwn && hasPermission(req, 'documents:upload')) {
    return doc.status !== 'Verified';
  }
  return false;
}

function canModifyLeave(req, leave) {
  const employeeId = leave.employeeId?._id || leave.employeeId;
  const isOwn = String(employeeId) === String(req.user._id);

  if (hasPermission(req, 'leaves:delete')) return true;
  if (!isOwn || !hasPermission(req, 'leaves:apply')) return false;
  return leave.status === 'Pending';
}

async function canAccessUploadPath(req, relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const fileUrl = `/uploads/${normalized}`;
  const fileName = normalized.split('/').pop();

  if (normalized.startsWith('documents/')) {
    const doc = await EmployeeDocument.findOne({ fileUrl, isActive: true }).select('employeeId');
    if (!doc) return hasPermission(req, 'documents:manage');
    return canViewEmployeeDocuments(req, doc.employeeId);
  }

  if (normalized.startsWith('leaves/')) {
    const leave = await Leave.findOne({ proofUrl: fileUrl }).select('employeeId');
    if (!leave) return hasPermission(req, 'leaves:approve');
    if (String(leave.employeeId) === String(req.user._id)) return true;
    return hasPermission(req, 'leaves:view_all', 'leaves:approve');
  }

  const policy = await Policy.findOne({
    isActive: { $ne: false },
    $or: [
      { fileUrl },
      { fileUrl: `/uploads/${fileName}` },
      { fileUrl: { $regex: `${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$` } },
    ],
  }).select('_id');
  if (policy) return hasPermission(req, 'policy:view');

  const form = await DownloadForm.findOne({ fileUrl, isActive: true }).select('_id');
  if (form) return hasPermission(req, 'forms:view');

  const cv = await CV.findOne({ fileUrl }).select('userId');
  if (cv) {
    if (String(cv.userId) === String(req.user._id)) return true;
    return hasPermission(req, 'cv:view');
  }

  const funTeam = await FunTeam.findOne({
    $or: [{ logoUrl: fileUrl }, { 'events.images': fileUrl }],
  }).select('_id');
  if (funTeam) return hasPermission(req, 'funteam:view');

  const candidate = await Candidate.findOne({ resumeUrl: fileUrl }).select('_id');
  if (candidate) return hasPermission(req, 'hiring:manage');

  const photoOwner = await User.findOne({ profilePhotoUrl: fileUrl }).select('_id');
  if (photoOwner) {
    if (String(photoOwner._id) === String(req.user._id)) return true;
    return hasPermission(req, 'employees:view', 'team:view');
  }

  return false;
}

module.exports = {
  ASSIGNABLE_ROLES,
  PRIVILEGED_ROLES,
  EMPLOYEE_WRITABLE_FIELDS,
  hasPermission,
  pickEmployeePayload,
  resolveRoleForCreate,
  applyRoleUpdatePolicy,
  canAccessPayslip,
  canDownloadPayslipPdf,
  getTeamMemberIds,
  buildAttendanceEmployeeFilter,
  isTeamMemberOf,
  canViewEmployeeDocuments,
  canUploadEmployeeDocument,
  canDeleteDocument,
  canModifyLeave,
  canAccessUploadPath,
};
