require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const User = require('../src/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/office-attendance';
const TARGET_URL = process.env.DEBUG_UPLOAD_URL || 'http://localhost:3000/api/attendance/bulk-upload/preview';

async function makeMonthlyFile() {
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
  const filePath = path.join(__dirname, 'debug-monthly-biometric-upload.xlsx');
  await fs.writeFile(filePath, buffer);
  return { filePath, buffer };
}

async function main() {
  await mongoose.connect(MONGO_URI);
  const user = await User.findOne({ role: { $in: ['admin', 'hr', 'md'] }, status: 'Active' }).select('_id role name employeeId').lean();
  if (!user) throw new Error('No active admin/hr/md user found for debug token');
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const filePath = process.env.DEBUG_UPLOAD_FILE || null;
  const fileData = filePath
    ? { filePath, buffer: await fs.readFile(filePath) }
    : await makeMonthlyFile();

  const form = new FormData();
  form.append(
    'file',
    new Blob([fileData.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    path.basename(fileData.filePath)
  );

  const res = await fetch(TARGET_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(async () => ({ raw: await res.text() }));

  console.log(JSON.stringify({
    requestUrl: TARGET_URL,
    status: res.status,
    user: { id: user._id, role: user.role, name: user.name, employeeId: user.employeeId },
    filePath: fileData.filePath,
    response: body,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
