/**
 * Comprehensive Dummy Data Seeder for XPS Portal
 * 
 * Usage:
 *   node seed-dummy-data.js
 */

const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (_) {}

require('dotenv').config();
const mongoose = require('mongoose');

// Models
const Role = require('./src/models/Role');
const Department = require('./src/models/Department');
const User = require('./src/models/User');
const LeaveType = require('./src/models/LeaveType');
const LeaveAllocation = require('./src/models/LeaveAllocation');
const Leave = require('./src/models/Leave');
const Attendance = require('./src/models/Attendance');
const CalendarEvent = require('./src/models/CalendarEvent');
const Announcement = require('./src/models/Announcement');
const Policy = require('./src/models/Policy');
const OfficeTask = require('./src/models/OfficeTask');
const Expense = require('./src/models/Expense');
const CafeMenu = require('./src/models/CafeMenu');
const CafeOrder = require('./src/models/CafeOrder');
const Payslip = require('./src/models/Payslip');
const PerformanceReview = require('./src/models/PerformanceReview');
const JobPosting = require('./src/models/JobPosting');
const Candidate = require('./src/models/Candidate');
const Interview = require('./src/models/Interview');
const FunTeam = require('./src/models/FunTeam');
const Notification = require('./src/models/Notification');
const Settings = require('./src/models/Settings');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not set in backend/.env');
  process.exit(1);
}

const DEFAULT_PASSWORD = 'Password@123';

