const { test } = require('node:test');
const assert = require('assert');
const { resolveAuthorizedWorkforceScope } = require('../services/scopeService');

// Mock dependencies
const Department = require('../models/Department');
const User = require('../models/User');

test('1. Admin role is unrestricted', async () => {
  const adminUser = { _id: 'admin1', role: 'admin' };
  const scope = await resolveAuthorizedWorkforceScope(adminUser);
  assert.strictEqual(scope.isUnrestricted, true);
  assert.strictEqual(scope.managedDepartments, null);
  assert.strictEqual(scope.authorizedEmployeeIds, null);
});

test('2. HR role is unrestricted', async () => {
  const hrUser = { _id: 'hr1', role: 'hr' };
  const scope = await resolveAuthorizedWorkforceScope(hrUser);
  assert.strictEqual(scope.isUnrestricted, true);
  assert.strictEqual(scope.managedDepartments, null);
  assert.strictEqual(scope.authorizedEmployeeIds, null);
});

test('3. Team Leader with zero managed departments fails closed', async () => {
  const origDeptFind = Department.find;
  Department.find = () => ({
    select: () => ({
      lean: async () => [],
    }),
  });

  try {
    const tlUser = { _id: 'tl_no_dept', role: 'team_lead' };
    const scope = await resolveAuthorizedWorkforceScope(tlUser);
    assert.strictEqual(scope.isUnrestricted, false);
    assert.deepStrictEqual(scope.managedDepartments, []);
    assert.deepStrictEqual(scope.authorizedEmployeeIds, []);
  } finally {
    Department.find = origDeptFind;
  }
});

test('4. Team Leader managing one department authorizes employees in that department', async () => {
  const tlId = 'tl_web_dev';
  
  const origDeptFind = Department.find;
  Department.find = (query) => {
    assert.strictEqual(String(query.teamLeaderId), tlId);
    assert.strictEqual(query.status, 'active');
    return {
      select: () => ({
        lean: async () => [{ name: 'Web Development' }],
      }),
    };
  };

  const origUserFind = User.find;
  User.find = (query) => {
    assert.deepStrictEqual(query.department, { $in: ['Web Development'] });
    assert.strictEqual(query.status, 'Active');
    return {
      select: () => ({
        lean: async () => [
          { _id: 'emp1' },
          { _id: 'emp2' },
          { _id: tlId },
        ],
      }),
    };
  };

  try {
    const tlUser = { _id: tlId, role: 'team_lead' };
    const scope = await resolveAuthorizedWorkforceScope(tlUser);

    assert.strictEqual(scope.isUnrestricted, false);
    assert.deepStrictEqual(scope.managedDepartments, ['Web Development']);
    assert.deepStrictEqual(
      scope.authorizedEmployeeIds.map(String),
      ['emp1', 'emp2', tlId]
    );
  } finally {
    Department.find = origDeptFind;
    User.find = origUserFind;
  }
});

test('5. Team Leader managing multiple departments authorizes employees across all managed departments', async () => {
  const tlId = 'tl_multi';

  const origDeptFind = Department.find;
  Department.find = () => ({
    select: () => ({
      lean: async () => [
        { name: 'Business Development' },
        { name: 'Web & Software Testing' },
      ],
    }),
  });

  const origUserFind = User.find;
  User.find = (query) => {
    assert.deepStrictEqual(query.department, {
      $in: ['Business Development', 'Web & Software Testing'],
    });
    return {
      select: () => ({
        lean: async () => [
          { _id: 'emp_bd_1' },
          { _id: 'emp_qa_1' },
        ],
      }),
    };
  };

  try {
    const tlUser = { _id: tlId, role: 'team_lead' };
    const scope = await resolveAuthorizedWorkforceScope(tlUser);

    assert.strictEqual(scope.isUnrestricted, false);
    assert.deepStrictEqual(scope.managedDepartments, ['Business Development', 'Web & Software Testing']);
    assert.deepStrictEqual(
      scope.authorizedEmployeeIds.map(String),
      ['emp_bd_1', 'emp_qa_1']
    );
  } finally {
    Department.find = origDeptFind;
    User.find = origUserFind;
  }
});

test('6. Direct reports (teamLeadId) in UNMANAGED departments are NOT authorized', async () => {
  const tlId = 'tl_dept_a';

  const origDeptFind = Department.find;
  Department.find = () => ({
    select: () => ({
      lean: async () => [{ name: 'Department A' }],
    }),
  });

  const origUserFind = User.find;
  User.find = (query) => {
    assert.deepStrictEqual(query.department, { $in: ['Department A'] });
    assert.strictEqual(query.teamLeadId, undefined);
    return {
      select: () => ({
        lean: async () => [{ _id: 'emp_in_dept_a' }],
      }),
    };
  };

  try {
    const tlUser = { _id: tlId, role: 'team_lead' };
    const scope = await resolveAuthorizedWorkforceScope(tlUser);
    assert.deepStrictEqual(scope.authorizedEmployeeIds.map(String), ['emp_in_dept_a']);
  } finally {
    Department.find = origDeptFind;
    User.find = origUserFind;
  }
});

test('7. Inactive departments are excluded', async () => {
  const origDeptFind = Department.find;
  Department.find = (query) => {
    assert.strictEqual(query.status, 'active');
    return {
      select: () => ({
        lean: async () => [],
      }),
    };
  };

  try {
    const scope = await resolveAuthorizedWorkforceScope({ _id: 'tl1', role: 'team_lead' });
    assert.deepStrictEqual(scope.managedDepartments, []);
    assert.deepStrictEqual(scope.authorizedEmployeeIds, []);
  } finally {
    Department.find = origDeptFind;
  }
});
