const Attendance = require('../models/Attendance');
const Settings = require('../models/Settings');
const User = require('../models/User');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { PDFParse } = require('pdf-parse');
const { OpenAI } = require('openai');
const { interpretPunches } = require('../utils/punchInterpretationUtils');


const ALLOWED_EXTS = ['xlsx', 'xls', 'csv', 'pdf'];
const GROQ_MAX_PROMPT_CHARS = 9000;
const GROQ_SAMPLE_ROWS = 20;
const LARGE_TEXT_LIMIT = 120000;
const STATUS_MAP = {
  p: 'Present',
  present: 'Present',
  full: 'Full Day',
  fullday: 'Full Day',
  'full day': 'Full Day',
  half: 'Half Day',
  halfday: 'Half Day',
  'half day': 'Half Day',
  a: 'Absent',
  absent: 'Absent',
  leave: 'On Leave',
  onleave: 'On Leave',
  'on leave': 'On Leave',
  holiday: 'Holiday',
  weekend: 'Weekend',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

exports.uploadMiddleware = upload.single('file');

function fileExt(name = '') {
  return name.split('.').pop()?.toLowerCase() || '';
}

function detectFileType(file) {
  const ext = fileExt(file.originalname);
  const mime = file.mimetype;
  const b = file.buffer || Buffer.alloc(0);
  const signature = b.slice(0, 8).toString('hex');
  const isZipWorkbook = b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
  const isOleWorkbook = signature === 'd0cf11e0a1b11ae1';

  if (!ALLOWED_EXTS.includes(ext)) return { ok: false, ext, mime, reason: 'Unsupported file type' };
  if (ext === 'pdf' && b.slice(0, 4).toString() !== '%PDF') return { ok: false, ext, mime, reason: 'Invalid PDF file' };
  if (ext === 'xlsx' && !isZipWorkbook) return { ok: false, ext, mime, reason: 'Invalid XLSX file. Please upload a real .xlsx file or export as CSV.' };
  if (ext === 'xls' && !isZipWorkbook && !isOleWorkbook) {
    return { ok: false, ext, mime, reason: 'Invalid XLS file. Please export it as .xlsx or CSV and try again.' };
  }
  return { ok: true, ext, mime, signature, isOleWorkbook };
}

function normalizeKey(k) {
  return String(k || '').toLowerCase().replace(/[\s_\-.()/]+/g, '');
}

function findCol(row, variants) {
  const wanted = variants.map(normalizeKey);
  for (const [k, val] of Object.entries(row)) {
    if (wanted.includes(normalizeKey(k))) return val;
  }
  return null;
}

function valueByHeader(row, header) {
  if (!row || !header) return null;
  const wanted = normalizeKey(header);
  for (const [k, val] of Object.entries(row)) {
    if (normalizeKey(k) === wanted) return val;
  }
  return null;
}

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCSV(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], text };
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h || `Column ${i + 1}`] = vals[i] || ''; });
    return row;
  });
  return { rows, text };
}

async function parseExcel(buffer, ext) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (err) {
    console.warn('[Attendance Upload] Excel parse failed:', err.message);
    const message = err.message?.includes('central directory')
      ? 'This file is not a valid XLSX workbook. Please export it as .xlsx or CSV and try again.'
      : `Could not read Excel file: ${err.message}`;
    const e = new Error(message);
    e.statusCode = ext === 'xls' ? 422 : 400;
    throw e;
  }

  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], text: '', matrix: [] };
  console.log('[Attendance Upload] worksheet name:', ws.name);

  const matrix = [];
  ws.eachRow({ includeEmpty: false }, row => {
    matrix.push(row.values.slice(1).map(v => {
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === 'object' && v?.text) return v.text;
      if (typeof v === 'object' && v?.result !== undefined) return v.result;
      return v ?? '';
    }));
  });
  console.log('[Attendance Upload] first 20 Excel rows:', matrix.slice(0, 20).map((r, i) => ({ row: i + 1, values: r })));

  const headerIndex = matrix.findIndex(r => r.filter(Boolean).length >= 2);
  if (headerIndex === -1) return { rows: [], text: '', matrix };
  const headers = matrix[headerIndex].map((h, i) => String(h || `Column ${i + 1}`).trim());
  const rows = matrix.slice(headerIndex + 1).filter(r => r.some(Boolean)).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
  const text = matrix.map(r => r.join('\t')).join('\n');
  return { rows, text, matrix, worksheetName: ws.name };
}

