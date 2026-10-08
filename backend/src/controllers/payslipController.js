const Payslip = require('../models/Payslip');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const User = require('../models/User');
const { canAccessPayslip, canDownloadPayslipPdf } = require('../utils/accessControl');

const isWfhLeave = (leave) => {
  const code = `${leave?.leaveTypeCode || ''} ${leave?.leaveType || ''}`
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return code.includes('WFH') || code.includes('WORKFROMHOME');
};

async function getMonthlyAttendanceStats(employeeId, month, year) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const [attRecords, approvedLeaves] = await Promise.all([
    Attendance.find({ employeeId, date: { $regex: `^${monthStr}` } }).lean(),
    Leave.find({
      employeeId,
      status: 'Approved',
      startDate: { $lte: monthEnd },
      endDate: { $gte: monthStart },
    }).lean(),
  ]);
  const presentDates = new Set(
    attRecords
      .filter(record => record.checkIn || record.workMode === 'wfh')
      .map(record => record.date)
  );
  approvedLeaves.filter(isWfhLeave).forEach(leave => {
    const start = new Date(Math.max(new Date(leave.startDate).getTime(), monthStart.getTime()));
    const end = new Date(Math.min(new Date(leave.endDate).getTime(), monthEnd.getTime()));
    for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      presentDates.add(day.toISOString().slice(0, 10));
    }
  });
  const leaveDays = approvedLeaves
    .filter(leave => !isWfhLeave(leave))
    .reduce((total, leave) => total + (leave.durationType === 'half_day' ? 0.5 : (leave.totalDays || 1)), 0);
  const recordedDates = new Set([...attRecords.map(record => record.date), ...presentDates]);
  return { presentDays: presentDates.size, leaveDays, workingDays: recordedDates.size };
}

// Admin: list all payslips with filters
exports.listPayslips = async (req, res, next) => {
  try {
    const { month, year, employeeId, status } = req.query;
    const filter = {};
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (employeeId) filter.employeeId = employeeId;
    if (status) filter.status = status;
    const payslips = await Payslip.find(filter)
      .populate('employeeId', 'name employeeId department designation')
      .sort({ year: -1, month: -1 });
    res.json({ success: true, data: payslips });
  } catch (err) { next(err); }
};

// Employee: own payslips
exports.getMyPayslips = async (req, res, next) => {
  try {
    const payslips = await Payslip.find({ employeeId: req.user._id, status: 'Published' })
      .sort({ year: -1, month: -1 });
    res.json({ success: true, data: payslips });
  } catch (err) { next(err); }
};

// Get single payslip
exports.getPayslip = async (req, res, next) => {
  try {
    const payslip = await Payslip.findById(req.params.id)
      .populate('employeeId', 'name employeeId department designation email phone joiningDate profilePhotoUrl');
    if (!payslip) return res.status(404).json({ success: false, message: 'Payslip not found' });
    if (!canAccessPayslip(req, payslip)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    res.json({ success: true, data: payslip });
  } catch (err) { next(err); }
};

// Admin: create/update payslip
exports.upsertPayslip = async (req, res, next) => {
  try {
    const { employeeId, month, year, basicSalary, hra, allowances, deductions, tax, notes } = req.body;
    const netSalary = (basicSalary || 0) + (hra || 0) + (allowances || 0) - (deductions || 0) - (tax || 0);

    // Auto-calculate attendance stats
    const { presentDays, leaveDays, workingDays } = await getMonthlyAttendanceStats(employeeId, month, year);

    const payslip = await Payslip.findOneAndUpdate(
      { employeeId, month, year },
      {
        employeeId, month, year, basicSalary, hra, allowances, deductions, tax, netSalary,
        presentDays, leaveDays, workingDays,
        notes, generatedBy: req.user._id, updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: payslip });
  } catch (err) { next(err); }
};

// Admin: publish payslip (makes it visible to employee)
exports.publishPayslip = async (req, res, next) => {
  try {
    const payslip = await Payslip.findByIdAndUpdate(req.params.id, { status: 'Published', updatedAt: new Date() }, { new: true });
    if (!payslip) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: payslip });
  } catch (err) { next(err); }
};

