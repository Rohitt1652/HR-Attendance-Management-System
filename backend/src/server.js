require('dotenv').config();
const dns = require('dns');
if (process.platform === 'win32') {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  } catch (_) {}
}
const mongoose = require('mongoose');
const app = require('./app');
const Role = require('./models/Role');
const LeaveType = require('./models/LeaveType');
const CafeMenu = require('./models/CafeMenu');
const LeaveAllocation = require('./models/LeaveAllocation');

async function seedLeaveAllocations() {
  // Role-wise leave allocations based on old system data analysis
  // CL=12/yr biannual+CF, SL=10/yr biannual+CF, PL=15/yr biannual+CF
  // WFH=24/yr biannual no-CF, COMP=10/yr annual no-CF
  // SHRT=2/month monthly no-CF, DL/RL/OV=annual no-CF
  const rows = [
    // Employee
    { role: 'employee', leaveTypeCode: 'CL',   daysAllowed: 12,  period: 'biannual', carryForward: true  },
    { role: 'employee', leaveTypeCode: 'SL',   daysAllowed: 10,  period: 'biannual', carryForward: true  },
    { role: 'employee', leaveTypeCode: 'PL',   daysAllowed: 15,  period: 'biannual', carryForward: true  },
    { role: 'employee', leaveTypeCode: 'PRIV', daysAllowed: 15,  period: 'biannual', carryForward: true  },
    { role: 'employee', leaveTypeCode: 'WFH',  daysAllowed: 24,  period: 'biannual', carryForward: false },
    { role: 'employee', leaveTypeCode: 'COMP', daysAllowed: 10,  period: 'annual',   carryForward: false },
    { role: 'employee', leaveTypeCode: 'ML',   daysAllowed: 15,  period: 'annual',   carryForward: false },
    { role: 'employee', leaveTypeCode: 'MPL',  daysAllowed: 180, period: 'annual',   carryForward: false },
    { role: 'employee', leaveTypeCode: 'SHRT', daysAllowed: 2,   period: 'monthly',  carryForward: false },
    { role: 'employee', leaveTypeCode: 'DL',   daysAllowed: 5,   period: 'annual',   carryForward: false },
    { role: 'employee', leaveTypeCode: 'RL',   daysAllowed: 5,   period: 'annual',   carryForward: false },
    { role: 'employee', leaveTypeCode: 'OV',   daysAllowed: 10,  period: 'annual',   carryForward: false },
    { role: 'employee', leaveTypeCode: 'LOP',  daysAllowed: 0,   period: 'annual',   carryForward: false },
    // Team Lead
    { role: 'team_lead', leaveTypeCode: 'CL',   daysAllowed: 15,  period: 'biannual', carryForward: true  },
    { role: 'team_lead', leaveTypeCode: 'SL',   daysAllowed: 12,  period: 'biannual', carryForward: true  },
    { role: 'team_lead', leaveTypeCode: 'PL',   daysAllowed: 18,  period: 'biannual', carryForward: true  },
    { role: 'team_lead', leaveTypeCode: 'PRIV', daysAllowed: 18,  period: 'biannual', carryForward: true  },
    { role: 'team_lead', leaveTypeCode: 'WFH',  daysAllowed: 36,  period: 'biannual', carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'COMP', daysAllowed: 12,  period: 'annual',   carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'ML',   daysAllowed: 15,  period: 'annual',   carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'MPL',  daysAllowed: 180, period: 'annual',   carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'SHRT', daysAllowed: 2,   period: 'monthly',  carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'DL',   daysAllowed: 5,   period: 'annual',   carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'OV',   daysAllowed: 15,  period: 'annual',   carryForward: false },
    { role: 'team_lead', leaveTypeCode: 'LOP',  daysAllowed: 0,   period: 'annual',   carryForward: false },
    // HR
    { role: 'hr', leaveTypeCode: 'CL',   daysAllowed: 15,  period: 'biannual', carryForward: true  },
    { role: 'hr', leaveTypeCode: 'SL',   daysAllowed: 12,  period: 'biannual', carryForward: true  },
    { role: 'hr', leaveTypeCode: 'PL',   daysAllowed: 18,  period: 'biannual', carryForward: true  },
    { role: 'hr', leaveTypeCode: 'PRIV', daysAllowed: 18,  period: 'biannual', carryForward: true  },
    { role: 'hr', leaveTypeCode: 'WFH',  daysAllowed: 36,  period: 'biannual', carryForward: false },
    { role: 'hr', leaveTypeCode: 'COMP', daysAllowed: 12,  period: 'annual',   carryForward: false },
    { role: 'hr', leaveTypeCode: 'ML',   daysAllowed: 15,  period: 'annual',   carryForward: false },
    { role: 'hr', leaveTypeCode: 'MPL',  daysAllowed: 180, period: 'annual',   carryForward: false },
    { role: 'hr', leaveTypeCode: 'SHRT', daysAllowed: 2,   period: 'monthly',  carryForward: false },
    { role: 'hr', leaveTypeCode: 'DL',   daysAllowed: 5,   period: 'annual',   carryForward: false },
    { role: 'hr', leaveTypeCode: 'OV',   daysAllowed: 15,  period: 'annual',   carryForward: false },
    { role: 'hr', leaveTypeCode: 'LOP',  daysAllowed: 0,   period: 'annual',   carryForward: false },
    // Admin
    { role: 'admin', leaveTypeCode: 'CL',   daysAllowed: 20,  period: 'biannual', carryForward: true  },
    { role: 'admin', leaveTypeCode: 'SL',   daysAllowed: 15,  period: 'biannual', carryForward: true  },
    { role: 'admin', leaveTypeCode: 'PL',   daysAllowed: 20,  period: 'biannual', carryForward: true  },
    { role: 'admin', leaveTypeCode: 'PRIV', daysAllowed: 20,  period: 'biannual', carryForward: true  },
    { role: 'admin', leaveTypeCode: 'WFH',  daysAllowed: 52,  period: 'biannual', carryForward: false },
    { role: 'admin', leaveTypeCode: 'COMP', daysAllowed: 15,  period: 'annual',   carryForward: false },
    { role: 'admin', leaveTypeCode: 'ML',   daysAllowed: 15,  period: 'annual',   carryForward: false },
    { role: 'admin', leaveTypeCode: 'MPL',  daysAllowed: 180, period: 'annual',   carryForward: false },
    { role: 'admin', leaveTypeCode: 'SHRT', daysAllowed: 2,   period: 'monthly',  carryForward: false },
    { role: 'admin', leaveTypeCode: 'DL',   daysAllowed: 7,   period: 'annual',   carryForward: false },
    { role: 'admin', leaveTypeCode: 'OV',   daysAllowed: 20,  period: 'annual',   carryForward: false },
    { role: 'admin', leaveTypeCode: 'LOP',  daysAllowed: 0,   period: 'annual',   carryForward: false },
    // MD
    { role: 'md', leaveTypeCode: 'CL',   daysAllowed: 20,  period: 'biannual', carryForward: true  },
    { role: 'md', leaveTypeCode: 'SL',   daysAllowed: 15,  period: 'biannual', carryForward: true  },
    { role: 'md', leaveTypeCode: 'PL',   daysAllowed: 20,  period: 'biannual', carryForward: true  },
    { role: 'md', leaveTypeCode: 'PRIV', daysAllowed: 20,  period: 'biannual', carryForward: true  },
    { role: 'md', leaveTypeCode: 'WFH',  daysAllowed: 52,  period: 'biannual', carryForward: false },
    { role: 'md', leaveTypeCode: 'COMP', daysAllowed: 15,  period: 'annual',   carryForward: false },
    { role: 'md', leaveTypeCode: 'ML',   daysAllowed: 15,  period: 'annual',   carryForward: false },
    { role: 'md', leaveTypeCode: 'MPL',  daysAllowed: 180, period: 'annual',   carryForward: false },
    { role: 'md', leaveTypeCode: 'SHRT', daysAllowed: 2,   period: 'monthly',  carryForward: false },
    { role: 'md', leaveTypeCode: 'DL',   daysAllowed: 7,   period: 'annual',   carryForward: false },
    { role: 'md', leaveTypeCode: 'OV',   daysAllowed: 20,  period: 'annual',   carryForward: false },
    { role: 'md', leaveTypeCode: 'LOP',  daysAllowed: 0,   period: 'annual',   carryForward: false },
  ];

  for (const row of rows) {
    // Only insert if not already exists — never overwrite admin changes
    const existing = await LeaveAllocation.findOne({ role: row.role, leaveTypeCode: row.leaveTypeCode });
    if (!existing) {
      await LeaveAllocation.create({ ...row, updatedAt: new Date() });
    }
  }
}

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/office-attendance';

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Seed defaults — only runs when explicitly enabled via RUN_SEEDERS=true
    // Production-safe: seeders are SKIPPED by default on every restart
    if (process.env.RUN_SEEDERS === 'true') {
      console.log('Seeders running: RUN_SEEDERS=true');
      await Role.seedDefaults();
      console.log('  ✓ Roles checked (insert-only)');
      await LeaveType.seedDefaults();
      console.log('  ✓ Leave types checked (insert-only)');
      await CafeMenu.seedDefaults();
      console.log('  ✓ Cafe menus checked (insert-only)');
      try {
        await seedLeaveAllocations();
        console.log('  ✓ Leave allocations checked (insert-only)');
      } catch (err) {
        console.warn('  ⚠ Leave allocations skipped:', err.message);
      }
    } else {
      console.log('Seeders skipped: RUN_SEEDERS is not enabled');
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