async function parsePDF(buffer) {
  const parser = new PDFParse({ data: buffer, verbosity: 0 });
  const result = await parser.getText();
  const text = result.text?.trim() || '';
  return { rows: [], text };
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dm = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dm) {
    const y = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
    return `${y}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseTimeString(val) {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return `${String(val.getHours()).padStart(2, '0')}:${String(val.getMinutes()).padStart(2, '0')}`;
  if (typeof val === 'number' && val >= 0 && val < 1) {
    const mins = Math.round(val * 24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const mer = m[3]?.toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function parsePunches(val) {
  if (val === null || val === undefined || val === '') return [];
  if (val instanceof Date) return [parseTimeString(val)].filter(Boolean);
  const s = String(val).trim();
  if (!s || /^[-_]+$/.test(s)) return [];
  const direct = [...s.matchAll(/(\d{1,2}):(\d{2})/g)]
    .map(m => parseTimeString(`${m[1]}:${m[2]}`))
    .filter(Boolean);
  if (direct.length) return direct;

  const digits = s.replace(/\D/g, '');
  const punches = [];
  for (let i = 0; i + 3 < digits.length; i += 4) {
    const h = Number(digits.slice(i, i + 2));
    const m = Number(digits.slice(i + 2, i + 4));
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) punches.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return punches;
}

function cleanEmployeeName(name) {
  const cleaned = String(name || '')
    .replace(/\s+Dept\.?\s*[:：].*$/i, '')
    .replace(/\s+Department\s*[:：].*$/i, '')
    .trim();
  return /^(Dept\.?|Department)\s*[:：]/i.test(cleaned) ? '' : cleaned;
}

function excelSerialToDate(serial) {
  if (typeof serial !== 'number') return null;
  const d = new Date((serial - 25569) * 86400 * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function findReportYearMonth(matrix) {
  const joined = matrix.slice(0, 12).map(r => r.join(' ')).join(' ');
  const ym = joined.match(/\b(20\d{2})[-/](\d{1,2})\b/);
  if (ym) return { year: Number(ym[1]), month: Number(ym[2]) };
  const monthNames = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';
  const named = joined.match(new RegExp(`\\b(${monthNames})\\w*\\s+(20\\d{2})\\b`, 'i'));
  if (named) {
    const idx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].findIndex(m => named[1].toLowerCase().startsWith(m));
    return { year: Number(named[2]), month: idx + 1 };
  }
  return null;
}

function parseIdNameFromText(line) {
  const id = line.match(/\bID\s*[:：]\s*([A-Za-z0-9_-]+)/i)?.[1] || null;
  const name = cleanEmployeeName(line.match(/\bName\s*[:：]\s*(.+?)(?=\s+\b(?:Dept\.?|Department|ID|Code)\b\s*[:：]|$)/i)?.[1]);
  return { id, name };
}

function parseIdNameFromRow(row) {
  return parseIdNameFromText(row.join(' '));
}

function detectEmployeeBlock(matrix, rowIndex) {
  const current = parseIdNameFromRow(matrix[rowIndex] || []);
  let id = current.id;
  let name = current.name;

  for (let r = rowIndex; r < Math.min(matrix.length, rowIndex + 4); r++) {
    const row = matrix[r] || [];
    const line = row.join(' ');
    const info = parseIdNameFromText(line);
    if (!id && info.id) id = info.id;
    if (!name && info.name) name = info.name;

    row.forEach((cell, idx) => {
      const text = String(cell || '').trim();
      if (!id && /^ID\s*[:：]?$/i.test(text)) {
        const next = row[idx + 1];
        if (next !== undefined && next !== '') id = String(next).trim();
      }
      if (!name && /^Name\s*[:：]?$/i.test(text)) {
        const next = row[idx + 1];
        if (next !== undefined && next !== '') name = cleanEmployeeName(next);
      }
    });
  }

  return id || name ? { id, name } : null;
}

function rowStartsEmployeeBlock(row) {
  const info = parseIdNameFromRow(row || []);
  if (info.id || info.name) return true;
  return (row || []).some(cell => /^ID\s*[:：]?$/i.test(String(cell || '').trim()));
}

function detectDayColumns(matrix, fromIndex) {
  let best = null;
  const end = Math.min(matrix.length, fromIndex + 8);
  for (let r = fromIndex; r < end; r++) {
    const cols = [];
    matrix[r].forEach((cell, c) => {
      const raw = String(cell ?? '').trim();
      const day = typeof cell === 'number' ? cell : (/^\d{1,2}$/.test(raw) ? Number(raw) : null);
      if (day >= 1 && day <= 31) cols.push({ day, col: c });
    });
    if (cols.length >= 2 && (!best || cols.length > best.cols.length)) best = { rowIndex: r, cols };
  }
  return best;
}

function parseMonthlyBiometricReport(matrix, fallbackYearMonth = null, settings = {}) {
  if (!Array.isArray(matrix) || !matrix.length) {
    return { records: [], debug: { detected: false, reason: 'No Excel matrix available' } };
  }
  const yearMonth = fallbackYearMonth || findReportYearMonth(matrix);
  if (!yearMonth?.year || !yearMonth?.month) {
    console.log('[Attendance Upload] monthly detector false: missing report year/month');
    return { records: [], debug: { detected: false, reason: 'Missing report year/month' } };
  }

  const records = [];
  const employeeBlocks = [];
  const failures = [];
  const globalDayHeader = detectDayColumns(matrix, 0);
  for (let r = 0; r < matrix.length; r++) {
    const info = detectEmployeeBlock(matrix, r);
    if (!info) continue;
    employeeBlocks.push({ row: r + 1, id: info.id, name: info.name });

    const localDayHeader = detectDayColumns(matrix, r + 1);
    const dayHeader = localDayHeader || globalDayHeader;
    if (!dayHeader) {
      console.log('[Attendance Upload] monthly detector found employee but no day columns:', { row: r + 1, info });
      failures.push({ row: r + 1, id: info.id, name: info.name, reason: 'No day columns found after employee block' });
      continue;
    }
    const nextBlock = matrix.findIndex((row, idx) => idx > r && rowStartsEmployeeBlock(row));
    const fallbackBlockStart = dayHeader.rowIndex > r ? dayHeader.rowIndex : r;
    const blockEnd = nextBlock === -1 ? Math.min(matrix.length, fallbackBlockStart + 12) : nextBlock;
    const dataStart = dayHeader.rowIndex > r ? dayHeader.rowIndex + 1 : r + 1;

    dayHeader.cols.forEach(({ day, col }) => {
      const punches = [];
      for (let rr = dataStart; rr < blockEnd; rr++) {
        punches.push(...parsePunches(matrix[rr]?.[col]));
      }
      const uniquePunches = [...new Set(punches)].sort();
      if (!uniquePunches.length) return;
      const date = `${yearMonth.year}-${String(yearMonth.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const interpreted = interpretPunches(uniquePunches, date, settings);
      records.push({
        rowNumber: r + 1,
        biometricId: info.id,
        employeeName: cleanEmployeeName(info.name),
        date,
        checkIn: interpreted.checkIn,
        checkOut: interpreted.checkOut,
        directionalIssue: interpreted.directionalIssue,
        punches: uniquePunches,
        totalHours: null,
        status: 'Present',
        raw: { punches: uniquePunches, blockStart: r + 1, day },
      });
    });

    r = Math.max(r, blockEnd - 1);
  }
  console.log('[Attendance Upload] monthly detector result:', { detected: records.length > 0, rows: records.length });
  return {
    records,
    debug: {
      detected: records.length > 0,
      reason: records.length > 0 ? null : (employeeBlocks.length ? 'Employee blocks found but no attendance day records parsed' : 'No ID/Name employee blocks found'),
      yearMonth,
      employeeBlocks: employeeBlocks.slice(0, 10),
      failures: failures.slice(0, 10),
      parsedRows: records.length,
    },
  };
}

function toDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const [hour, minute] = String(timeStr).split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  const d = new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(status, checkIn) {
  const key = String(status || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return STATUS_MAP[key] || (checkIn ? 'Present' : 'Absent');
}

function normalParserRows(rows, settings = {}) {
  return rows.map((row, idx) => {
    const biometricId = findCol(row, ['Biometric ID', 'BiometricID', 'Machine ID', 'MachineID', 'Punch ID', 'PunchID', 'User ID', 'UserID', 'Device ID', 'DeviceID', 'Enroll ID', 'EnrollID']);
    const employeeCode = findCol(row, ['Employee ID', 'EmployeeID', 'Emp ID', 'EmpID', 'Employee Code', 'EmployeeCode', 'Emp Code', 'EmpCode', 'Staff Code', 'StaffCode']);
    const employeeName = findCol(row, ['Employee Name', 'Name', 'Employee', 'Emp Name', 'Staff Name']);
    const date = findCol(row, ['Date', 'Attendance Date', 'Punch Date', 'Log Date', 'Day']);
    const checkInCol = findCol(row, ['Check In', 'CheckIn', 'In Time', 'InTime', 'First In', 'First Punch', 'Time In']);
    const checkOutCol = findCol(row, ['Check Out', 'CheckOut', 'Out Time', 'OutTime', 'Last Out', 'Last Punch', 'Time Out']);
    const totalHours = findCol(row, ['Total Hours', 'TotalHours', 'Hours', 'Worked Hours', 'Work Duration', 'Duration']);
    const status = findCol(row, ['Status', 'Attendance Status', 'Present/Absent']);

    const rawTimes = [];
    if (checkInCol) rawTimes.push(parseTimeString(checkInCol));
    if (checkOutCol) rawTimes.push(parseTimeString(checkOutCol));
    const validRawTimes = rawTimes.filter(Boolean);

    let checkIn = parseTimeString(checkInCol);
    let checkOut = parseTimeString(checkOutCol);
    let directionalIssue = null;

    if (validRawTimes.length === 1) {
      const interpreted = interpretPunches(validRawTimes, date, settings);
      checkIn = interpreted.checkIn;
      checkOut = interpreted.checkOut;
      directionalIssue = interpreted.directionalIssue;
    }

    return { rowNumber: idx + 2, employeeCode, biometricId, employeeName, date, checkIn, checkOut, directionalIssue, totalHours, status, raw: row };
  });
}

function rowsToSample(rows, maxRows = GROQ_SAMPLE_ROWS) {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return {
    headers,
    sampleRows: rows.slice(0, maxRows).map((row, idx) => ({ rowNumber: idx + 1, ...row })),
  };
}

function makePromptSafe(text) {
  if (text.length <= GROQ_MAX_PROMPT_CHARS) return text;
  const err = new Error('File is too large for AI parsing. Please upload smaller date range or CSV/XLSX.');
  err.statusCode = 413;
  throw err;
}

function parseDelimitedTextTable(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const delimiterCandidates = ['\t', '|', ',', ';'];
  let best = null;

  for (const delimiter of delimiterCandidates) {
    for (let i = 0; i < Math.min(lines.length, 80); i++) {
      const parts = lines[i].split(delimiter).map(p => p.trim()).filter(Boolean);
      if (parts.length < 3) continue;
      const headerScore = parts.filter(p => /date|day|time|punch|in|out|status|state|employee|code|name|machine|user|device|enroll|hour/i.test(p)).length;
      if (headerScore >= 2 && (!best || parts.length > best.headers.length)) {
        best = { delimiter, headerIndex: i, headers: parts };
      }
    }
  }

  if (!best) return [];
  return lines.slice(best.headerIndex + 1).map((line) => {
    const vals = best.delimiter === ',' ? parseCSVLine(line) : line.split(best.delimiter).map(p => p.trim());
    if (vals.filter(Boolean).length < 2) return null;
    const row = {};
    best.headers.forEach((h, i) => { row[h || `Column ${i + 1}`] = vals[i] || ''; });
    return row;
  }).filter(Boolean);
}

function recordsFromMapping(rows, mapping = {}) {
  const pick = (row, key) => valueByHeader(row, mapping[key]);
  return rows.map((row, idx) => ({
    rowNumber: idx + 2,
    biometricId: pick(row, 'biometricId'),
    employeeCode: pick(row, 'employeeCode'),
    employeeName: pick(row, 'employeeName'),
    date: pick(row, 'date'),
    checkIn: pick(row, 'checkIn'),
    checkOut: pick(row, 'checkOut'),
    totalHours: pick(row, 'totalHours'),
    status: pick(row, 'status'),
    isLate: pick(row, 'isLate'),
    raw: row,
  }));
}

function parserLooksWeak(records) {
  if (!records.length) return true;
  const useful = records.filter(r => (r.biometricId || r.employeeCode || r.employeeName) && r.date && (r.checkIn || r.checkOut || r.status));
  return useful.length < Math.max(1, Math.ceil(records.length * 0.5));
}

async function getGroqColumnMapping(rows, rawText = '') {
  if (!process.env.GROQ_API_KEY) {
    const err = new Error('Groq API key is not configured');
    err.statusCode = 503;
    throw err;
  }
  const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
  const sample = rowsToSample(rows);
  const ambiguousRows = rows
    .filter(row => Object.values(row).some(v => String(v || '').match(/\d{1,2}:\d{2}|present|absent|^p$|^a$/i)))
    .slice(0, 10);
  const payload = {
    headers: sample.headers,
    sampleRows: sample.sampleRows,
    ambiguousRows,
    textPreview: rawText ? rawText.slice(0, 2000) : undefined,
  };
  const prompt = makePromptSafe(`You are mapping columns for a biometric attendance import.
Return ONLY one valid JSON object with these keys:
employeeName, employeeCode, biometricId, date, checkIn, checkOut, totalHours, status, isLate.
Each value must be the exact source column/header name, or null if unavailable.
Map Machine ID, User ID, Punch ID, Device ID, Enroll ID, or biometric device numbers to biometricId.
Use employeeCode only when the source explicitly labels the value as employee code or employee ID.
Do not return attendance rows. Do not include explanations.

Source sample:
${JSON.stringify(payload)}`);
  console.log('[Attendance Upload] Groq mapping request chars:', prompt.length, 'rows:', rows.length, 'sampleRows:', sample.sampleRows.length);
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 600,
  });
  let response = completion.choices[0]?.message?.content?.trim() || '';
  console.log('[Attendance Upload] Groq mapping response preview:', response.slice(0, 300));
  response = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');
  if (start !== -1 && end !== -1) response = response.slice(start, end + 1);
  const parsed = JSON.parse(response);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