exports.deletePayslip = async (req, res, next) => {
  try {
    await Payslip.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
};

// Admin: bulk generate payslips for all active employees in a month
exports.bulkGeneratePayslips = async (req, res, next) => {
  try {
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ success: false, message: 'month and year required' });

    const employees = await User.find({ status: 'Active', role: { $ne: 'admin' } });
    const results = { created: 0, skipped: 0, errors: [] };

    for (const emp of employees) {
      try {
        // Skip if already exists
        const existing = await Payslip.findOne({ employeeId: emp._id, month, year });
        if (existing) { results.skipped++; continue; }

        // Attendance stats
        const { presentDays, leaveDays, workingDays } = await getMonthlyAttendanceStats(emp._id, month, year);

        const basic = emp.basicSalary || 0;
        const hra = emp.hra || 0;
        const allowances = emp.allowances || 0;
        const deductions = emp.deductions || 0;
        const tax = emp.tax || 0;
        const netSalary = basic + hra + allowances - deductions - tax;

        await Payslip.create({
          employeeId: emp._id, month, year,
          basicSalary: basic, hra, allowances, deductions, tax, netSalary,
          presentDays, workingDays, leaveDays,
          generatedBy: req.user._id,
          status: 'Draft',
        });
        results.created++;
      } catch (e) {
        results.errors.push({ employee: emp.name, error: e.message });
      }
    }

    res.json({ success: true, data: results, message: `Generated ${results.created} payslips, skipped ${results.skipped} existing` });
  } catch (err) { next(err); }
};

// ─── PDF PAYSLIP GENERATION (Indian Format) ──────────────────────────────────

const PDFDocument = require('pdfkit');
const Settings = require('../models/Settings');

/**
 * Indian salary calculation helpers
 */
function calculateIndianDeductions(basic, gross) {
  // PF: 12% of Basic (employee contribution), capped at ₹1800/month (basic cap ₹15000)
  const pfBasic = Math.min(basic, 15000);
  const employeePF = Math.round(pfBasic * 0.12);
  const employerPF = Math.round(pfBasic * 0.12);

  // ESI: 0.75% of gross if gross ≤ ₹21000
  const esiApplicable = gross <= 21000;
  const employeeESI = esiApplicable ? Math.round(gross * 0.0075) : 0;
  const employerESI = esiApplicable ? Math.round(gross * 0.0325) : 0;

  // Professional Tax: ₹200/month (most Indian states)
  const professionalTax = gross > 15000 ? 200 : 0;

  return { employeePF, employerPF, employeeESI, employerESI, professionalTax };
}

/**
 * GET /api/payslips/:id/pdf
 * Generates a printable PDF payslip in Indian format
 */
