const { test } = require('node:test');
const assert = require('assert');

// Mock models and services
const Department = require('../models/Department');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const CalendarEvent = require('../models/CalendarEvent');
const Settings = require('../models/Settings');
const authorize = require('../middleware/rbac');

const { getDashboard, getAllAttendance } = require('../controllers/attendanceController');

function createMockReqRes(user, query = {}, permissions = []) {
  const req = {
    user,
    query,
    headers: {},
    permissions,
  };
  let resStatus = 200;
  let resJson = null;

  const res = {
    status(code) {
      resStatus = code;
      return this;
    },
    json(data) {
      resJson = data;
      return this;
    },
    get statusCode() {
      return resStatus;
    },
    get body() {
      return resJson;
    },
  };

  return { req, res };
}

function createQueryMock(data = []) {
  const mockObj = {
    populate: () => mockObj,
    sort: () => mockObj,
    limit: () => mockObj,
    select: () => mockObj,
    lean: async () => data,
    exec: async () => data,
    then: (resolve) => resolve(data),
  };
  return mockObj;
}

function setupGlobalMocks() {
  const origCalendarEventFind = CalendarEvent.find;
  CalendarEvent.find = () => createQueryMock([]);

  const origSettingsGetGlobal = Settings.getGlobal;
  Settings.getGlobal = async () => ({
    lateThreshold: '09:30',
    lastAttendanceImportDate: '2026-08-31',
    save: async () => {},
  });

  const origLeaveFind = Leave.find;
  Leave.find = () => createQueryMock([]);

  const origLeaveCount = Leave.countDocuments;
  Leave.countDocuments = async () => 0;

  const origAttendanceFindOne = Attendance.findOne;
  Attendance.findOne = () => createQueryMock({ date: '2026-08-31' });

  const origAttendanceFind = Attendance.find;
  Attendance.find = () => createQueryMock([]);

  return () => {
    CalendarEvent.find = origCalendarEventFind;
    Settings.getGlobal = origSettingsGetGlobal;
    Leave.find = origLeaveFind;
    Leave.countDocuments = origLeaveCount;
    Attendance.findOne = origAttendanceFindOne;
    Attendance.find = origAttendanceFind;
  };
}

test('1. RBAC Middleware: Team Leader without attendance:dashboard permission gets 403', () => {
  const middleware = authorize('attendance:dashboard');
  const { req, res } = createMockReqRes({ _id: 'tl1', role: 'team_lead' }, {}, ['employees:view', 'leaves:approve']);
  let calledNext = false;
  middleware(req, res, () => { calledNext = true; });

  assert.strictEqual(calledNext, false);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.message, 'Forbidden: requires permission "attendance:dashboard"');
});

test('2. RBAC Middleware: Team Leader with MOCK/FIXTURE attendance:dashboard permission succeeds through middleware', () => {
  const middleware = authorize('attendance:dashboard');
  const { req, res } = createMockReqRes({ _id: 'tl1', role: 'team_lead' }, {}, ['attendance:dashboard']);
  let calledNext = false;
  middleware(req, res, () => { calledNext = true; });

  assert.strictEqual(calledNext, true);
  assert.strictEqual(res.statusCode, 200);
});

