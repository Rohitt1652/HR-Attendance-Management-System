const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveRoleForCreate,
  applyRoleUpdatePolicy,
  canAccessPayslip,
  canDownloadPayslipPdf,
  canModifyLeave,
  canDeleteDocument,
} = require('./accessControl');

const adminReq = { permissions: ['roles:edit', 'employees:create', 'payslips:manage', 'payslips:view_own'] };
const hrReq = { permissions: ['employees:create', 'payslips:view_all'], user: { _id: 'hr1' } };
const employeeReq = {
  permissions: ['payslips:view_own', 'leaves:apply', 'documents:upload'],
  user: { _id: 'emp1', role: 'employee' },
};

test('resolveRoleForCreate blocks privileged roles without roles:edit', () => {
  assert.throws(
    () => resolveRoleForCreate(hrReq, 'admin'),
    (err) => err.status === 403
  );
  assert.equal(resolveRoleForCreate(hrReq, 'team_lead'), 'team_lead');
  assert.equal(resolveRoleForCreate(adminReq, 'admin'), 'admin');
});

test('applyRoleUpdatePolicy strips role unless caller can edit roles', () => {
  const updates = applyRoleUpdatePolicy(hrReq, { name: 'A', role: 'admin' });
  assert.equal(updates.name, 'A');
  assert.equal(updates.role, undefined);

  const adminUpdates = applyRoleUpdatePolicy(adminReq, { role: 'hr' });
  assert.equal(adminUpdates.role, 'hr');
});

test('canAccessPayslip enforces ownership and published status', () => {
  const ownPublished = {
    employeeId: { _id: 'emp1' },
    status: 'Published',
  };
  const ownDraft = {
    employeeId: { _id: 'emp1' },
    status: 'Draft',
  };
  const otherPublished = {
    employeeId: { _id: 'emp2' },
    status: 'Published',
  };

  assert.equal(canAccessPayslip(employeeReq, ownPublished), true);
  assert.equal(canAccessPayslip(employeeReq, ownDraft), false);
  assert.equal(canAccessPayslip(employeeReq, otherPublished), false);
  assert.equal(canAccessPayslip(hrReq, otherPublished), true);
  assert.equal(canDownloadPayslipPdf(employeeReq, ownDraft), false);
});

test('canModifyLeave respects ownership and HR permissions', () => {
  const ownPending = { employeeId: 'emp1', status: 'Pending' };
  const ownApproved = { employeeId: 'emp1', status: 'Approved' };
  const otherPending = { employeeId: 'emp2', status: 'Pending' };
  const hrReq = { permissions: ['leaves:delete'], user: { _id: 'hr1' } };

  assert.equal(canModifyLeave(employeeReq, ownPending), true);
  assert.equal(canModifyLeave(employeeReq, ownApproved), false);
  assert.equal(canModifyLeave(employeeReq, otherPending), false);
  assert.equal(canModifyLeave(hrReq, otherPending), true);
});

test('canDeleteDocument blocks verified docs for employees', () => {
  const ownPending = { employeeId: 'emp1', status: 'Pending' };
  const ownVerified = { employeeId: 'emp1', status: 'Verified' };
  const hrReq = { permissions: ['documents:manage'], user: { _id: 'hr1' } };

  assert.equal(canDeleteDocument(employeeReq, ownPending), true);
  assert.equal(canDeleteDocument(employeeReq, ownVerified), false);
  assert.equal(canDeleteDocument(hrReq, ownVerified), true);
});