async function seed() {
  console.log('🔄 Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected to MongoDB Atlas:', mongoose.connection.name);

  // 1. Roles
  console.log('\n[1/16] Seeding System Roles...');
  await Role.seedDefaults();
  console.log('   ✓ System Roles ready');

  // 2. Settings
  console.log('\n[2/16] Initializing Global Settings...');
  let settings = await Settings.findOne({ key: 'global' });
  if (!settings) {
    settings = await Settings.create({
      key: 'global',
      companyName: 'WorkforceOS',
      companyTagline: 'Smart HR & Attendance Management System',
      companyEmail: 'admin@workforceos.local',
      companyPhone: '+91 98765 43210',
      companyAddress: 'Corporate Headquarters',
      companyWebsite: 'https://workforceos.local',
      officeStartTime: '09:00',
      lateThreshold: '10:00',
      fullDayRequiredHours: 9,
      halfDayRequiredHours: 4.5,
      saturdayRequiredHours: 4,
      saturdayOffRule: 'second_fourth_off',
      weekendDays: [0, 6],
    });
  } else {
    settings.companyName = 'WorkforceOS';
    settings.companyTagline = 'Smart HR & Attendance Management System';
    await settings.save();
  }
  console.log('   ✓ Global settings initialized');

  // 3. Departments
  console.log('\n[3/16] Seeding Departments...');
  const departmentData = [
    { name: 'Engineering', description: 'Software Development & Systems Architecture' },
    { name: 'Quality Assurance', description: 'Software Testing, Automation & Quality Control' },
    { name: 'Human Resources', description: 'People Operations, Recruitment & Culture' },
    { name: 'Sales & Marketing', description: 'Business Growth, Outreach & Client Relations' },
    { name: 'Finance & Accounts', description: 'Financial Planning, Payroll & Tax Compliance' },
    { name: 'Operations & Logistics', description: 'Facilities Management, Supply & Process Efficiency' },
    { name: 'UI/UX Design', description: 'Product Design, Prototyping & User Research' },
    { name: 'IT Support & Infra', description: 'Network, Hardware & Cloud Infrastructure' },
  ];

  const departmentsMap = {};
  for (const dept of departmentData) {
    let doc = await Department.findOne({ name: dept.name });
    if (!doc) {
      doc = await Department.create(dept);
    }
    departmentsMap[dept.name] = doc;
  }
  console.log(`   ✓ ${Object.keys(departmentsMap).length} departments ready`);

  // 4. Users
  console.log('\n[4/16] Seeding Users with Passwords & Profiles...');
  const usersToCreate = [
    {
      employeeId: 'EMP-0001',
      biometricId: '1001',
      name: 'Rajesh Sharma',
      email: 'admin@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'admin',
      department: 'IT Support & Infra',
      designation: 'Chief Technology Officer',
      phone: '9876543201',
      basicSalary: 120000,
      hra: 40000,
      allowances: 20000,
      deductions: 10000,
      tax: 15000,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RajeshSharma',
      joiningDate: new Date('2022-01-15'),
      dateOfBirth: new Date('1988-06-12'),
    },
    {
      employeeId: 'EMP-0002',
      biometricId: '1002',
      name: 'Vikram Malhotra',
      email: 'md@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'md',
      department: 'Operations & Logistics',
      designation: 'Managing Director',
      phone: '9876543202',
      basicSalary: 150000,
      hra: 50000,
      allowances: 30000,
      deductions: 12000,
      tax: 20000,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=VikramMalhotra',
      joiningDate: new Date('2021-03-01'),
      dateOfBirth: new Date('1982-11-20'),
    },
    {
      employeeId: 'EMP-0003',
      biometricId: '1003',
      name: 'Pooja Verma',
      email: 'hr@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'hr',
      department: 'Human Resources',
      designation: 'Senior HR Manager',
      phone: '9876543203',
      basicSalary: 75000,
      hra: 25000,
      allowances: 15000,
      deductions: 6000,
      tax: 8000,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=PoojaVerma',
      joiningDate: new Date('2022-06-10'),
      dateOfBirth: new Date('1992-04-14'),
    },
    {
      employeeId: 'EMP-0004',
      biometricId: '1004',
      name: 'Amit Kumar',
      email: 'tl.eng@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'team_lead',
      department: 'Engineering',
      designation: 'Principal Engineering Lead',
      phone: '9876543204',
      basicSalary: 95000,
      hra: 30000,
      allowances: 18000,
      deductions: 8000,
      tax: 12000,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AmitKumar',
      joiningDate: new Date('2022-09-01'),
      dateOfBirth: new Date('1990-08-25'),
    },
    {
      employeeId: 'EMP-0005',
      biometricId: '1005',
      name: 'Sneha Patel',
      email: 'tl.qa@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'team_lead',
      department: 'Quality Assurance',
      designation: 'QA Lead',
      phone: '9876543205',
      basicSalary: 85000,
      hra: 28000,
      allowances: 15000,
      deductions: 7000,
      tax: 10000,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=SnehaPatel',
      joiningDate: new Date('2023-01-15'),
      dateOfBirth: new Date('1991-12-05'),
    },
    {
      employeeId: 'EMP-0006',
      biometricId: '1006',
      name: 'Rahul Singh',
      email: 'rahul@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'employee',
      department: 'Engineering',
      designation: 'Senior Full Stack Developer',
      phone: '9876543206',
      basicSalary: 60000,
      hra: 20000,
      allowances: 12000,
      deductions: 5000,
      tax: 6000,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RahulSingh',
      joiningDate: new Date('2023-04-10'),
      dateOfBirth: new Date('1995-02-18'),
    },
    {
      employeeId: 'EMP-0007',
      biometricId: '1007',
      name: 'Priya Nair',
      email: 'priya@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'employee',
      department: 'Engineering',
      designation: 'Frontend Engineer',
      phone: '9876543207',
      basicSalary: 52000,
      hra: 18000,
      allowances: 10000,
      deductions: 4500,
      tax: 5000,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=PriyaNair',
      joiningDate: new Date('2023-08-01'),
      dateOfBirth: new Date('1996-09-30'),
    },
    {
      employeeId: 'EMP-0008',
      biometricId: '1008',
      name: 'Rohit Deshmukh',
      email: 'rohit@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'employee',
      department: 'Quality Assurance',
      designation: 'Automation Test Engineer',
      phone: '9876543208',
      basicSalary: 48000,
      hra: 16000,
      allowances: 9000,
      deductions: 4000,
      tax: 4200,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RohitDeshmukh',
      joiningDate: new Date('2023-11-15'),
      dateOfBirth: new Date('1997-05-22'),
    },
    {
      employeeId: 'EMP-0009',
      biometricId: '1009',
      name: 'Ananya Gupta',
      email: 'ananya@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'employee',
      department: 'Sales & Marketing',
      designation: 'Growth Marketing Specialist',
      phone: '9876543209',
      basicSalary: 55000,
      hra: 18000,
      allowances: 12000,
      deductions: 4800,
      tax: 5200,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AnanyaGupta',
      joiningDate: new Date('2023-05-15'),
      dateOfBirth: new Date('1994-07-19'),
    },
    {
      employeeId: 'EMP-0010',
      biometricId: '1010',
      name: 'Karan Mehta',
      email: 'karan@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'employee',
      department: 'Finance & Accounts',
      designation: 'Senior Accountant',
      phone: '9876543210',
      basicSalary: 50000,
      hra: 17000,
      allowances: 10000,
      deductions: 4200,
      tax: 4500,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KaranMehta',
      joiningDate: new Date('2023-02-01'),
      dateOfBirth: new Date('1993-10-10'),
    },
    {
      employeeId: 'EMP-0011',
      biometricId: '1011',
      name: 'Neha Joshi',
      email: 'neha@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'employee',
      department: 'UI/UX Design',
      designation: 'Senior Product Designer',
      phone: '9876543211',
      basicSalary: 62000,
      hra: 21000,
      allowances: 13000,
      deductions: 5200,
      tax: 6200,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NehaJoshi',
      joiningDate: new Date('2023-07-01'),
      dateOfBirth: new Date('1995-12-03'),
    },
    {
      employeeId: 'EMP-0012',
      biometricId: '1012',
      name: 'Suresh Reddy',
      email: 'suresh@xps.com',
      password: DEFAULT_PASSWORD,
      role: 'employee',
      department: 'Operations & Logistics',
      designation: 'Operations Executive',
      phone: '9876543212',
      basicSalary: 42000,
      hra: 14000,
      allowances: 8000,
      deductions: 3500,
      tax: 3500,
      status: 'Active',
      profilePhotoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=SureshReddy',
      joiningDate: new Date('2023-10-01'),
      dateOfBirth: new Date('1992-03-29'),
    },
  ];

  const userMap = {};
  for (const u of usersToCreate) {
    let existing = await User.findOne({ email: u.email });
    if (!existing) {
      existing = await User.create(u);
    } else {
      // update fields to ensure fresh credentials and data
      existing.name = u.name;
      existing.role = u.role;
      existing.department = u.department;
      existing.designation = u.designation;
      existing.basicSalary = u.basicSalary;
      existing.hra = u.hra;
      existing.allowances = u.allowances;
      existing.deductions = u.deductions;
      existing.tax = u.tax;
      existing.password = DEFAULT_PASSWORD; // will trigger pre-save bcrypt hash
      existing.status = 'Active';
      await existing.save();
    }
    userMap[u.email] = existing;
  }

  // Link Team Leads
  if (userMap['rahul@xps.com'] && userMap['tl.eng@xps.com']) {
    userMap['rahul@xps.com'].teamLeadId = userMap['tl.eng@xps.com']._id;
    await userMap['rahul@xps.com'].save();
  }
  if (userMap['priya@xps.com'] && userMap['tl.eng@xps.com']) {
    userMap['priya@xps.com'].teamLeadId = userMap['tl.eng@xps.com']._id;
    await userMap['priya@xps.com'].save();
  }
  if (userMap['rohit@xps.com'] && userMap['tl.qa@xps.com']) {
    userMap['rohit@xps.com'].teamLeadId = userMap['tl.qa@xps.com']._id;
    await userMap['rohit@xps.com'].save();
  }

  // Assign department team leaders
  if (departmentsMap['Engineering'] && userMap['tl.eng@xps.com']) {
    departmentsMap['Engineering'].teamLeaderId = userMap['tl.eng@xps.com']._id;
    await departmentsMap['Engineering'].save();
  }
  if (departmentsMap['Quality Assurance'] && userMap['tl.qa@xps.com']) {
    departmentsMap['Quality Assurance'].teamLeaderId = userMap['tl.qa@xps.com']._id;
    await departmentsMap['Quality Assurance'].save();
  }
  if (departmentsMap['Human Resources'] && userMap['hr@xps.com']) {
    departmentsMap['Human Resources'].teamLeaderId = userMap['hr@xps.com']._id;
    await departmentsMap['Human Resources'].save();
  }

  console.log(`   ✓ ${Object.keys(userMap).length} users seeded and team leads linked`);

  // 5. Leave Types & Allocations
  console.log('\n[5/16] Seeding Leave Types & Quotas...');
  await LeaveType.seedDefaults();

  const leaveAllocRows = [
    // employee
    { role: 'employee', leaveTypeCode: 'CL', daysAllowed: 12, period: 'biannual', carryForward: true },
    { role: 'employee', leaveTypeCode: 'ML', daysAllowed: 10, period: 'annual', carryForward: false },
    { role: 'employee', leaveTypeCode: 'PL', daysAllowed: 15, period: 'biannual', carryForward: true },
    { role: 'employee', leaveTypeCode: 'WFH', daysAllowed: 24, period: 'biannual', carryForward: false },
    { role: 'employee', leaveTypeCode: 'SHRT', daysAllowed: 2, period: 'monthly', carryForward: false },
    { role: 'employee', leaveTypeCode: 'COMP', daysAllowed: 10, period: 'annual', carryForward: false },
    // team_lead
    { role: 'team_lead', leaveTypeCode: 'CL', daysAllowed: 15, period: 'biannual', carryForward: true },
    { role: 'team_lead', leaveTypeCode: 'ML', daysAllowed: 12, period: 'annual', carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'PL', daysAllowed: 18, period: 'biannual', carryForward: true },
    { role: 'team_lead', leaveTypeCode: 'WFH', daysAllowed: 36, period: 'biannual', carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'SHRT', daysAllowed: 2, period: 'monthly', carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'COMP', daysAllowed: 12, period: 'annual', carryForward: false },
    // hr
    { role: 'hr', leaveTypeCode: 'CL', daysAllowed: 15, period: 'biannual', carryForward: true },
    { role: 'hr', leaveTypeCode: 'ML', daysAllowed: 12, period: 'annual', carryForward: false },
    { role: 'hr', leaveTypeCode: 'PL', daysAllowed: 18, period: 'biannual', carryForward: true },
    { role: 'hr', leaveTypeCode: 'WFH', daysAllowed: 36, period: 'biannual', carryForward: false },
    { role: 'hr', leaveTypeCode: 'SHRT', daysAllowed: 2, period: 'monthly', carryForward: false },
    { role: 'hr', leaveTypeCode: 'COMP', daysAllowed: 12, period: 'annual', carryForward: false },
    // admin
    { role: 'admin', leaveTypeCode: 'CL', daysAllowed: 20, period: 'biannual', carryForward: true },
    { role: 'admin', leaveTypeCode: 'ML', daysAllowed: 15, period: 'annual', carryForward: false },
    { role: 'admin', leaveTypeCode: 'PL', daysAllowed: 20, period: 'biannual', carryForward: true },
    { role: 'admin', leaveTypeCode: 'WFH', daysAllowed: 52, period: 'biannual', carryForward: false },
    { role: 'admin', leaveTypeCode: 'SHRT', daysAllowed: 2, period: 'monthly', carryForward: false },
    // md
    { role: 'md', leaveTypeCode: 'CL', daysAllowed: 20, period: 'biannual', carryForward: true },
    { role: 'md', leaveTypeCode: 'ML', daysAllowed: 15, period: 'annual', carryForward: false },
    { role: 'md', leaveTypeCode: 'PL', daysAllowed: 20, period: 'biannual', carryForward: true },
    { role: 'md', leaveTypeCode: 'WFH', daysAllowed: 52, period: 'biannual', carryForward: false },
  ];

  for (const row of leaveAllocRows) {
    const existing = await LeaveAllocation.findOne({ role: row.role, leaveTypeCode: row.leaveTypeCode });
    if (!existing) {
      await LeaveAllocation.create({ ...row, updatedAt: new Date() });
    }
  }
  console.log('   ✓ Leave types and role quotas seeded');

  // 6. Leave Applications
  console.log('\n[6/16] Seeding Sample Leave Applications...');
  await Leave.deleteMany({});
  const now = new Date();
  const sampleLeaves = [
    {
      employeeId: userMap['rahul@xps.com']._id,
      leaveType: 'Casual Leave',
      leaveTypeCode: 'CL',
      durationType: 'full_day',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4),
      totalDays: 2,
      reason: 'Family function in hometown',
      currentProject: 'Core Attendance Module',
      leaveMode: 'Planned',
      status: 'Approved',
      approvedBy: userMap['tl.eng@xps.com']._id,
    },
    {
      employeeId: userMap['priya@xps.com']._id,
      leaveType: 'Work From Home',
      leaveTypeCode: 'WFH',
      durationType: 'full_day',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2),
      totalDays: 1,
      reason: 'Home appliance delivery and repair',
      currentProject: 'Next.js Frontend Redesign',
      leaveMode: 'Planned',
      status: 'Approved',
      approvedBy: userMap['tl.eng@xps.com']._id,
    },
    {
      employeeId: userMap['rohit@xps.com']._id,
      leaveType: 'Medical Leave',
      leaveTypeCode: 'ML',
      durationType: 'full_day',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3),
      totalDays: 2,
      reason: 'Viral fever and doctor consultation',
      currentProject: 'E2E Testing Suite',
      leaveMode: 'Unplanned',
      status: 'Pending',
    },
    {
      employeeId: userMap['ananya@xps.com']._id,
      leaveType: 'Short Leave',
      leaveTypeCode: 'SHRT',
      durationType: 'hourly',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
      startTime: '16:00',
      endTime: '18:00',
      totalHours: 2,
      durationHours: 2,
      reason: 'Dentist appointment',
      currentProject: 'Q2 Marketing Campaign',
      leaveMode: 'Planned',
      status: 'Pending',
    },
    {
      employeeId: userMap['karan@xps.com']._id,
      leaveType: 'Casual Leave',
      leaveTypeCode: 'CL',
      durationType: 'half_day',
      halfDayPeriod: 'afternoon',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10),
      totalDays: 0.5,
      reason: 'Personal banking work',
      currentProject: 'Payroll Processing',
      leaveMode: 'Planned',
      status: 'Approved',
      approvedBy: userMap['hr@xps.com']._id,
    },
    {
      employeeId: userMap['neha@xps.com']._id,
      leaveType: 'Paid Leave',
      leaveTypeCode: 'PL',
      durationType: 'full_day',
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 15),
      endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13),
      totalDays: 3,
      reason: 'Outstation vacation',
      currentProject: 'Design System Tokens',
      leaveMode: 'Planned',
      status: 'Approved',
      approvedBy: userMap['admin@xps.com']._id,
    },
  ];

  await Leave.insertMany(sampleLeaves);
  console.log(`   ✓ ${sampleLeaves.length} leave applications seeded`);

  // 7. Attendance Records (Past 30 days)
  console.log('\n[7/16] Seeding Attendance Records (Past 30 Days)...');
  await Attendance.deleteMany({});
  const attendanceDocs = [];
  const allUsers = Object.values(userMap);

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay(); // 0 = Sun, 6 = Sat

    for (const u of allUsers) {
      if (dayOfWeek === 0) {
        // Sunday
        attendanceDocs.push({
          employeeId: u._id,
          date: dateStr,
          status: 'Weekend',
          workingHours: 0,
          source: 'portal',
          workMode: 'office',
        });
        continue;
      }

      if (dayOfWeek === 6) {
        // Saturday - alternate off
        attendanceDocs.push({
          employeeId: u._id,
          date: dateStr,
          status: 'Weekend',
          workingHours: 0,
          source: 'portal',
          workMode: 'office',
        });
        continue;
      }

      // Weekday
      // 88% Present, 5% Late, 4% WFH, 3% Absent
      const rand = Math.random();
      if (rand < 0.03) {
        // Absent
        attendanceDocs.push({
          employeeId: u._id,
          date: dateStr,
          status: 'Absent',
          workingHours: 0,
          source: 'manual',
          workMode: 'office',
        });
      } else if (rand < 0.08) {
        // WFH
        const checkIn = new Date(d);
        checkIn.setHours(9, 15, 0, 0);
        const checkOut = new Date(d);
        checkOut.setHours(18, 30, 0, 0);
        attendanceDocs.push({
          employeeId: u._id,
          date: dateStr,
          checkIn,
          checkOut,
          status: 'Present',
          workingHours: 9.25,
          isLate: false,
          source: 'portal',
          workMode: 'wfh',
          wfhReason: 'Approved Remote Work',
        });
      } else if (rand < 0.16) {
        // Late Checkin
        const lateMin = Math.floor(Math.random() * 35) + 5; // 10:05 - 10:40
        const checkIn = new Date(d);
        checkIn.setHours(10, lateMin, 0, 0);
        const checkOut = new Date(d);
        checkOut.setHours(19, 15, 0, 0);
        attendanceDocs.push({
          employeeId: u._id,
          date: dateStr,
          checkIn,
          checkOut,
          status: 'Present',
          workingHours: 8.75,
          isLate: true,
          source: 'biometric',
          workMode: 'office',
          deviceInfo: 'Biometric Scanner Gate #1',
        });
      } else {
        // Standard Present
        const checkInMin = Math.floor(Math.random() * 25) + 40; // 8:40 - 9:05
        const checkIn = new Date(d);
        checkIn.setHours(8, checkInMin, 0, 0);
        const checkOutMin = Math.floor(Math.random() * 30) + 15; // 18:15 - 18:45
        const checkOut = new Date(d);
        checkOut.setHours(18, checkOutMin, 0, 0);
        const hours = parseFloat(((checkOut - checkIn) / (1000 * 60 * 60)).toFixed(2));

        attendanceDocs.push({
          employeeId: u._id,
          date: dateStr,
          checkIn,
          checkOut,
          status: 'Present',
          workingHours: hours,
          isLate: false,
          source: 'biometric',
          workMode: 'office',
          deviceInfo: 'Biometric Scanner Gate #1',
        });
      }
    }
  }

  await Attendance.insertMany(attendanceDocs);
  console.log(`   ✓ ${attendanceDocs.length} attendance records seeded across 30 days`);

  // 8. Calendar Events & Holidays
  console.log('\n[8/16] Seeding Calendar Events & Holidays...');
  await CalendarEvent.deleteMany({});
  const currentYear = now.getFullYear();
  const calendarEvents = [
    {
      title: 'Republic Day',
      description: 'National Public Holiday',
      date: `${currentYear}-01-26`,
      color: '#ef4444',
      type: 'holiday',
      isAllDay: true,
      companyHoliday: true,
      createdBy: userMap['admin@xps.com']._id,
    },
    {
      title: 'Holi Festival of Colors',
      description: 'Spring Festival Holiday',
      date: `${currentYear}-03-25`,
      color: '#ec4899',
      type: 'holiday',
      isAllDay: true,
      companyHoliday: true,
      createdBy: userMap['admin@xps.com']._id,
    },
    {
      title: 'Independence Day',
      description: 'National Public Holiday',
      date: `${currentYear}-08-15`,
      color: '#ef4444',
      type: 'holiday',
      isAllDay: true,
      companyHoliday: true,
      createdBy: userMap['admin@xps.com']._id,
    },
    {
      title: 'Diwali - Festival of Lights',
      description: 'Mandatory Festival Holiday',
      date: `${currentYear}-11-01`,
      color: '#f59e0b',
      type: 'holiday',
      isAllDay: true,
      companyHoliday: true,
      createdBy: userMap['admin@xps.com']._id,
    },
    {
      title: 'Christmas Day',
      description: 'Public Holiday',
      date: `${currentYear}-12-25`,
      color: '#10b981',
      type: 'holiday',
      isAllDay: true,
      companyHoliday: true,
      createdBy: userMap['admin@xps.com']._id,
    },
    {
      title: 'Quarterly All-Hands Townhall',
      description: 'Company performance update & Q2 roadmaps presentation by MD',
      date: new Date(now.getTime() + 4 * 86400000).toISOString().slice(0, 10),
      startTime: '16:00',
      endTime: '17:30',
      color: '#6366f1',
      type: 'meeting',
      isAllDay: false,
      companyHoliday: false,
      createdBy: userMap['md@xps.com']._id,
    },
    {
      title: 'Annual Hackathon 2026',
      description: '48-hour innovation hackathon with cash prizes and gadgets',
      date: new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10),
      color: '#8b5cf6',
      type: 'event',
      isAllDay: true,
      companyHoliday: false,
      createdBy: userMap['admin@xps.com']._id,
    },
  ];

  await CalendarEvent.insertMany(calendarEvents);
  console.log(`   ✓ ${calendarEvents.length} calendar events & holidays seeded`);

  // 9. Announcements
  console.log('\n[9/16] Seeding Announcements...');
  await Announcement.deleteMany({});
  const announcements = [
    {
      title: '🎉 Welcome to the Enhanced XPS Attendance & HR Portal!',
      content: 'We are thrilled to launch the new AttendanceOS platform featuring real-time biometric tracking, instant leave workflows, payslip downloads, and cafeteria meal booking.',
      priority: 'high',
      postedBy: userMap['admin@xps.com']._id,
      isActive: true,
    },
    {
      title: '📢 Annual Health Checkup Camp Next Week',
      content: 'Comprehensive executive health checkups will be conducted at the main campus for all employees free of charge on Tuesday & Wednesday.',
      priority: 'medium',
      postedBy: userMap['hr@xps.com']._id,
      isActive: true,
    },
    {
      title: '💡 Cafeteria Menu Refresh & Prepaid Meal Discounts',
      content: 'Check out the upgraded menu items in the Cafeteria section. Enjoy healthy grain bowls, fresh fruit juices, and 15% discount on digital wallet payments.',
      priority: 'low',
      postedBy: userMap['hr@xps.com']._id,
      isActive: true,
    },
  ];

  await Announcement.insertMany(announcements);
  console.log(`   ✓ ${announcements.length} announcements seeded`);

  // 10. Policies
  console.log('\n[10/16] Seeding Company Policies...');
  await Policy.deleteMany({});
  const policies = [
    {
      title: 'Code of Business Conduct & Ethics',
      category: 'General',
      content: 'Guidelines on integrity, diversity, workplace harassment prevention, data confidentiality, and professional standards expected from every XPS team member.',
      requiresAcceptance: true,
      version: 1,
      isActive: true,
    },
    {
      title: 'Comprehensive Leave & Attendance Policy v2.0',
      category: 'HR & Attendance',
      content: 'Rules governing Casual Leaves, Medical Leaves, Biometric check-in timings, grace periods (up to 10:00 AM), Short Leaves, and Work From Home allocations.',
      requiresAcceptance: true,
      version: 2,
      isActive: true,
    },
    {
      title: 'Information Security & Data Protection Guidelines',
      category: 'IT & Security',
      content: 'Protocols for safe password management, VPN usage, clean desk policy, handling of proprietary customer data, and secure device practices.',
      requiresAcceptance: true,
      version: 1,
      isActive: true,
    },
  ];

  await Policy.insertMany(policies);
  console.log(`   ✓ ${policies.length} company policies seeded`);

  // 11. Office Tasks
  console.log('\n[11/16] Seeding Office Tasks...');
  await OfficeTask.deleteMany({});
  const officeTasks = [
    {
      title: 'Setup Developer Workstations for 4 New Joiners',
      description: 'Configure Ubuntu/macOS machines, IDEs, SSH keys and company VPN access',
      category: 'IT Support',
      priority: 'High',
      status: 'In Progress',
      assignedTo: userMap['admin@xps.com']._id,
      createdBy: userMap['hr@xps.com']._id,
      dueDate: new Date(now.getTime() + 2 * 86400000),
      expenseAmount: 1800,
      expenseCategory: 'Hardware',
      expenseStatus: 'Approved',
    },
    {
      title: 'AC Servicing in Bay 2 and Conference Room B',
      description: 'Routine maintenance and filter replacement for air conditioning units',
      category: 'Maintenance',
      priority: 'Medium',
      status: 'Completed',
      assignedTo: userMap['suresh@xps.com']._id,
      createdBy: userMap['admin@xps.com']._id,
      dueDate: new Date(now.getTime() - 2 * 86400000),
      expenseAmount: 4500,
      expenseCategory: 'Maintenance',
      expenseStatus: 'Approved',
    },
    {
      title: 'Biometric Scanner Gate #2 Firmware Upgrade',
      description: 'Update firmware to eliminate sync latency during peak morning rush',
      category: 'Security',
      priority: 'Urgent',
      status: 'Open',
      assignedTo: userMap['admin@xps.com']._id,
      createdBy: userMap['admin@xps.com']._id,
      dueDate: new Date(now.getTime() + 1 * 86400000),
    },
    {
      title: 'Procure Ergonomic Chairs for Design Team',
      description: 'Order 5 mesh ergonomic chairs with lumbar support',
      category: 'Procurement',
      priority: 'Medium',
      status: 'Open',
      assignedTo: userMap['suresh@xps.com']._id,
      createdBy: userMap['neha@xps.com']._id,
      dueDate: new Date(now.getTime() + 5 * 86400000),
      expenseAmount: 32000,
      expenseCategory: 'Office Supplies',
      expenseStatus: 'Pending',
    },
  ];

  await OfficeTask.insertMany(officeTasks);
  console.log(`   ✓ ${officeTasks.length} office tasks seeded`);

  // 12. Expenses
  console.log('\n[12/16] Seeding Expenses...');
  await Expense.deleteMany({});
  const expenses = [
    {
      submittedBy: userMap['rahul@xps.com']._id,
      title: 'AWS Certified Solutions Architect Exam Fee',
      category: 'Training',
      amount: 12500,
      currency: 'INR',
      date: new Date(now.getTime() - 12 * 86400000),
      description: 'Certification reimbursement approved under employee learning allowance',
      status: 'Approved',
      approvedBy: userMap['tl.eng@xps.com']._id,
      paymentStatus: 'Paid',
      paidAt: new Date(now.getTime() - 5 * 86400000),
      paidBy: userMap['karan@xps.com']._id,
    },
    {
      submittedBy: userMap['ananya@xps.com']._id,
      title: 'Client Dinner & Quarterly Meeting (Taj Krishna)',
      category: 'Food',
      amount: 8400,
      currency: 'INR',
      date: new Date(now.getTime() - 7 * 86400000),
      description: 'Dinner with executive stakeholders from client team',
      status: 'Approved',
      approvedBy: userMap['md@xps.com']._id,
      paymentStatus: 'Paid',
      paidAt: new Date(now.getTime() - 2 * 86400000),
      paidBy: userMap['karan@xps.com']._id,
    },
    {
      submittedBy: userMap['neha@xps.com']._id,
      title: 'Figma Enterprise Annual Team Licenses',
      category: 'Software',
      amount: 24000,
      currency: 'INR',
      date: new Date(now.getTime() - 3 * 86400000),
      description: 'Monthly seat renewal for design tokens & prototype library',
      status: 'Pending',
      paymentStatus: 'Unpaid',
    },
    {
      submittedBy: userMap['rohit@xps.com']._id,
      title: 'Uber Travel for Offsite Client Demo',
      category: 'Travel',
      amount: 850,
      currency: 'INR',
      date: new Date(now.getTime() - 1 * 86400000),
      description: 'Round-trip cab fare between office and Hitec City venue',
      status: 'Pending',
      paymentStatus: 'Unpaid',
    },
  ];

  await Expense.insertMany(expenses);
  console.log(`   ✓ ${expenses.length} expenses seeded`);

  // 13. Cafe Menus & Cafe Orders
  console.log('\n[13/16] Seeding Cafeteria Menus & Orders...');
  await CafeMenu.deleteMany({});
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const baseMenuItems = [
    { name: 'Masala Dosa with Sambar & Chutney', price: 60, category: 'Breakfast', isVeg: true, isAvailable: true },
    { name: 'Idli Vada Combo', price: 50, category: 'Breakfast', isVeg: true, isAvailable: true },
    { name: 'Egg Bhurji with Butter Toast', price: 70, category: 'Breakfast', isVeg: false, isAvailable: true },
    { name: 'Special North Indian Thali', price: 120, category: 'Lunch', isVeg: true, isAvailable: true },
    { name: 'Paneer Butter Masala Rice Bowl', price: 110, category: 'Lunch', isVeg: true, isAvailable: true },
    { name: 'Chicken Biryani with Raita', price: 160, category: 'Lunch', isVeg: false, isAvailable: true },
    { name: 'Dal Makhani & Jeera Rice', price: 90, category: 'Lunch', isVeg: true, isAvailable: true },
    { name: 'Samosa Chaat & Chutney', price: 40, category: 'Snacks', isVeg: true, isAvailable: true },
    { name: 'Paneer Tikka Kathi Roll', price: 80, category: 'Snacks', isVeg: true, isAvailable: true },
    { name: 'Filter Coffee', price: 25, category: 'Beverages', isVeg: true, isAvailable: true },
    { name: 'Masala Ginger Chai', price: 20, category: 'Beverages', isVeg: true, isAvailable: true },
    { name: 'Cold Coffee with Ice Cream', price: 60, category: 'Beverages', isVeg: true, isAvailable: true },
  ];

  for (const day of weekDays) {
    await CafeMenu.create({
      day,
      items: baseMenuItems,
      specialNote: day === 'Friday' ? 'Special Biryani & Dessert Feast Day!' : '',
    });
  }

  // Seed sample Cafe Order
  await CafeOrder.deleteMany({});
  const cafeOrders = [
    {
      userId: userMap['rahul@xps.com']._id,
      day: 'Wednesday',
      orderDate: new Date(),
      items: [
        { name: 'Special North Indian Thali', price: 120, quantity: 1, isVeg: true, category: 'Lunch' },
        { name: 'Masala Ginger Chai', price: 20, quantity: 1, isVeg: true, category: 'Beverages' },
      ],
      totalAmount: 140,
      status: 'Delivered',
      paymentStatus: 'Paid',
      paymentMethod: 'UPI',
      paidAt: new Date(),
    },
    {
      userId: userMap['priya@xps.com']._id,
      day: 'Thursday',
      orderDate: new Date(),
      items: [
        { name: 'Paneer Butter Masala Rice Bowl', price: 110, quantity: 1, isVeg: true, category: 'Lunch' },
        { name: 'Cold Coffee with Ice Cream', price: 60, quantity: 1, isVeg: true, category: 'Beverages' },
      ],
      totalAmount: 170,
      status: 'Confirmed',
      paymentStatus: 'Paid',
      paymentMethod: 'Wallet',
      paidAt: new Date(),
    },
  ];
  await CafeOrder.insertMany(cafeOrders);
  console.log(`   ✓ 7-day cafe menu and sample orders seeded`);

  // 14. Payslips
  console.log('\n[14/16] Seeding Monthly Payslips...');
  await Payslip.deleteMany({});
  const payslips = [];
  const targetMonths = [
    { month: 1, year: 2026 },
    { month: 2, year: 2026 },
    { month: 3, year: 2026 },
  ];

  for (const tm of targetMonths) {
    for (const u of allUsers) {
      const basic = u.basicSalary || 50000;
      const hra = u.hra || 18000;
      const allowances = u.allowances || 10000;
      const deductions = u.deductions || 5000;
      const tax = u.tax || 6000;
      const net = basic + hra + allowances - deductions - tax;

      payslips.push({
        employeeId: u._id,
        month: tm.month,
        year: tm.year,
        basicSalary: basic,
        hra,
        allowances,
        deductions,
        tax,
        netSalary: net,
        workingDays: 22,
        presentDays: 21,
        leaveDays: 1,
        status: 'Published',
        notes: `Salary disbursed on the last working day of ${tm.month}/${tm.year}`,
        generatedBy: userMap['hr@xps.com']._id,
      });
    }
  }

  await Payslip.insertMany(payslips);
  console.log(`   ✓ ${payslips.length} payslips seeded across 3 months`);

  // 15. Performance Reviews
  console.log('\n[15/16] Seeding Performance Reviews...');
  await PerformanceReview.deleteMany({});
  const reviews = [
    {
      employeeId: userMap['rahul@xps.com']._id,
      reviewedBy: userMap['tl.eng@xps.com']._id,
      period: 'Q1 2026',
      periodType: 'quarterly',
      year: 2026,
      ratings: {
        punctuality: 5,
        productivity: 5,
        teamwork: 4,
        communication: 4,
        initiative: 5,
        quality: 5,
      },
      strengths: 'Outstanding problem solver, rapid API delivery, and mentor to junior frontend developers.',
      improvements: 'Can lead architectural documentation workshops for the wider team.',
      goals: 'Take ownership of distributed caching and microservice decoupling in Q2.',
      managerComments: 'Consistently exceeds expectations and exhibits strong ownership.',
      status: 'Published',
    },
    {
      employeeId: userMap['priya@xps.com']._id,
      reviewedBy: userMap['tl.eng@xps.com']._id,
      period: 'Q1 2026',
      periodType: 'quarterly',
      year: 2026,
      ratings: {
        punctuality: 4,
        productivity: 4,
        teamwork: 5,
        communication: 5,
        initiative: 4,
        quality: 4,
      },
      strengths: 'Clean Next.js components, high empathy for UI detail, and fantastic collaboration.',
      improvements: 'Deeper familiarity with backend GraphQL/REST caching layers.',
      goals: 'Complete mobile responsiveness optimization across the entire XPS Portal.',
      managerComments: 'Great work Priya! Very reliable and proactive teammate.',
      status: 'Published',
    },
    {
      employeeId: userMap['rohit@xps.com']._id,
      reviewedBy: userMap['tl.qa@xps.com']._id,
      period: 'Q1 2026',
      periodType: 'quarterly',
      year: 2026,
      ratings: {
        punctuality: 4,
        productivity: 4,
        teamwork: 4,
        communication: 4,
        initiative: 4,
        quality: 5,
      },
      strengths: 'Rigorous automated test coverage and defect reporting precision.',
      improvements: 'Performance load testing scripting with k6/JMeter.',
      goals: 'Automate 80% of regression workflows in CI/CD pipeline.',
      managerComments: 'Strong contributor to sprint quality gates.',
      status: 'Published',
    },
  ];

  for (const r of reviews) {
    const rev = new PerformanceReview(r);
    await rev.save(); // triggers pre-save overall score computation
  }
  console.log(`   ✓ ${reviews.length} performance reviews seeded`);

  // 16. Recruitment (Job Postings & Candidates) & Fun Team
  console.log('\n[16/16] Seeding Recruitment & Fun Teams...');
  await JobPosting.deleteMany({});
  const jobs = await JobPosting.insertMany([
    {
      title: 'Senior Backend Engineer (Node.js & MongoDB)',
      department: 'Engineering',
      location: 'Hyderabad / Hybrid',
      type: 'Full-time',
      description: 'Looking for an experienced backend developer to scale our core microservices and biometric event pipelines.',
      requirements: ['4+ years Node.js & Express/NestJS', 'Strong MongoDB/NoSQL schema modeling', 'Docker & AWS experience'],
      salaryMin: 1200000,
      salaryMax: 1800000,
      status: 'Open',
      openings: 2,
      createdBy: userMap['hr@xps.com']._id,
    },
    {
      title: 'Lead UI/UX Product Designer',
      department: 'UI/UX Design',
      location: 'Hyderabad / Hybrid',
      type: 'Full-time',
      description: 'Design intuitive, state-of-the-art enterprise workforce management interfaces.',
      requirements: ['Figma mastery', 'Design systems knowledge', 'User research experience'],
      salaryMin: 1000000,
      salaryMax: 1500000,
      status: 'Open',
      openings: 1,
      createdBy: userMap['hr@xps.com']._id,
    },
  ]);

  await Candidate.deleteMany({});
  await Candidate.insertMany([
    {
      jobId: jobs[0]._id,
      name: 'Aditya Varma',
      email: 'aditya.varma@example.com',
      phone: '9988776655',
      source: 'LinkedIn',
      stage: 'Technical',
      rating: 4,
      expectedSalary: 1500000,
      noticePeriod: '30 Days',
      assignedTo: userMap['tl.eng@xps.com']._id,
      notes: 'Strong knowledge of Mongo aggregations and Redis caching.',
    },
    {
      jobId: jobs[1]._id,
      name: 'Kavita Rao',
      email: 'kavita.rao@example.com',
      phone: '9988112233',
      source: 'Referral',
      stage: 'HR Round',
      rating: 5,
      expectedSalary: 1300000,
      noticePeriod: 'Immediate',
      assignedTo: userMap['hr@xps.com']._id,
      notes: 'Impressive design portfolio showcasing enterprise SaaS redesigns.',
    },
  ]);

  // Fun Team
  await FunTeam.deleteMany({});
  await FunTeam.insertMany([
    {
      name: 'XPS Strikers Cricket Club',
      description: 'Weekend cricket leagues, tournaments, and friendly matches',
      color: '#0ea5e9',
      captain: userMap['rahul@xps.com']._id,
      members: [userMap['rahul@xps.com']._id, userMap['rohit@xps.com']._id, userMap['amit_kumar' ? 'tl.eng@xps.com' : 'rahul@xps.com']._id],
      isActive: true,
    },
    {
      name: 'Cultural & Festive Committee',
      description: 'Planning Diwali, Christmas, Rangoli competitions & hackathons',
      color: '#ec4899',
      captain: userMap['priya@xps.com']._id,
      members: [userMap['priya@xps.com']._id, userMap['ananya@xps.com']._id, userMap['neha@xps.com']._id],
      isActive: true,
    },
  ]);

  // Notifications
  await Notification.deleteMany({});
  await Notification.insertMany([
    {
      userId: userMap['rahul@xps.com']._id,
      type: 'leave_approved',
      title: 'Leave Approved',
      message: 'Your Casual Leave application for 2 days has been approved by Amit Kumar.',
      isRead: false,
    },
    {
      userId: userMap['rahul@xps.com']._id,
      type: 'announcement',
      title: 'Company Retreat Announced',
      message: 'Check out the new announcement regarding the Goa Annual Retreat 2026!',
      isRead: true,
    },
    {
      userId: userMap['priya@xps.com']._id,
      type: 'general',
      title: 'Cafeteria Order Confirmed',
      message: 'Your cafeteria lunch booking has been confirmed.',
      isRead: false,
    },
  ]);

  console.log('   ✓ Recruitment postings, candidates, fun teams & notifications seeded');

  console.log('\n======================================================');
  console.log('🎉 ALL DUMMY DATA SEEDED SUCCESSFULLY INTO MONGODB ATLAS!');
  console.log('======================================================\n');
  console.log('🔑 Login Credentials (Password for all is: Password@123)\n');
  console.table([
    { Role: 'Admin (System Admin)', Email: 'admin@xps.com', EmployeeID: 'EMP-0001', Name: 'Rajesh Sharma' },
    { Role: 'MD (Managing Director)', Email: 'md@xps.com', EmployeeID: 'EMP-0002', Name: 'Vikram Malhotra' },
    { Role: 'HR (HR Manager)', Email: 'hr@xps.com', EmployeeID: 'EMP-0003', Name: 'Pooja Verma' },
    { Role: 'Team Lead (Engineering)', Email: 'tl.eng@xps.com', EmployeeID: 'EMP-0004', Name: 'Amit Kumar' },
    { Role: 'Team Lead (QA)', Email: 'tl.qa@xps.com', EmployeeID: 'EMP-0005', Name: 'Sneha Patel' },
    { Role: 'Employee (Developer)', Email: 'rahul@xps.com', EmployeeID: 'EMP-0006', Name: 'Rahul Singh' },
    { Role: 'Employee (Frontend)', Email: 'priya@xps.com', EmployeeID: 'EMP-0007', Name: 'Priya Nair' },
    { Role: 'Employee (QA)', Email: 'rohit@xps.com', EmployeeID: 'EMP-0008', Name: 'Rohit Deshmukh' },
    { Role: 'Employee (Marketing)', Email: 'ananya@xps.com', EmployeeID: 'EMP-0009', Name: 'Ananya Gupta' },
    { Role: 'Employee (Finance)', Email: 'karan@xps.com', EmployeeID: 'EMP-0010', Name: 'Karan Mehta' },
    { Role: 'Employee (UI/UX)', Email: 'neha@xps.com', EmployeeID: 'EMP-0011', Name: 'Neha Joshi' },
    { Role: 'Employee (Operations)', Email: 'suresh@xps.com', EmployeeID: 'EMP-0012', Name: 'Suresh Reddy' },
  ]);

  await mongoose.disconnect();
  console.log('🔌 Disconnected cleanly.');
  process.exit(0);
}

seed().catch(err => {
  console.error('\n❌ Seeding failed:', err);
  process.exit(1);
});
