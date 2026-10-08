const Department = require('../models/Department');
const User = require('../models/User');

const UNRESTRICTED_ROLES = ['admin', 'hr', 'md', 'superadmin', 'Administrator', 'administrator'];

/**
 * Centralized Authorized Workforce Scope Resolver for Phase 1.
 * 
 * Rules:
 * - Admin/HR/MD: Unrestricted (returns isUnrestricted: true, null arrays).
 * - team_lead: Department leadership is authoritative via Department.teamLeaderId.
 *   - Resolves all active Department documents where teamLeaderId === user._id.
 *   - Resolves active users whose User.department matches managed department names.
 *   - If zero departments managed: fails closed (returns empty arrays, NOT company-wide).
 * - Other roles: returns empty scope or own ID.
 * 
 * @param {Object} user - Authenticated Mongoose User document or object with _id and role.
 * @returns {Promise<{ isUnrestricted: boolean, managedDepartments: string[]|null, authorizedEmployeeIds: Object[]|null }>}
 */
async function resolveAuthorizedWorkforceScope(user) {
  if (!user || !user.role) {
    return {
      isUnrestricted: true,
      managedDepartments: null,
      authorizedEmployeeIds: null,
    };
  }

  // 1. Unrestricted Roles (Admin, HR, MD)
  if (UNRESTRICTED_ROLES.includes(user.role)) {
    return {
      isUnrestricted: true,
      managedDepartments: null,
      authorizedEmployeeIds: null,
    };
  }

  // 2. Team Leader Role (team_lead)
  if (user.role === 'team_lead') {
    const userId = user._id ? user._id : user;
    const ledDepartments = await Department.find({
      teamLeaderId: userId,
      status: 'active',
    }).select('name').lean();

    const managedDepartments = ledDepartments.map((d) => d.name);

    if (managedDepartments.length === 0) {
      // Fail closed: zero managed departments -> zero authorized workforce
      return {
        isUnrestricted: false,
        managedDepartments: [],
        authorizedEmployeeIds: [],
      };
    }

    const authorizedUsers = await User.find({
      department: { $in: managedDepartments },
      status: 'Active',
    }).select('_id').lean();

    const authorizedEmployeeIds = authorizedUsers.map((u) => u._id);

    return {
      isUnrestricted: false,
      managedDepartments,
      authorizedEmployeeIds,
    };
  }

  // 3. Fallback / Standard Employee
  return {
    isUnrestricted: false,
    managedDepartments: [],
    authorizedEmployeeIds: user._id ? [user._id] : [],
  };
}

module.exports = {
  UNRESTRICTED_ROLES,
  resolveAuthorizedWorkforceScope,
};