function levenshtein(a, b) {
  a = String(a || '').toLowerCase();
  b = String(b || '').toLowerCase();
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function normalizeCode(value) {
  return String(value || '').toLowerCase().trim();
}

function numericCodePart(value) {
  const normalized = normalizeCode(value);
  if (!normalized) return '';
  const parts = normalized.match(/\d+/g);
  return parts ? parts.join('') : '';
}

function setUnique(map, key, user) {
  if (!key) return;
  if (map.has(key)) {
    map.set(key, null);
    return;
  }
  map.set(key, user);
}

function buildUserMatcher(users) {
  const byBiometricId = new Map();
  const byEmployeeCode = new Map();
  const byEmployeeCodeNumber = new Map();
  const byName = new Map();
  users.forEach(u => {
    [u.biometricId, u.biometricCode].filter(Boolean).forEach(code => byBiometricId.set(normalizeCode(code), u));
    if (u.employeeId) {
      byEmployeeCode.set(normalizeCode(u.employeeId), u);
      setUnique(byEmployeeCodeNumber, numericCodePart(u.employeeId), u);
    }
    if (u.name) byName.set(u.name.toLowerCase().trim(), u);
  });
  return (record) => {
    const biometricId = normalizeCode(record.biometricId);
    if (biometricId && byBiometricId.has(biometricId)) return { user: byBiometricId.get(biometricId), method: 'biometric_id' };
    const employeeCode = normalizeCode(record.employeeCode);
    if (employeeCode && byEmployeeCode.has(employeeCode)) return { user: byEmployeeCode.get(employeeCode), method: 'employee_code' };
    const biometricNumeric = numericCodePart(biometricId);
    const employeeCodeNumeric = numericCodePart(employeeCode);
    const numericLookup = employeeCodeNumeric || biometricNumeric;
    if (numericLookup && byEmployeeCodeNumber.has(numericLookup)) {
      const user = byEmployeeCodeNumber.get(numericLookup);
      if (user) return { user, method: biometricId ? 'biometric_id_to_employee_code_number' : 'employee_code_number' };
    }
    const name = String(record.employeeName || '').toLowerCase().trim();
    if (name && byName.has(name)) return { user: byName.get(name), method: biometricId ? 'exact_name_after_unmapped_biometric' : 'exact_name' };
    if (name) {
      let best = null;
      let bestScore = Infinity;
      users.forEach(u => {
        const dist = levenshtein(name, u.name || '');
        const score = dist / Math.max(name.length, String(u.name || '').length, 1);
        if (score < bestScore) { best = u; bestScore = score; }
      });
      if (best && bestScore <= 0.25) return { user: best, method: biometricId ? 'fuzzy_name_after_unmapped_biometric' : 'fuzzy_name', score: Number(bestScore.toFixed(2)) };
    }
    if (biometricId) return { user: null, method: 'unmatched_biometric_id' };
    return { user: null, method: 'unmatched' };
  };
}

async function buildPreview(records, parserUsed) {
  const users = await User.find({ status: 'Active' }).select('_id employeeId biometricId biometricCode name department').lean();
  const matchUser = buildUserMatcher(users);
  const seen = new Set();
  const existingMap = new Map();
  const dates = records.map(r => parseDate(r.date)).filter(Boolean);
  const minDate = dates.sort()[0];
  const maxDate = dates.sort().slice(-1)[0];
  if (minDate && maxDate) {
    const existing = await Attendance.find({ date: { $gte: minDate, $lte: maxDate } })
      .select('employeeId date source workMode checkIn checkOut status')
      .lean();
    existing.forEach(r => existingMap.set(`${r.employeeId}:${r.date}`, r));
  }

  let matched = 0, unmatched = 0, invalid = 0, duplicates = 0;
  let matchedByBiometricId = 0, matchedByEmployeeCode = 0, matchedByName = 0;
  let portalConflicts = 0, wfhConflicts = 0;
  const previewRows = records.map((r, idx) => {
    const date = parseDate(r.date);
    const inTime = parseTimeString(r.checkIn);
    const outTime = parseTimeString(r.checkOut);
    const checkIn = toDateTime(date, inTime);
    const checkOut = toDateTime(date, outTime);
    const match = matchUser(r);
    const totalHours = parseFloat(r.totalHours) || (checkIn && checkOut && checkOut > checkIn ? Number(((checkOut - checkIn) / 3600000).toFixed(2)) : null);
    const status = normalizeStatus(r.status, checkIn);
    const isLate = r.isLate === true || String(r.isLate).toLowerCase() === 'true' || (checkIn && (checkIn.getHours() > 10 || (checkIn.getHours() === 10 && checkIn.getMinutes() > 0)));
    const key = match.user && date ? `${match.user._id}:${date}` : null;
    
    const existingDoc = key ? existingMap.get(key) : null;
    const isNewRecord = !existingDoc;
    const isExistingBiometric = Boolean(existingDoc && existingDoc.source === 'biometric');
    const isPortalConflict = Boolean(
      existingDoc && (existingDoc.source === 'portal' || existingDoc.source === 'manual')
    );
    const isWfhConflict = Boolean(existingDoc && existingDoc.workMode === 'wfh');
    const isSkippedConflict = isPortalConflict || isWfhConflict;
    const conflictReason = isWfhConflict
      ? 'Skipped: Assigned WFH record in portal'
      : (isPortalConflict ? 'Skipped: Existing portal/manual attendance record' : null);

    if (isPortalConflict) portalConflicts++;
    if (isWfhConflict) wfhConflicts++;

    const duplicate = key ? seen.has(key) : false;
    if (key) seen.add(key);

    const invalidReason = !date ? 'Invalid date' : (!checkIn && !checkOut && status === 'Present' ? 'Missing check-in/check-out' : null);
    if (match.user) {
      matched++;
      if (match.method === 'biometric_id') matchedByBiometricId++;
      else if (['employee_code', 'employee_code_number', 'biometric_id_to_employee_code_number'].includes(match.method)) matchedByEmployeeCode++;
      else if (['exact_name', 'fuzzy_name', 'exact_name_after_unmapped_biometric', 'fuzzy_name_after_unmapped_biometric'].includes(match.method)) matchedByName++;
    } else unmatched++;
    if (invalidReason) invalid++;
    if (duplicate) duplicates++;
    return {
      rowId: idx + 1,
      rowNumber: r.rowNumber || idx + 1,
      employeeName: r.employeeName || '',
      employeeCode: r.employeeCode || '',
      biometricId: r.biometricId || '',
      matchedEmployee: match.user ? { _id: match.user._id, name: match.user.name, employeeId: match.user.employeeId, biometricId: match.user.biometricId, department: match.user.department } : null,
      matchMethod: match.method,
      date,
      checkIn: inTime,
      checkOut: outTime,
      punches: Array.isArray(r.punches) ? r.punches : [inTime, outTime].filter(Boolean),
      totalHours,
      status,
      isLate,
      duplicate,
      isNewRecord,
      isExistingBiometric,
      isPortalConflict,
      isWfhConflict,
      isSkippedConflict,
      conflictReason,
      invalidReason,
      canImport: Boolean(match.user && date && !invalidReason && !isSkippedConflict),
      raw: r.raw,
    };
  });

  console.log('[Attendance Upload] matched users:', matched, 'unmatched rows:', unmatched);
  return {
    parserUsed,
    rows: previewRows,
    summary: {
      totalRows: previewRows.length,
      matched,
      matchedByBiometricId,
      matchedByEmployeeCode,
      matchedByName,
      unmatched,
      invalid,
      duplicates,
      portalConflicts,
      wfhConflicts,
      skippedConflicts: portalConflicts + wfhConflicts,
      importable: previewRows.filter(r => r.canImport).length,
    },
  };
}

exports.buildPreview = buildPreview;

async function extractFile(file) {
  const detected = detectFileType(file);
  console.log('[Attendance Upload] file received:', { name: file.originalname, size: file.size, mime: file.mimetype });
  console.log('[Attendance Upload] file type detected:', detected);
  if (!detected.ok) {
    const err = new Error(detected.reason);
    err.statusCode = 400;
    throw err;
  }
  if (detected.ext === 'csv') return { ...parseCSV(file.buffer), ext: detected.ext };
  if (['xlsx', 'xls'].includes(detected.ext)) {
    if (detected.isOleWorkbook) {
      const err = new Error('Legacy .xls files are valid uploads, but this server can only parse XML Excel workbooks reliably. Please save the file as .xlsx or CSV and upload again.');
      err.statusCode = 422;
      throw err;
    }
    return { ...(await parseExcel(file.buffer, detected.ext)), ext: detected.ext };
  }
  if (detected.ext === 'pdf') return { ...(await parsePDF(file.buffer)), ext: detected.ext };
  return { rows: [], text: '', ext: detected.ext };
}

exports.previewAttendanceUpload = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    console.log('[Attendance Upload] preview endpoint parser registry active:', {
      fileName: req.file.originalname,
      parsers: ['monthly-biometric-report', 'normal-parser', 'groq-fallback'],
    });
    const extracted = await extractFile(req.file);
    const parserDebug = {
      controllerVersion: 'monthly-parser-v2',
      selectedParser: null,
      monthlyDetected: false,
      fileName: req.file.originalname,
      monthlyFailureReason: null,
      worksheetName: extracted.worksheetName || null,
    };
    let sourceRows = extracted.rows || [];
    if (!sourceRows.length && extracted.text) {
      sourceRows = parseDelimitedTextTable(extracted.text);
      console.log('[Attendance Upload] text table extraction result:', { rows: sourceRows.length });
    }

    const settings = await Settings.getGlobal();
    const monthlyResult = parseMonthlyBiometricReport(extracted.matrix, null, settings);
    let records = monthlyResult.records || [];
    parserDebug.monthlyDetected = !!monthlyResult.debug?.detected;
    parserDebug.monthlyFailureReason = monthlyResult.debug?.reason || null;
    parserDebug.monthly = monthlyResult.debug || null;
    let parserUsed = 'normal';
    if (records.length) {
      parserUsed = 'monthly-biometric-report';
      parserDebug.selectedParser = parserUsed;
      console.log('[Attendance Upload] monthly biometric report parser result:', { rows: records.length });
    } else {
      console.log('[Attendance Upload] monthly biometric report detector returned false');
      records = normalParserRows(sourceRows, settings);
      parserUsed = 'normal-parser';
      parserDebug.selectedParser = parserUsed;
    }
    console.log('[Attendance Upload] parser selected:', parserUsed);
    console.log('[Attendance Upload] normal parser result:', { rows: records.length, weak: parserLooksWeak(records) });

    if (parserLooksWeak(records)) {
      if (!sourceRows.length) {
        if ((extracted.text || '').length > LARGE_TEXT_LIMIT) {
          return res.status(413).json({ success: false, message: 'File is too large for AI parsing. Please upload smaller date range or CSV/XLSX.', parserDebug });
        }
        return res.status(422).json({ success: false, message: 'Could not understand the attendance file. Please upload a text-based PDF, Excel, or CSV file.', parserDebug });
      }
      const mapping = await getGroqColumnMapping(sourceRows, extracted.text || '');
      console.log('[Attendance Upload] Groq mapping result:', mapping);
      records = recordsFromMapping(sourceRows, mapping);
      parserUsed = 'grok-mapping';
      parserDebug.selectedParser = 'groq-fallback';
      parserDebug.groqMapping = mapping;
      console.log('[Attendance Upload] parser selected:', 'groq-fallback');
      console.log('[Attendance Upload] mapped parser result:', { rows: records.length, weak: parserLooksWeak(records) });
      if (parserLooksWeak(records)) {
        return res.status(422).json({ success: false, message: 'Could not understand the attendance columns. Please upload CSV/XLSX with clearer headers or a smaller date range.', parserDebug });
      }
    }

    const preview = await buildPreview(records, parserUsed);
    preview.parserDebug = parserDebug;
    if (!preview.rows.length) {
      console.warn('[Attendance Upload] no valid attendance records found:', preview.summary);
      return res.status(422).json({ success: false, message: 'No valid attendance records found', data: preview, parserDebug });
    }
    console.log('[Attendance Upload] preview generated:', preview.summary);
    res.json({
      success: true,
      data: preview,
      parserDebug,
      message: preview.summary.importable === 0
        ? 'Preview generated. No rows are importable until biometric IDs are mapped to employees.'
        : 'Preview generated',
    });
  } catch (err) {
    console.error('[Attendance Upload] parsing failed:', err.message);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Parsing failed' });
  }
};

