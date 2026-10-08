/**
 * Repair migrated Short Leave / WFH time durations from portal_xps_db.json.
 *
 * Dry run:
 *   node scripts/repair-short-leave-duration.js --dry-run
 *
 * Apply:
 *   node scripts/repair-short-leave-duration.js --apply
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Leave = require('../src/models/Leave');
const User = require('../src/models/User');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const SUMMARY_ONLY = process.argv.includes('--summary-only');
const DUMP_ARG = process.argv.find(arg => arg.startsWith('--dump='));
const DUMP_PATH = path.resolve(__dirname, DUMP_ARG ? DUMP_ARG.split('=').slice(1).join('=') : '../../portal_xps_db.json');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/office-attendance';

const TARGET_OLD_TYPES = new Set(['shortleave', 'workfromhome']);
const TARGET_NEW_CODES = new Set(['SL', 'SHORT', 'SHRT', 'SHORTL', 'S.L.', 'WFH', 'WORKF', 'WORKFR', 'W.H.']);

function loadTable(name) {
  const raw = JSON.parse(fs.readFileSync(DUMP_PATH, 'utf8'));
  const table = Object.values(raw).find(x => x && x.name === name);
  return table?.data || [];
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (['SHORT', 'SHRT', 'SHORTL', 'S.L.'].includes(code)) return 'SL';
  if (['WORKF', 'WORKFR', 'W.H.'].includes(code)) return 'WFH';
  return code;
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseLegacyTimeToMinutes(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutesAsTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function getLegacyDuration(row) {
  const startMinutes = parseLegacyTimeToMinutes(row.TimeIn);
  const endMinutes = parseLegacyTimeToMinutes(row.TimeOut);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
  const durationMinutes = endMinutes - startMinutes;
  return {
    startTime: formatMinutesAsTime(startMinutes),
    endTime: formatMinutesAsTime(endMinutes),
    durationMinutes,
    durationHours: Math.round((durationMinutes / 60) * 10) / 10,
  };
}

function oldStatus(row) {
  if (row.IsDelete === 'Y') return 'Rejected';
  if (row.IsApproved === 'Y') return 'Approved';
  return 'Pending';
}

function isTargetLeave(leave) {
  const code = normalizeCode(leave.leaveTypeCode);
  const name = normalize(leave.leaveType);
  return TARGET_NEW_CODES.has(code) || name.includes('short leave') || name.includes('work from home');
}

function isMissingTime(leave) {
  return !leave.startTime && !leave.endTime && !leave.durationMinutes && !leave.durationHours && !leave.totalHours;
}

async function findMatch(row, user, duration) {
  const start = new Date(`${row.StartDate}T00:00:00.000Z`);
  const end = new Date(`${row.StartDate}T23:59:59.999Z`);
  const baseQuery = {
    employeeId: user._id,
    startDate: { $gte: start, $lte: end },
  };
  const candidates = (await Leave.find(baseQuery).lean())
    .filter(isTargetLeave)
    .filter(isMissingTime);

  const status = oldStatus(row);
  const reason = normalize(row.Reason);
  const oldCode = row.LeaveType === 'workfromhome' ? 'WFH' : 'SL';

  const passes = [
    candidates.filter(l => normalizeCode(l.leaveTypeCode) === oldCode && l.status === status && normalize(l.reason) === reason),
    candidates.filter(l => normalizeCode(l.leaveTypeCode) === oldCode && normalize(l.reason) === reason),
    candidates.filter(l => normalizeCode(l.leaveTypeCode) === oldCode && l.status === status),
    candidates.filter(l => normalizeCode(l.leaveTypeCode) === oldCode),
  ];

  const matched = passes.find(items => items.length === 1);
  if (matched) return { leave: matched[0], reason: 'matched' };
  if (candidates.length === 0) return { reason: 'no matching missing-time leave' };
  return { reason: `ambiguous (${candidates.length} candidates)` };
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN: no database writes' : 'APPLY MODE: database updates enabled');
  console.log(`Dump: ${DUMP_PATH}`);

  const oldEmployees = loadTable('hrm_employee');
  const oldEmployeeById = new Map(oldEmployees.map(emp => [String(emp.Id), emp]));
  const oldRows = loadTable('hrm_leaveapproval')
    .filter(row => TARGET_OLD_TYPES.has(normalize(row.LeaveType)))
    .map(row => ({ row, duration: getLegacyDuration(row) }))
    .filter(item => item.duration);

  console.log(`Old timed Short Leave/WFH rows found: ${oldRows.length}`);

  await mongoose.connect(MONGO_URI);

  let proposed = 0;
  let skipped = 0;
  let updated = 0;
  const manualReview = [];
  const updates = [];
  const backups = [];
  const userCache = new Map();

  for (const { row, duration } of oldRows) {
    const oldEmployee = oldEmployeeById.get(String(row.EmpId));
    const employeeLookupKey = oldEmployee?.EmpId || row.EmpId;
    let user = userCache.get(employeeLookupKey);
    if (!userCache.has(employeeLookupKey)) {
      const lookup = [{ employeeId: employeeLookupKey }];
      if (oldEmployee?.EmailId) lookup.push({ email: normalize(oldEmployee.EmailId) });
      user = await User.findOne({ $or: lookup }).select('_id employeeId name email').lean();
      userCache.set(employeeLookupKey, user);
    }
    if (!user) {
      skipped++;
      manualReview.push({ oldLeaveId: row.Id, empId: row.EmpId, employeeCode: employeeLookupKey, reason: 'employee not found' });
      continue;
    }

    const match = await findMatch(row, user, duration);
    if (!match.leave) {
      skipped++;
      manualReview.push({ oldLeaveId: row.Id, empId: row.EmpId, leaveType: row.LeaveType, date: row.StartDate, reason: match.reason });
      continue;
    }

    proposed++;
    const update = {
      oldLeaveId: row.Id,
      employeeId: String(user._id),
      employeeCode: row.EmpId,
      employeeName: user.name,
      leaveId: String(match.leave._id),
      leaveType: match.leave.leaveType,
      date: dateOnly(match.leave.startDate),
      oldDuration: `${match.leave.totalDays ?? '?'} day(s)`,
      TimeIn: row.TimeIn,
      TimeOut: row.TimeOut,
      newDurationMinutes: duration.durationMinutes,
      startTime: duration.startTime,
      endTime: duration.endTime,
    };
    updates.push(update);
    if (!SUMMARY_ONLY) {
      console.log(`${APPLY ? '[APPLY]' : '[DRY]'} ${update.employeeCode} ${update.leaveType} ${update.date}: ${update.oldDuration} -> ${update.newDurationMinutes}m (${row.TimeIn} - ${row.TimeOut})`);
    }

    if (APPLY) {
      backups.push(match.leave);
      await Leave.updateOne(
        { _id: match.leave._id },
        {
          $set: {
            durationType: 'hourly',
            startTime: duration.startTime,
            endTime: duration.endTime,
            totalHours: duration.durationHours,
            durationMinutes: duration.durationMinutes,
            durationHours: duration.durationHours,
            totalDays: null,
          },
        }
      );
      updated++;
    }
  }

  let backupPath = null;
  if (APPLY && backups.length) {
    const backupDir = path.resolve(__dirname, '../backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(backupDir, `leave-duration-repair-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), records: backups }, null, 2));
  }

  console.log('\nSummary');
  console.log(`Proposed updates: ${proposed}`);
  console.log(`Applied updates: ${updated}`);
  console.log(`Skipped/manual review: ${skipped}`);
  if (backupPath) console.log(`Backup file: ${backupPath}`);
  if (manualReview.length) {
    console.log('\nNeeds manual review sample:');
    console.log(JSON.stringify(manualReview.slice(0, 20), null, 2));
  }

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
