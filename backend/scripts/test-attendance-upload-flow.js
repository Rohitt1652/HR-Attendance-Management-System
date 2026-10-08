require('dotenv').config();

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const Attendance = require('../src/models/Attendance');
const User = require('../src/models/User');
const controller = require('../src/controllers/attendanceBulkController');

const users = [
  { _id: 'u-admin-test-1', employeeId: 'EMP-0001', biometricId: '1', name: 'Priyanka Arora', department: 'HR', status: 'Active' },
  { _id: 'u-admin-test-2', employeeId: 'EMP-0002', biometricId: 'BIO-102', name: 'Amit Sharma', department: 'Engineering', status: 'Active' },
  { _id: 'u-admin-test-3', employeeId: 'EMP-0003', biometricId: 'BIO-103', name: 'Rahul Verma', department: 'Finance', status: 'Active' },
];

function chainLean(value) {
  return { select: () => ({ lean: async () => value }) };
}

function mockModels(existingKeys = []) {
  const saved = [];
  const existing = new Set(existingKeys);

  User.find = () => chainLean(users);
  Attendance.find = () => chainLean([...existing].map((key) => {
    const [employeeId, date] = key.split(':');
    return { employeeId, date };
  }));
  Attendance.findOne = async ({ employeeId, date }) => (
    existing.has(`${employeeId}:${date}`) ? { _id: `existing-${employeeId}-${date}` } : null
  );
  Attendance.create = async (doc) => {
    saved.push(doc);
    existing.add(`${doc.employeeId}:${doc.date}`);
    return doc;
  };

  return { saved, existing };
}

function makeReq(file) {
  return { file, body: {} };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function callPreview(file) {
  const req = makeReq(file);
  const res = makeRes();
  await controller.previewAttendanceUpload(req, res, (err) => { throw err; });
  return res;
}

async function callConfirm(rows) {
  const req = { body: { rows } };
  const res = makeRes();
  await controller.confirmAttendanceImport(req, res, (err) => { throw err; });
  return res;
}

function csvFile() {
  const text = [
    'Employee ID,Employee Name,Date,Check In,Check Out,Total Hours,Status',
    'EMP-0001,Priyanka Arora,2026-06-15,09:45,18:15,8.5,Present',
    'EMP-9999,Unknown Person,2026-06-15,09:50,18:00,8.1,Present',
  ].join('\n');
  return {
    originalname: 'normal-biometric.csv',
    mimetype: 'text/csv',
    size: Buffer.byteLength(text),
    buffer: Buffer.from(text),
  };
}

async function xlsxFile() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Attendance');
  sheet.addRow(['Punch ID', 'Log Date', 'First Punch', 'Last Punch', 'Work Duration', 'Attendance Status']);
  sheet.addRow(['BIO-102', '16-06-2026', '10:05 AM', '06:35 PM', '8.5', 'P']);
  sheet.addRow(['BIO-103', '16-06-2026', '09:40 AM', '06:10 PM', '8.5', 'Present']);
  sheet.addRow(['BIO-999', '16-06-2026', '09:30 AM', '06:00 PM', '8.5', 'Present']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    originalname: 'dynamic-columns.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

async function monthlyBlockXlsxFile() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Monthly Summary');
  sheet.addRow(['Attendance Month', 'June 2026']);
  sheet.addRow([]);
  sheet.addRow(['ID: 1 Name: Priyanka Arora']);
  sheet.addRow(['', 1, 2, 3]);
  sheet.addRow(['Punches', '09:3218:46', '09:0609:0918:23', '']);
  sheet.addRow([]);
  sheet.addRow(['ID: BIO-103 Name: Rahul Verma']);
  sheet.addRow(['', 1, 2, 3]);
  sheet.addRow(['Punches', '09:3818:5919:03', '', '10:0019:00']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    originalname: 'monthly-biometric-summary.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

async function monthlySplitIdNameXlsxFile() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Real Device Export');
  sheet.addRow(['Report Month', '2026-06']);
  sheet.addRow([]);
  sheet.addRow(['ID:', '1']);
  sheet.addRow(['Name:', 'Priyanka Arora']);
  sheet.addRow(['', 1, 2, 3, 4, 5]);
  sheet.addRow(['Punch', '09:3218:46', '09:0609:0918:23', '', '09:3818:5919:03', '']);
  sheet.addRow([]);
  sheet.addRow(['ID:', 'BIO-103']);
  sheet.addRow(['Name:', 'Rahul Verma']);
  sheet.addRow(['', 1, 2, 3, 4, 5]);
  sheet.addRow(['Punch', '', '10:0019:00', '09:1518:10', '', '']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    originalname: 'monthly-split-id-name.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

function pdfFile() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve({
        originalname: 'biometric-text-export.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      });
    });
    doc.fontSize(12).text('Biometric Attendance Export');
    doc.text('Machine ID | Attendance Day | In Punch | Out Punch | Hours | State');
    doc.text('1 | 17 Jun 2026 | 09:35 | 18:05 | 8.5 | Present');
    doc.text('BIO-103 | 17 Jun 2026 | 09:55 | 18:25 | 8.5 | Present');
    doc.end();
  });
}

async function runCase(label, file, existingKeys = []) {
  const state = mockModels(existingKeys);
  const preview = await callPreview(file);
  const beforeConfirmSaved = state.saved.length;
  const rows = preview.body?.data?.rows || [];
  const confirm = await callConfirm(rows);
  return {
    label,
    previewStatus: preview.statusCode,
    previewMessage: preview.body?.message,
    parserUsed: preview.body?.data?.parserUsed,
    summary: preview.body?.data?.summary,
    savedBeforeConfirm: beforeConfirmSaved,
    confirmStatus: confirm.statusCode,
    confirmData: confirm.body?.data,
    savedAfterConfirm: state.saved.length,
  };
}

async function main() {
  const results = [];
  results.push(await runCase('Normal CSV', csvFile()));
  results.push(await runCase('XLSX with different column names', await xlsxFile(), ['u-admin-test-2:2026-06-16']));
  results.push(await runCase('Monthly biometric block report', await monthlyBlockXlsxFile()));
  results.push(await runCase('Monthly split ID Name report', await monthlySplitIdNameXlsxFile()));
  results.push(await runCase('PDF/text export', await pdfFile()));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