exports.downloadPayslipPdf = async (req, res, next) => {
  try {
    const payslip = await Payslip.findById(req.params.id)
      .populate('employeeId', 'name employeeId department designation email phone joiningDate');

    if (!payslip) return res.status(404).json({ success: false, message: 'Payslip not found' });

    if (!canDownloadPayslipPdf(req, payslip)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const emp = payslip.employeeId;
    const settings = await Settings.getGlobal();
    const companyName = settings?.companyName || 'WorkforceOS';
    const companyAddress = settings?.companyAddress || 'Corporate Headquarters';

    const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = MONTHS[payslip.month];

    // Calculate Indian deductions
    const basic = payslip.basicSalary || 0;
    const hra = payslip.hra || 0;
    const allowances = payslip.allowances || 0;
    const gross = basic + hra + allowances;
    const { employeePF, employerPF, employeeESI, employerESI, professionalTax } = calculateIndianDeductions(basic, gross);

    // Use stored deductions/tax or calculated ones
    const totalDeductions = (payslip.deductions || 0) + (payslip.tax || 0);
    const netSalary = payslip.netSalary || (gross - totalDeductions);

    // Create PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=payslip_${emp.employeeId}_${monthName}_${payslip.year}.pdf`);
    doc.pipe(res);

    // ── Header ──
    doc.fontSize(18).font('Helvetica-Bold').text(companyName, { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(companyAddress, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica-Bold').text(`PAYSLIP - ${monthName} ${payslip.year}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
    doc.moveDown(0.8);

    // ── Employee Details ──
    const detailsY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold').text('EMPLOYEE DETAILS', 50, detailsY);
    doc.moveDown(0.5);
    const leftCol = [
      ['Employee Name', emp.name],
      ['Employee ID', emp.employeeId],
      ['Department', emp.department || 'N/A'],
      ['Designation', emp.designation || 'N/A'],
    ];
    const rightCol = [
      ['Pay Period', `${monthName} ${payslip.year}`],
      ['Working Days', `${payslip.workingDays || 0}`],
      ['Present Days', `${payslip.presentDays || 0}`],
      ['Leave Days', `${payslip.leaveDays || 0}`],
    ];

    let y = doc.y;
    doc.fontSize(8).font('Helvetica');
    leftCol.forEach(([label, value]) => {
      doc.text(`${label}:`, 50, y, { width: 100 });
      doc.font('Helvetica-Bold').text(value, 155, y);
      doc.font('Helvetica');
      y += 15;
    });
    y = detailsY + 15;
    rightCol.forEach(([label, value]) => {
      doc.text(`${label}:`, 350, y, { width: 100 });
      doc.font('Helvetica-Bold').text(value, 455, y);
      doc.font('Helvetica');
      y += 15;
    });

    doc.moveDown(3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
    doc.moveDown(0.5);

    // ── Earnings & Deductions Table ──
    const tableTop = doc.y;

    // Earnings header
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('EARNINGS', 50, tableTop);
    doc.text('AMOUNT (₹)', 200, tableTop, { align: 'right', width: 80 });

    // Deductions header
    doc.text('DEDUCTIONS', 320, tableTop);
    doc.text('AMOUNT (₹)', 470, tableTop, { align: 'right', width: 75 });

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(280, doc.y).stroke('#e2e8f0');
    doc.moveTo(320, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
    doc.moveDown(0.5);

    // Earnings rows
    const earnings = [
      ['Basic Salary', basic],
      ['HRA', hra],
      ['Conveyance Allowance', Math.round(allowances * 0.3)],
      ['Special Allowance', Math.round(allowances * 0.5)],
      ['Medical Allowance', Math.round(allowances * 0.2)],
    ].filter(([, v]) => v > 0);

    // Deductions rows
    const deductions = [
      ['Provident Fund (PF)', employeePF],
      ['ESI', employeeESI],
      ['Professional Tax', professionalTax],
      ['TDS / Income Tax', payslip.tax || 0],
      ['Other Deductions', Math.max(0, (payslip.deductions || 0) - employeePF - employeeESI - professionalTax)],
    ].filter(([, v]) => v > 0);

    y = doc.y;
    doc.fontSize(8).font('Helvetica');

    const maxRows = Math.max(earnings.length, deductions.length);
    for (let i = 0; i < maxRows; i++) {
      if (earnings[i]) {
        doc.text(earnings[i][0], 50, y);
        doc.text(`₹${earnings[i][1].toLocaleString('en-IN')}`, 200, y, { align: 'right', width: 80 });
      }
      if (deductions[i]) {
        doc.text(deductions[i][0], 320, y);
        doc.text(`₹${deductions[i][1].toLocaleString('en-IN')}`, 470, y, { align: 'right', width: 75 });
      }
      y += 16;
    }

    // Totals
    y += 8;
    doc.moveTo(50, y).lineTo(280, y).stroke('#1e293b');
    doc.moveTo(320, y).lineTo(545, y).stroke('#1e293b');
    y += 8;

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('GROSS SALARY', 50, y);
    doc.text(`₹${gross.toLocaleString('en-IN')}`, 200, y, { align: 'right', width: 80 });
    doc.text('TOTAL DEDUCTIONS', 320, y);
    doc.text(`₹${totalDeductions.toLocaleString('en-IN')}`, 470, y, { align: 'right', width: 75 });

    // Net Salary
    y += 30;
    doc.moveTo(50, y).lineTo(545, y).stroke('#6366f1');
    y += 10;
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('NET SALARY (Take Home)', 50, y);
    doc.text(`₹${netSalary.toLocaleString('en-IN')}`, 350, y, { align: 'right', width: 195 });

    // Employer contributions (for transparency)
    y += 35;
    doc.fontSize(8).font('Helvetica').fillColor('#64748b');
    doc.text('Employer Contributions (not deducted from salary):', 50, y);
    y += 14;
    doc.text(`Employer PF: ₹${employerPF.toLocaleString('en-IN')}    |    Employer ESI: ₹${employerESI.toLocaleString('en-IN')}    |    CTC: ₹${(gross + employerPF + employerESI).toLocaleString('en-IN')}/month`, 50, y);

    // Footer
    doc.fillColor('#94a3b8');
    y = 750;
    doc.fontSize(7).text('This is a computer-generated payslip and does not require a signature.', 50, y, { align: 'center', width: 495 });
    doc.text(`Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, 50, y + 12, { align: 'center', width: 495 });

    doc.end();
  } catch (err) {
    console.error('[Payslip PDF]', err.message);
    next(err);
  }
};
