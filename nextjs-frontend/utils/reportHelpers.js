// Helper formatters for Reports page (/admin/reports)

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatReportDate(dateVal) {
  if (!dateVal) return '—';
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
    const [y, m, d] = dateVal.trim().split('-');
    const day = Number(d);
    const month = SHORT_MONTH_NAMES[Number(m) - 1];
    const year = Number(y);
    return `${day} ${month} ${year}`;
  }
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return String(dateVal || '—');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(d);
  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;
  return `${day} ${month} ${year}`;
}

export function formatReportTime(timeVal) {
  if (!timeVal) return '-';
  if (typeof timeVal === 'string' && /^\d{1,2}:\d{2}/.test(timeVal.trim())) {
    return timeVal.trim();
  }
  const d = new Date(timeVal);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return '-';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDurationDisplay(days, hours, durationType) {
  if (durationType === 'hourly' || (hours !== null && hours !== undefined && (days === null || days === undefined || days === 0))) {
    const h = Number(hours) || 0;
    return `${parseFloat(h.toFixed(2))} ${h === 1 ? 'hour' : 'hours'}`;
  }
  if (days !== null && days !== undefined) {
    const d = Number(days);
    if (d === 0.5) return '0.5 day';
    return `${parseFloat(d.toFixed(1))} ${d === 1 ? 'day' : 'days'}`;
  }
  return '—';
}

export function getMonthDateRange(year, month) {
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || (new Date().getMonth() + 1);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, monthName: MONTH_NAMES[m - 1], year: y };
}

export function getTodayDateString() {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

export function generateExportFilename(tab, appliedFilters) {
  const cleanTab = (tab || 'report').toLowerCase();
  let datePart = 'all-time';

  if (appliedFilters.date) {
    datePart = appliedFilters.date;
  } else if (appliedFilters.year && appliedFilters.month) {
    const mName = (MONTH_NAMES[Number(appliedFilters.month) - 1] || 'month').toLowerCase();
    datePart = `${mName}-${appliedFilters.year}`;
  } else if (appliedFilters.startDate && appliedFilters.endDate) {
    datePart = `${appliedFilters.startDate}-to-${appliedFilters.endDate}`;
  }

  return `${cleanTab}-report-${datePart}.csv`;
}

export function generateScopeBannerText(tab, appliedFilters) {
  if (tab === 'daily') {
    return `Showing Daily Attendance for ${formatReportDate(appliedFilters.date || getTodayDateString())}`;
  }
  if (tab === 'monthly') {
    const mName = MONTH_NAMES[(Number(appliedFilters.month) || 1) - 1];
    return `Showing Monthly Attendance for ${mName} ${appliedFilters.year || new Date().getFullYear()}`;
  }
  if (tab === 'employee') {
    const empName = appliedFilters.employeeName ? ` for ${appliedFilters.employeeName}` : '';
    return `Showing Employee Report${empName} (${formatReportDate(appliedFilters.startDate)} – ${formatReportDate(appliedFilters.endDate)})`;
  }
  if (tab === 'department') {
    const deptName = appliedFilters.department ? ` for ${appliedFilters.department} Department` : '';
    return `Showing Department Report${deptName} (${formatReportDate(appliedFilters.startDate)} – ${formatReportDate(appliedFilters.endDate)})`;
  }
  // leave tab
  return `Showing Leave Report (${formatReportDate(appliedFilters.startDate)} – ${formatReportDate(appliedFilters.endDate)})`;
}

export function generateReportInsight(tab, summary, records) {
  if (!records || records.length === 0 || !summary) return null;

  if (tab === 'leave') {
    if (summary.totalApplications > 0 && summary.unplannedCount > 0) {
      const pct = Math.round((summary.unplannedCount / summary.totalApplications) * 100);
      return `${pct}% of leave applications in this period were unplanned (${summary.unplannedCount} of ${summary.totalApplications}).`;
    }
    if (summary.topLeaveType) {
      return `${summary.topLeaveType.name} recorded the highest approved duration (${summary.topLeaveType.days} days).`;
    }
  }

  if (tab === 'daily') {
    if (summary.isNonWorkingDay) {
      return `Selected date is a non-working day (${summary.dayReason || 'Weekend / Holiday'}).`;
    }
    if (summary.expectedEmployees > 0) {
      const rate = summary.attendanceRate !== undefined && summary.attendanceRate !== 'N/A' ? `${summary.attendanceRate}%` : null;
      const rateText = rate ? `Attendance rate is ${rate} today.` : '';
      return `${rateText} ${summary.absent} employees absent and ${summary.lateCount} arrived late.`.trim();
    }
  }

  if (tab === 'monthly') {
    if (summary.avgAttendanceRate !== undefined && summary.avgAttendanceRate !== 'N/A') {
      return `Monthly average attendance rate is ${summary.avgAttendanceRate}% across ${summary.evaluatedWorkingDays} evaluated working days.`;
    }
  }

  if (tab === 'employee') {
    if (summary.attendanceRate !== undefined && summary.attendanceRate !== 'N/A') {
      return `Employee recorded a ${summary.attendanceRate}% attendance rate with ${summary.presentDays} present days and ${summary.leaveDays} leave days.`;
    }
  }

  if (tab === 'department') {
    if (summary.avgAttendanceRate !== undefined && summary.avgAttendanceRate !== 'N/A') {
      return `${summary.departmentName || 'Department'} recorded a ${summary.avgAttendanceRate}% average attendance rate across ${summary.activeEmployees} active employees.`;
    }
  }

  return null;
}