exports.confirmAttendanceImport = async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ success: false, message: 'No preview rows supplied' });

    const targetEmployeeIds = [...new Set(rows.map(r => r.matchedEmployee?._id).filter(Boolean))];
    const targetDates = [...new Set(rows.map(r => r.date).filter(Boolean))];

    const existingRecords = await Attendance.find({
      employeeId: { $in: targetEmployeeIds },
      date: { $in: targetDates }
    }).select('employeeId date source workMode checkIn checkOut status').lean();

    const existingMap = new Map();
    existingRecords.forEach(r => existingMap.set(`${r.employeeId}:${r.date}`, r));

    let skippedInvalid = 0;
    let skippedConflictCount = 0;
    const operations = [];
    const keys = new Set();
    let maxImportedDate = '';

    for (const r of rows) {
      if (!r.matchedEmployee?._id || !r.date) { skippedInvalid++; continue; }
      const key = `${r.matchedEmployee._id}:${r.date}`;
      if (keys.has(key)) continue;

      const existingDoc = existingMap.get(key);
      const isPortalConflict = Boolean(
        existingDoc && (existingDoc.source === 'portal' || existingDoc.source === 'manual')
      );
      const isWfhConflict = Boolean(existingDoc && existingDoc.workMode === 'wfh');

      if (isPortalConflict || isWfhConflict) {
        skippedConflictCount++;
        continue; // Server-side security boundary: skip portal/manual/WFH conflicts
      }

      if (!r.canImport) { skippedInvalid++; continue; }

      keys.add(key);
      if (!maxImportedDate || r.date > maxImportedDate) maxImportedDate = r.date;
      const payload = {
        checkIn: toDateTime(r.date, r.checkIn),
        checkOut: toDateTime(r.date, r.checkOut),
        workingHours: r.totalHours ?? null,
        status: r.status,
        isLate: !!r.isLate,
        source: 'biometric',
      };
      operations.push({
        updateOne: {
          filter: { employeeId: r.matchedEmployee._id, date: r.date },
          update: {
            $set: payload,
            $setOnInsert: { employeeId: r.matchedEmployee._id, date: r.date },
          },
          upsert: true,
        },
      });
    }
    if (!operations.length) {
      return res.status(400).json({ success: false, message: 'No valid rows to import', data: { saved: 0, updated: 0, skippedDuplicate: 0, skippedInvalid, skippedConflictCount } });
    }
    const result = await Attendance.bulkWrite(operations, { ordered: false });
    if (maxImportedDate) {
      const settings = await Settings.getGlobal();
      if (!settings.lastAttendanceImportDate || maxImportedDate > settings.lastAttendanceImportDate) {
        settings.lastAttendanceImportDate = maxImportedDate;
        settings.lastAttendanceImportedAt = new Date();
        await settings.save();
      }
    }
    const saved = result.upsertedCount || 0;
    const updated = result.modifiedCount || 0;
    const skippedDuplicate = rows.length - operations.length - skippedInvalid - skippedConflictCount;
    console.log('[Attendance Upload] saved records count:', saved);
    console.log('[Attendance Upload] updated existing records count:', updated);
    console.log('[Attendance Upload] skipped conflict count:', skippedConflictCount);
    res.json({ success: true, data: { saved, updated, skippedDuplicate, skippedInvalid, skippedConflictCount, lastAttendanceImportDate: maxImportedDate }, message: `Import successful: ${saved} saved, ${updated} updated, ${skippedConflictCount} skipped due to existing portal/WFH records` });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Duplicate attendance record detected during import' });
    next(err);
  }
};
