const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Role = require('../../models/Role');
const Payslip = require('../../models/Payslip');
const EmployeeDocument = require('../../models/EmployeeDocument');

const PASSWORD = 'Test@12345';

async function seedRoles() {
  await Role.seedDefaults();
}

async function createUser({ name, email, role, status = 'Active', employeeId }) {
  return User.create({
    name,
    email,
    password: PASSWORD,
    role,
    status,
    department: 'Engineering',
    employeeId,
  });
}

async function seedUsers() {
  const employee = await createUser({
    name: 'Test Employee',
    email: 'employee@test.com',
    role: 'employee',
    employeeId: 'EMP-0001',
  });
  const otherEmployee = await createUser({
    name: 'Other Employee',
    email: 'other@test.com',
    role: 'employee',
    employeeId: 'EMP-0002',
  });
  const hrUser = await createUser({
    name: 'Test HR',
    email: 'hr@test.com',
    role: 'hr',
    employeeId: 'EMP-0003',
  });
  const inactiveEmployee = await createUser({
    name: 'Inactive Employee',
    email: 'inactive@test.com',
    role: 'employee',
    status: 'Inactive',
    employeeId: 'EMP-0004',
  });

  return { employee, otherEmployee, hrUser, inactiveEmployee, password: PASSWORD };
}

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function authHeader(userId) {
  return { Authorization: `Bearer ${signToken(userId)}` };
}

async function seedPayslips(employee, otherEmployee) {
  const [ownDraft, ownPublished, otherDraft] = await Promise.all([
    Payslip.create({ employeeId: employee._id, month: 1, year: 2026, status: 'Draft', basicSalary: 50000 }),
    Payslip.create({ employeeId: employee._id, month: 2, year: 2026, status: 'Published', basicSalary: 50000 }),
    Payslip.create({ employeeId: otherEmployee._id, month: 1, year: 2026, status: 'Published', basicSalary: 60000 }),
  ]);
  return { ownDraft, ownPublished, otherDraft };
}

async function seedDocument(employee, filename = 'test-doc.pdf') {
  return EmployeeDocument.create({
    employeeId: employee._id,
    title: 'Test Document',
    category: 'Other',
    fileUrl: `/uploads/documents/${filename}`,
    fileName: filename,
    fileSize: '10 KB',
    mimeType: 'application/pdf',
    uploadedBy: employee._id,
    status: 'Pending',
  });
}

module.exports = {
  PASSWORD,
  seedRoles,
  seedUsers,
  signToken,
  authHeader,
  seedPayslips,
  seedDocument,
};
