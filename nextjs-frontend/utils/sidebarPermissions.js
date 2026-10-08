/**
 * Auto-generates permission groups for the Roles & Permissions page
 * by extracting all unique `perm` values from the sidebar config.
 *
 * This ensures any new sidebar item with a `perm` field automatically
 * appears in the Roles & Permissions UI without manual configuration.
 *
 * Usage: import { PERMISSION_GROUPS, PERM_LABELS } from '@/utils/sidebarPermissions';
 */

// All permissions in the system — defines the complete permission vocabulary.
// Sidebar `perm` values reference these. Some permissions are sub-permissions
// (e.g., documents:view, documents:upload) not directly on sidebar items but
// still manageable.
const ALL_SYSTEM_PERMISSIONS = {
  // Employees
  'employees:view': 'Users',
  'employees:create': 'Create Users',
  'employees:edit': 'Edit All Users',
  'employees:edit_team': 'Edit Team Only',
  'employees:delete': 'Delete Users',
  // Departments
  'departments:view': 'Departments',
  'departments:create': 'Create Departments',
  'departments:edit': 'Edit Departments',
  'departments:delete': 'Delete Departments',
  'departments:manage-status': 'Activate/Deactivate Departments',
  // Attendance
  'attendance:checkin': 'Check In',
  'attendance:checkout': 'Check Out',
  'attendance:view_own': 'My Attendance',
  'attendance:view_all': 'Attendance',
  'attendance:dashboard': 'Attendance Dashboard',
  'attendance:import': 'Import Biometric Attendance',
  'attendance:manage_wfh': 'Add on WFH',
  // Leaves
  'leaves:apply': 'My Leaves / Apply Leave',
  'leaves:view_own': 'My Leaves',
  'leaves:view_all': 'Leave Requests',
  'leaves:approve': 'Approve/Reject Leaves',
  'leaves:delete': 'Delete Leaves',
  'leave_summary:view': 'Leave Summary',
  'monthly_record:view': 'Monthly Record',
  // HR Tools
  'hiring:manage': 'Hiring',
  'training:manage': 'Training',
  'cv:view': 'Employee CVs',
  'payslips:view_own': 'My Payslips',
  'payslips:view_all': 'Payslips',
  'payslips:manage': 'Manage Payslips',
  'documents:view': 'My Documents',
  'documents:upload': 'Upload Documents',
  'documents:manage': 'Manage Documents',
  'expenses:view_own': 'My Expenses',
  'expenses:view_all': 'Expenses',
  'expenses:manage': 'Manage Expenses',
  // Communication
  'announcements:view': 'Announcements',
  'announcements:create': 'Create Announcements',
  'reports:view': 'View Reports',
  'reports:export': 'Export Reports',
  // Workspace
  'tasks:view': 'Office Tasks',
  'tasks:manage': 'Manage Tasks',
  'calendar:view': 'Calendar',
  'calendar:manage': 'Manage Calendar',
  'calendar:event:create': 'Create Calendar Events',
  'calendar:event:edit': 'Edit Calendar Events',
  'calendar:event:delete': 'Delete Calendar Events',
  'holidays:view': 'Holidays',
  'holidays:manage': 'Manage Holidays',
  'holidays:create': 'Create Holidays',
  'holidays:edit': 'Edit Holidays',
  'holidays:delete': 'Delete Holidays',
  'cafe:view': 'Cafe & Lunch',
  'cafe:manage': 'Cafe Orders',
  'lunch:view': 'Lunch Orders',
  'lunch:order': 'My Orders',
  'team:view': 'The Team',
  'funteam:view': 'Fun Team',
  'funteam:manage': 'Manage Fun Team',
  'policy:view': 'Policy',
  'forms:view': 'Download Forms',
  // Performance
  'performance:view_own': 'My Performance',
  'performance:view_all': 'Performance',
  'performance:manage_team': 'Manage Team Performance',
  'performance:manage': 'Manage All Performance',
  // Admin
  'settings:view': 'Settings / Allocation',
  'settings:edit': 'Edit Settings',
  'roles:view': 'Roles & Permissions',
  'roles:edit': 'Edit Roles',
};

// Permission groups — organized by sidebar sections.
// The Roles & Permissions page renders these as collapsible sections.
const PERMISSION_GROUPS = {
  'People': ['employees:view', 'employees:create', 'employees:edit', 'employees:edit_team', 'employees:delete', 'departments:view', 'departments:create', 'departments:edit', 'departments:delete', 'departments:manage-status'],
  'Attendance': ['attendance:checkin', 'attendance:checkout', 'attendance:view_own', 'attendance:view_all', 'attendance:dashboard', 'attendance:import', 'attendance:manage_wfh'],
  'Leaves': ['leaves:apply', 'leaves:view_own', 'leaves:view_all', 'leaves:approve', 'leaves:delete', 'leave_summary:view', 'monthly_record:view'],
  'HR Tools': ['hiring:manage', 'training:manage', 'cv:view', 'payslips:view_own', 'payslips:view_all', 'payslips:manage', 'documents:view', 'documents:upload', 'documents:manage', 'expenses:view_own', 'expenses:view_all', 'expenses:manage'],
  'Communication': ['announcements:view', 'announcements:create', 'reports:view', 'reports:export'],
  'Workspace': ['tasks:view', 'tasks:manage', 'calendar:view', 'calendar:manage', 'calendar:event:create', 'calendar:event:edit', 'calendar:event:delete', 'holidays:view', 'holidays:manage', 'holidays:create', 'holidays:edit', 'holidays:delete', 'cafe:view', 'cafe:manage', 'lunch:view', 'lunch:order', 'team:view', 'funteam:view', 'funteam:manage', 'policy:view', 'forms:view', 'performance:view_own', 'performance:view_all', 'performance:manage_team', 'performance:manage'],
  'Admin': ['settings:view', 'settings:edit', 'roles:view', 'roles:edit'],
};

// Labels for each permission (used in the UI)
const PERM_LABELS = ALL_SYSTEM_PERMISSIONS;

export { PERMISSION_GROUPS, PERM_LABELS, ALL_SYSTEM_PERMISSIONS };