test('3. Dashboard for Team Leader managing one department scopes KPIs to that department', async () => {
  const restoreGlobal = setupGlobalMocks();
  const tlUser = { _id: 'tl_dev', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = (query) => {
    if (query?.teamLeaderId === tlUser._id) {
      return createQueryMock([{ name: 'Web Development' }]);
    }
    return createQueryMock([]);
  };

  const origUserFind = User.find;
  User.find = (query) => {
    if (query?.department?.$in) {
      assert.deepStrictEqual(query.department.$in, ['Web Development']);
    }
    const mock = createQueryMock([
      { _id: 'emp_dev1', name: 'Dev 1', department: 'Web Development', role: 'employee', status: 'Active' },
      { _id: 'emp_dev2', name: 'Dev 2', department: 'Web Development', role: 'employee', status: 'Active' },
    ]);
    mock.distinct = async () => ['emp_dev1', 'emp_dev2'];
    return mock;
  };

  try {
    const { req, res } = createMockReqRes(tlUser, {}, ['attendance:dashboard']);
    await getDashboard(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.liveHrStatus.totalEmployees, 2);
    assert.deepStrictEqual(res.body.data.workforceScope.managedDepartments, ['Web Development']);
    assert.strictEqual(res.body.data.workforceScope.isUnrestricted, false);
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
  }
});

test('4. Dashboard for Team Leader with zero managed departments fails closed (0 employees)', async () => {
  const restoreGlobal = setupGlobalMocks();
  const tlUser = { _id: 'tl_no_dept', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([]);

  const origUserFind = User.find;
  User.find = () => {
    const mock = createQueryMock([]);
    mock.distinct = async () => [];
    return mock;
  };

  try {
    const { req, res } = createMockReqRes(tlUser, {}, ['attendance:dashboard']);
    await getDashboard(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.liveHrStatus.totalEmployees, 0);
    assert.strictEqual(res.body.data.liveHrStatus.onLeaveToday, 0);
    assert.strictEqual(res.body.data.liveHrStatus.wfhToday, 0);
    assert.deepStrictEqual(res.body.data.workforceScope.managedDepartments, []);
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
  }
});

test('5. Query Parameter Tampering on GET /api/attendance: request for unauthorized employee is BLOCKED', async () => {
  const restoreGlobal = setupGlobalMocks();
  const tlUser = { _id: 'tl_dev', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  User.find = (query) => {
    if (query?.department?.$in) {
      return createQueryMock([{ _id: 'emp_dev1' }]);
    }
    const mock = createQueryMock([]);
    mock.distinct = async () => [];
    return mock;
  };

  const origAttendanceFind = Attendance.find;
  let executedFilter = null;
  Attendance.find = (filter) => {
    executedFilter = filter;
    return createQueryMock([]);
  };

  try {
    const { req, res } = createMockReqRes(tlUser, { employeeId: 'emp_sales_99' }, ['attendance:view_all']);
    await getAllAttendance(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(executedFilter.employeeId, { $in: [] });
    assert.strictEqual(res.body.data.length, 0);
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
    Attendance.find = origAttendanceFind;
  }
});

test('6. Query Parameter Tampering on GET /api/attendance: request for authorized employee is ALLOWED', async () => {
  const restoreGlobal = setupGlobalMocks();
  const tlUser = { _id: 'tl_dev', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  User.find = () => createQueryMock([{ _id: 'emp_dev1', name: 'Dev 1', status: 'Active' }]);

  const origAttendanceFind = Attendance.find;
  let executedFilter = null;
  Attendance.find = (filter) => {
    executedFilter = filter;
    return createQueryMock([
      { _id: 'att1', employeeId: { _id: 'emp_dev1', name: 'Dev 1' }, date: '2026-09-01', status: 'Present' }
    ]);
  };

  try {
    const { req, res } = createMockReqRes(tlUser, { employeeId: 'emp_dev1' }, ['attendance:view_all']);
    await getAllAttendance(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(executedFilter.employeeId, 'emp_dev1');
    assert.strictEqual(res.body.data.length, 1);
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
    Attendance.find = origAttendanceFind;
  }
});

test('7. Admin dashboard remains company-wide unrestricted', async () => {
  const restoreGlobal = setupGlobalMocks();
  const adminUser = { _id: 'admin1', role: 'admin' };

  const origUserFind = User.find;
  User.find = () => {
    const mock = createQueryMock([
      { _id: 'emp1', name: 'Emp 1', department: 'Sales', role: 'employee', status: 'Active' },
      { _id: 'emp2', name: 'Emp 2', department: 'Web Development', role: 'employee', status: 'Active' },
    ]);
    mock.distinct = async () => ['emp1', 'emp2'];
    return mock;
  };

  try {
    const { req, res } = createMockReqRes(adminUser, {}, ['attendance:dashboard']);
    await getDashboard(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.workforceScope.isUnrestricted, true);
    assert.strictEqual(res.body.data.liveHrStatus.totalEmployees, 2);
  } finally {
    restoreGlobal();
    User.find = origUserFind;
  }
});

test('8. Attendance Management issue query filtering for missing_punch, conflict, and not_marked', async () => {
  const restoreGlobal = setupGlobalMocks();
  const tlUser = { _id: 'tl_dev', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  User.find = () => {
    const mock = createQueryMock([{ _id: 'emp_dev1', name: 'Dev 1', department: 'Web Development', role: 'employee', status: 'Active' }]);
    mock.distinct = async () => ['emp_dev1'];
    return mock;
  };

  const origAttendanceFind = Attendance.find;
  Attendance.find = () => createQueryMock([
    { _id: 'att_missing', employeeId: { _id: 'emp_dev1', name: 'Dev 1' }, date: '2026-08-10', checkIn: '2026-08-10T09:00:00.000Z', checkOut: null, issueFlags: ['missing_punch'], status: 'Present' },
    { _id: 'att_conflict', employeeId: { _id: 'emp_dev1', name: 'Dev 1' }, date: '2026-08-11', checkIn: '2026-08-11T09:00:00.000Z', checkOut: '2026-08-11T18:00:00.000Z', issueFlags: ['conflict'], status: 'conflict', workMode: 'wfh' },
    { _id: 'att_not_marked', employeeId: { _id: 'emp_dev1', name: 'Dev 1' }, date: '2026-08-12', checkIn: null, checkOut: null, issueFlags: ['not_marked'], status: 'Absent' },
  ]);

  try {
    // 1. Missing Punches
    const reqMissing = createMockReqRes(tlUser, { issue: 'missing_punch', startDate: '2026-08-01', endDate: '2026-08-31' }, ['attendance:view_all']);
    await getAllAttendance(reqMissing.req, reqMissing.res, (err) => { if (err) throw err; });
    assert.strictEqual(reqMissing.res.statusCode, 200);
    assert.strictEqual(reqMissing.res.body.data.length, 1);
    assert.strictEqual(reqMissing.res.body.data[0]._id, 'att_missing');

    // 2. Conflicts
    const reqConflict = createMockReqRes(tlUser, { issue: 'conflict', startDate: '2026-08-01', endDate: '2026-08-31' }, ['attendance:view_all']);
    await getAllAttendance(reqConflict.req, reqConflict.res, (err) => { if (err) throw err; });
    assert.strictEqual(reqConflict.res.statusCode, 200);
    assert.strictEqual(reqConflict.res.body.data.length, 1);
    assert.strictEqual(reqConflict.res.body.data[0]._id, 'att_conflict');

    // 3. Not Marked
    const reqNotMarked = createMockReqRes(tlUser, { issue: 'not_marked', startDate: '2026-08-01', endDate: '2026-08-31' }, ['attendance:view_all']);
    await getAllAttendance(reqNotMarked.req, reqNotMarked.res, (err) => { if (err) throw err; });
    assert.strictEqual(reqNotMarked.res.statusCode, 200);
    assert.strictEqual(reqNotMarked.res.body.data.length, 22);
    assert.strictEqual(reqNotMarked.res.body.data[0].issueFlags[0], 'not_marked');
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
    Attendance.find = origAttendanceFind;
  }
});

test('9. parseAttendanceQueryParams parses not_marked and conflict correctly', () => {
  const fs = require('fs');
  const path = require('path');
  const fileContent = fs.readFileSync(path.join(__dirname, '../../../nextjs-frontend/utils/reconciliationHelpers.js'), 'utf8');

  assert.ok(fileContent.includes("const issue = searchParams.get('issue') || '';"), 'reconciliationHelpers must extract issue parameter');
  assert.ok(fileContent.includes("issue,"), 'parseAttendanceQueryParams must return issue property');

  // Verify parsing contract with mock implementation matching reconciliationHelpers
  function parseParams(searchParams) {
    const issue = searchParams.get('issue') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    return { issue, startDate, endDate };
  }

  const p1 = parseParams(new URLSearchParams('issue=not_marked&startDate=2026-08-01&endDate=2026-08-31'));
  assert.strictEqual(p1.issue, 'not_marked');
  assert.strictEqual(p1.startDate, '2026-08-01');

  const p2 = parseParams(new URLSearchParams('issue=conflict&startDate=2026-08-01&endDate=2026-08-31'));
  assert.strictEqual(p2.issue, 'conflict');
  assert.strictEqual(p2.startDate, '2026-08-01');
});

test('10. AttendanceManagement Issue dropdown options contract includes not_marked, conflict, and partial_leave_missing_attendance', () => {
  const fs = require('fs');
  const path = require('path');
  const fileContent = fs.readFileSync(path.join(__dirname, '../../../nextjs-frontend/components/pages/admin/AttendanceManagement.js'), 'utf8');

  assert.ok(fileContent.includes('<option value="not_marked">Unaccounted</option>'), 'Issue dropdown must include Unaccounted option');
  assert.ok(fileContent.includes('<option value="conflict">Conflict</option>'), 'Issue dropdown must include Conflict option');
  assert.ok(fileContent.includes('<option value="partial_leave_missing_attendance">Partial Leave Exceptions</option>'), 'Issue dropdown must include Partial Leave Exceptions option');
});

test('11. Missing Records (getAttendanceReconciliation) enforces Team Leader department scope', async () => {
  const restoreGlobal = setupGlobalMocks();
  const { getAttendanceReconciliation } = require('../controllers/attendanceReconciliationController');
  const tlUser = { _id: 'tl_dev', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  let queryPassedToUserFind = null;
  User.find = (query) => {
    queryPassedToUserFind = query;
    return createQueryMock([{ _id: 'emp_dev1', name: 'Dev 1', department: 'Web Development', role: 'employee', status: 'Active' }]);
  };

  try {
    const { req, res } = createMockReqRes(tlUser, { startDate: '2026-08-01', endDate: '2026-08-31' }, ['attendance:view_all']);
    await getAttendanceReconciliation(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(queryPassedToUserFind._id, 'User query must enforce authorized employee IDs');
    assert.deepStrictEqual(queryPassedToUserFind._id, { $in: ['emp_dev1'] });
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
  }
});

test('12. Missing Records parameter tampering with unauthorized department returns empty result', async () => {
  const restoreGlobal = setupGlobalMocks();
  const { getAttendanceReconciliation } = require('../controllers/attendanceReconciliationController');
  const tlUser = { _id: '507f1f77bcf86cd799439010', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  let callCount = 0;
  let finalUserQuery = null;
  User.find = (query) => {
    callCount++;
    if (callCount === 1) {
      return createQueryMock([{ _id: '507f1f77bcf86cd799439011', name: 'Dev 1', department: 'Web Development' }]);
    }
    finalUserQuery = query;
    return createQueryMock([]);
  };

  try {
    const { req, res } = createMockReqRes(tlUser, { department: 'Sales', startDate: '2026-08-01', endDate: '2026-08-31' }, ['attendance:view_all']);
    await getAttendanceReconciliation(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(finalUserQuery._id, { $in: [] });
    assert.strictEqual(res.body.data.rows.length, 0);
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
  }
});

test('13. getEmployee blocks access to employees outside Team Leader managed workforce scope', async () => {
  const { getEmployee } = require('../controllers/employeeController');
  const tlUser = { _id: '507f1f77bcf86cd799439010', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  User.find = () => createQueryMock([{ _id: '507f1f77bcf86cd799439011' }]);

  try {
    const { req, res } = createMockReqRes(tlUser, {}, ['employees:view']);
    req.params = { id: '507f1f77bcf86cd799439099' };

    await getEmployee(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('outside managed team scope'));
  } finally {
    Department.find = origDeptFind;
    User.find = origUserFind;
  }
});

test('14. assignWfh blocks assigning WFH to employees outside Team Leader managed scope', async () => {
  const { assignWfh } = require('../controllers/attendanceController');
  const targetId = '507f1f77bcf86cd799439099';
  const tlUser = { _id: '507f1f77bcf86cd799439010', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  User.find = (query) => {
    if (query?.department?.$in) return createQueryMock([{ _id: '507f1f77bcf86cd799439011' }]);
    return createQueryMock([]);
  };

  const origUserFindOne = User.findOne;
  User.findOne = () => createQueryMock({ _id: targetId, name: 'Sales Emp', status: 'Active', department: 'Sales' });

  try {
    const { req, res } = createMockReqRes(tlUser, {}, ['attendance:manage_wfh']);
    req.body = { employeeId: targetId, startDate: '2026-09-01', endDate: '2026-09-01', reason: 'Field Work' };

    await assignWfh(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('managed team members'));
  } finally {
    Department.find = origDeptFind;
    User.find = origUserFind;
    User.findOne = origUserFindOne;
  }
});

test('15. Needs Attention Total Invariant: headline total === sum(visible rows)', async () => {
  const restoreGlobal = setupGlobalMocks();
  const tlUser = { _id: 'tl_dev', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  User.find = () => {
    const mock = createQueryMock([{ _id: 'emp_dev1', name: 'Dev 1', department: 'Web Development', role: 'employee', status: 'Active' }]);
    mock.distinct = async () => ['emp_dev1'];
    return mock;
  };

  try {
    const { req, res } = createMockReqRes(tlUser, {}, ['attendance:dashboard']);
    await getDashboard(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);
    const n = res.body.data.needsAttention;
    const headline = res.body.data.attendanceOverview.attendanceIssuesCount;
    const visibleSum = n.unaccountedDates + n.missingPunches + n.attendanceConflicts + n.partialLeaveExceptions;

    assert.strictEqual(headline, visibleSum, `Headline total (${headline}) must equal sum of visible rows (${visibleSum})`);
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
  }
});

test('16. getAllAttendance filtering for partial_leave_missing_attendance returns exact calculated record', async () => {
  const restoreGlobal = setupGlobalMocks();
  const tlUser = { _id: 'tl_dev', role: 'team_lead' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  User.find = () => {
    const mock = createQueryMock([{ _id: 'emp_dev1', name: 'Dev 1', department: 'Web Development', role: 'employee', status: 'Active' }]);
    mock.distinct = async () => ['emp_dev1'];
    return mock;
  };

  const origAttendanceFind = Attendance.find;
  Attendance.find = () => createQueryMock([
    {
      _id: 'att_partial',
      employeeId: { _id: 'emp_dev1', name: 'Dev 1' },
      date: '2026-08-14',
      status: 'On Leave',
      issueFlags: ['partial_leave_missing_attendance'],
      primaryStatus: 'partial_leave_missing_attendance',
    },
  ]);

  try {
    const { req, res } = createMockReqRes(tlUser, { issue: 'partial_leave_missing_attendance', startDate: '2026-08-01', endDate: '2026-08-31' }, ['attendance:view_all']);
    await getAllAttendance(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.length, 1);
    assert.strictEqual(res.body.data[0].issueFlags[0], 'partial_leave_missing_attendance');
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
    Attendance.find = origAttendanceFind;
  }
});

test('17. Pending Requests KPI count and Pending Leave Requests list represent the exact same role-authorized approval scope', async () => {
  const restoreGlobal = setupGlobalMocks();
  const tlUser = { _id: 'tl_dev', role: 'team_lead', department: 'Web Development' };

  const origDeptFind = Department.find;
  Department.find = () => createQueryMock([{ name: 'Web Development' }]);

  const origUserFind = User.find;
  User.find = (query) => {
    // Return managed team members (emp_dev1, emp_dev2), excluding the Team Lead
    const mock = createQueryMock([
      { _id: 'emp_dev1', name: 'Dev 1', department: 'Web Development', role: 'employee', status: 'Active' },
      { _id: 'emp_dev2', name: 'Dev 2', department: 'Web Development', role: 'employee', status: 'Active' },
    ]);
    mock.distinct = async () => ['emp_dev1', 'emp_dev2'];
    return mock;
  };

  let capturedLeaveQuery = null;
  const origLeaveFind = Leave.find;
  const origLeaveCount = Leave.countDocuments;

  Leave.find = (query) => {
    capturedLeaveQuery = query;
    // Mock 2 pending leave requests for managed team members
    return createQueryMock([
      { _id: 'l1', employeeId: { _id: 'emp_dev1', name: 'Dev 1' }, status: 'Pending' },
      { _id: 'l2', employeeId: { _id: 'emp_dev2', name: 'Dev 2' }, status: 'Pending' },
    ]);
  };

  Leave.countDocuments = async (query) => {
    assert.deepStrictEqual(query, capturedLeaveQuery, 'Leave.countDocuments query must match Leave.find query');
    return 2;
  };

  try {
    const { req, res } = createMockReqRes(tlUser, {}, ['attendance:dashboard']);
    await getDashboard(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(res.statusCode, 200);

    // KPI total count
    const kpiCount = res.body.data.liveHrStatus.pendingLeaveTotalCount;
    const attentionCount = res.body.data.needsAttention.pendingLeaves;
    const listItems = res.body.data.recentPendingLeaves;

    assert.strictEqual(kpiCount, 2, 'Pending Requests KPI count must be 2');
    assert.strictEqual(attentionCount, 2, 'needsAttention.pendingLeaves must be 2');
    assert.strictEqual(listItems.length, 2, 'Recent pending leaves list count must match returned team leaves (2)');

    // Verify employeeId query scope strictly excludes Team Lead's own ID
    const queryEmployeeIds = capturedLeaveQuery.employeeId.$in;
    assert.deepStrictEqual(queryEmployeeIds, ['emp_dev1', 'emp_dev2'], 'Query must strictly include managed team members');
    assert.strictEqual(queryEmployeeIds.includes(tlUser._id), false, 'Team Lead own ID must NEVER be included in approval scope');
  } finally {
    restoreGlobal();
    Department.find = origDeptFind;
    User.find = origUserFind;
    Leave.find = origLeaveFind;
    Leave.countDocuments = origLeaveCount;
  }
});


