const mongoose = require('mongoose');

// All available permissions in the system
const ALL_PERMISSIONS = [
  // Employees
  'employees:view',
  'employees:create',
  'employees:edit',
  'employees:edit_team',
  'employees:delete',
  // Attendance
  'attendance:checkin',
  'attendance:checkout',
  'attendance:view_own',
  'attendance:view_all',
  'attendance:dashboard',
  'attendance:import',
  'attendance:manage_wfh',
  'attendance:delete',
  // Leaves
  'leaves:apply',
  'leaves:view_own',
  'leaves:view_all',
  'leaves:approve',
  'leaves:delete',
  // Reports
  'reports:view',
  'reports:export',
  // Settings
  'settings:view',
  'settings:edit',
  // Roles
  'roles:view',
  'roles:edit',
  // Hiring
  'hiring:manage',
  // Training
  'training:manage',
  // CV
  'cv:view',
  // Cafe & Lunch
  'cafe:view',
  'cafe:manage',
  'lunch:view',
  'lunch:order',
  // Documents
  'documents:view',
  'documents:upload',
  'documents:manage',
  // Announcements
  'announcements:view',
  'announcements:create',
  // Calendar & Holidays
  'calendar:view',
  'calendar:manage',
  'calendar:event:create',
  'calendar:event:edit',
  'calendar:event:delete',
  'holidays:view',
  'holidays:manage',
  'holidays:create',
  'holidays:edit',
  'holidays:delete',
  // Payslips
  'payslips:view_own',
  'payslips:view_all',
  'payslips:manage',
  // Performance
  'performance:view_own',
  'performance:view_all',
  'performance:manage_team',
  'performance:manage',
  // Expenses
  'expenses:view_own',
  'expenses:view_all',
  'expenses:manage',
  // Office Tasks
  'tasks:view',
  'tasks:manage',
  // Fun Team
  'funteam:view',
  'funteam:manage',
  // Policy & Forms
  'policy:view',
  'forms:view',
  // Team
  'team:view',
  // Departments
  'departments:view',
  'departments:create',
  'departments:edit',
  'departments:delete',
  'departments:manage-status',
  // Leave Reports
  'leave_summary:view',
  'monthly_record:view',
];

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },   // e.g. "admin"
  label: { type: String, required: true },                // e.g. "Administrator"
  permissions: [{ type: String }],                        // Dynamic — no enum restriction. Managed via Sync Permissions button.
  appliedMigrations: [{ type: String }],                  // One-time default permission migrations
  isSystem: { type: Boolean, default: false },            // system roles can't be deleted
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

roleSchema.statics.ALL_PERMISSIONS = ALL_PERMISSIONS;

// Seed default roles if they don't exist
roleSchema.statics.seedDefaults = async function () {
  const defaults = [
    {
      name: 'admin',
      label: 'Administrator',
      isSystem: true,
      permissions: ALL_PERMISSIONS,
    },
    {
      name: 'md',
      label: 'Managing Director',
      isSystem: true,
      permissions: ALL_PERMISSIONS,
    },
    {
      name: 'hr',
      label: 'HR Manager',
      isSystem: true,
      permissions: [
        'employees:view', 'employees:create', 'employees:edit',
        'attendance:checkin', 'attendance:checkout', 'attendance:view_own', 'attendance:view_all', 'attendance:dashboard', 'attendance:import', 'attendance:manage_wfh', 'attendance:delete',
        'leaves:apply', 'leaves:view_own', 'leaves:view_all', 'leaves:approve', 'leaves:delete',
        'reports:view', 'reports:export',
        'settings:view',
        'roles:view',
        'hiring:manage', 'training:manage',
        'cafe:view', 'cafe:manage', 'lunch:view', 'lunch:order',
        'documents:view', 'documents:upload', 'documents:manage',
        'announcements:view', 'announcements:create',
        'calendar:view', 'calendar:manage', 'holidays:view', 'holidays:manage',
        'payslips:view_own', 'payslips:view_all', 'payslips:manage',
        'performance:view_own', 'performance:view_all', 'performance:manage',
        'expenses:view_own', 'expenses:view_all', 'expenses:manage',
        'tasks:view', 'tasks:manage',
        'funteam:view', 'funteam:manage',
        'policy:view', 'forms:view', 'team:view',
      ],
    },
    {
      name: 'team_lead',
      label: 'Team Lead',
      isSystem: true,
      permissions: [
        'employees:view',
        'attendance:checkin', 'attendance:checkout', 'attendance:view_own', 'attendance:view_all', 'attendance:dashboard', 'attendance:manage_wfh',
        'leaves:apply', 'leaves:view_own', 'leaves:view_all', 'leaves:approve',
        'reports:view',
        'cafe:view', 'lunch:view', 'lunch:order',
        'documents:view', 'documents:upload',
        'announcements:view',
        'calendar:view', 'holidays:view',
        'payslips:view_own',
        'performance:view_own', 'performance:view_all', 'performance:manage_team',
        'expenses:view_own', 'expenses:view_all',
        'tasks:view', 'tasks:manage',
        'funteam:view',
        'policy:view', 'forms:view', 'team:view',
      ],
    },
    {
      name: 'employee',
      label: 'Employee',
      isSystem: true,
      permissions: [
        'attendance:checkin', 'attendance:checkout', 'attendance:view_own',
        'leaves:apply', 'leaves:view_own',
        'cafe:view', 'lunch:view', 'lunch:order',
        'documents:view', 'documents:upload',
        'announcements:view',
        'calendar:view', 'holidays:view',
        'payslips:view_own',
        'performance:view_own',
        'expenses:view_own',
        'tasks:view',
        'funteam:view',
        'policy:view', 'forms:view', 'team:view',
      ],
    },
  ];

  for (const role of defaults) {
    // Only insert if role doesn't exist yet — NEVER overwrite admin's permission changes
    const exists = await this.findOne({ name: role.name });
    if (!exists) {
      await this.create({ ...role, updatedAt: new Date() });
    }
  }

  // Grant this new scoped permission once on existing installations. The
  // marker ensures a later administrator removal is not undone on restart.
  const teamPerformanceMigration = '2026-07-team-performance-management';
  await this.updateOne(
    { name: 'team_lead', appliedMigrations: { $ne: teamPerformanceMigration } },
    {
      $addToSet: {
        permissions: 'performance:manage_team',
        appliedMigrations: teamPerformanceMigration,
      },
      $set: { updatedAt: new Date() },
    }
  );

  const wfhMigration = '2026-07-urgent-wfh-management';
  await this.updateMany(
    { name: { $in: ['admin', 'hr', 'team_lead'] }, appliedMigrations: { $ne: wfhMigration } },
    {
      $addToSet: { permissions: 'attendance:manage_wfh', appliedMigrations: wfhMigration },
      $set: { updatedAt: new Date() },
    }
  );

  const dashboardMigration = '2026-09-team-lead-dashboard-scoping';
  await this.updateOne(
    { name: 'team_lead', appliedMigrations: { $ne: dashboardMigration } },
    {
      $addToSet: { permissions: 'attendance:dashboard', appliedMigrations: dashboardMigration },
      $set: { updatedAt: new Date() },
    }
  );
};

module.exports = mongoose.model('Role', roleSchema);
