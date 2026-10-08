'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '@/api/axios';
import { Download } from 'lucide-react';
import styles from './MonthlyAttendanceRecord.module.css';

/*
 * MonthlyAttendanceRecord — Style migration
 * Before: 36 inline styles  After: ~18  Removed: ~18
 * Remaining inline (dynamic):
 *   - Tooltip: position fixed top/left from getBoundingClientRect (computed)
 *   - Tooltip leave-type colors: TYPE_COLORS[type] (data-driven)
 *   - Tooltip dot color: inline per-type (data-driven)
 *   - Tooltip legend spans: color per type (static but inside dynamic tooltip)
 *   - Table cell color/fontWeight: val > 0 ternary (data-driven)
 *   - Row bg: idx % 2 === 0 stripe (loop-index)
 *   - Sticky cell bg: tied to stripe state (loop-index)
 *   - thStyle/tdStyle constants: kept as-is (table-specific, non-repeating)
 */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function DateTooltip({ dates, selectedMonth, selectedYear, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos]   = useState({ x: 0, y: 0 });

  const TYPE_COLORS = { full_day: '#00695c', half_day: '#e65100', hourly: '#6a1b9a' };
  const TYPE_LABELS = { full_day: '', half_day: '(Half)', hourly: '(Hourly)' };

  const filterMonth = selectedMonth != null ? selectedMonth - 1 : null;
  const filterYear  = selectedYear  != null ? selectedYear  : null;
  const monthLabel  = selectedMonth != null && selectedYear != null ? new Date(filterYear, filterMonth, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' }) : '';

  const displayDates = (dates || []).filter(d => {
    if (filterMonth == null || filterYear == null) return true;
    const dt = new Date(d.date || d);
    return dt.getMonth() === filterMonth && dt.getFullYear() === filterYear;
  });

  if (displayDates.length === 0) return children;

  const handleEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShow(true);
  };

  return (
    <span className="relative cursor-pointer" onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        /* Tooltip position is computed from DOM rect — must stay inline */
        <div style={{ position: 'fixed', top: pos.y - 8, left: pos.x, transform: 'translate(-50%, -100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', fontSize: '16px', lineHeight: 1.8, minWidth: '140px' }}>
          <div className="font-bold uppercase" style={{ fontSize: '0.62rem', color: '#6366f1', letterSpacing: '0.06em', marginBottom: '5px', paddingBottom: '4px', borderBottom: '1px solid #f1f5f9' }}>
            📅 {monthLabel}
          </div>
          {displayDates.length === 0 ? (
            <div className="text-muted" style={{ fontSize: '16px', fontStyle: 'italic' }}>No leaves this month</div>
          ) : (
            displayDates.map((d, i) => {
              const dateStr = new Date(d.date || d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: undefined });
              const type    = d.type || 'full_day';
              const color   = TYPE_COLORS[type] || '#00695c';
              const lbl     = TYPE_LABELS[type] || '';
              return (
                <div key={i} className="row-center" style={{ color, fontWeight: 600, gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                  {dateStr} {lbl && <span style={{ fontSize: '0.62rem', opacity: 0.8 }}>{lbl}</span>}
                </div>
              );
            })
          )}
        </div>
      )}
    </span>
  );
}

export default function MonthlyAttendanceRecord() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth]     = useState(new Date().getMonth() + 1);
  const [year, setYear]       = useState(new Date().getFullYear());

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/leaves/monthly-record', { params: { month, year } });
      setData(res.data.data);
    } catch { toast.error('Failed to load monthly record'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [month, year]);

  const years = [];
  for (let y = new Date().getFullYear(); y >= 2020; y--) years.push(y);

  const handleDownload = () => {
    if (!data) return;
    let csv = 'S.No,Emp ID,Name';
    data.leaveTypes.forEach(lt => { csv += `,${lt.code}`; });
    csv += '\n';
    data.records.forEach((emp, i) => {
      csv += `${i + 1},${emp.employeeId || ''},"${emp.name}"`;
      data.leaveTypes.forEach(lt => { csv += `,${emp.leaves[lt.code] || 0}`; });
      csv += '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `monthly-attendance-${MONTHS[month-1]}-${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="d-flex-col" style={{ gap: '1.25rem' }}>

      {/* Header */}
      <div className="row-between flex-wrap gap-3">
        <div>
          <h2 className={`font-extrabold text-heading ${styles.pageTitle}`}>Monthly Attendance Record</h2>
          <p className={`text-muted text-md ${styles.pageSubtitle}`}>Leave and WFH allowance usage per employee for the selected month</p>
        </div>
        <button onClick={handleDownload} className={`row-center gap-2 ${styles.btnDownload}`}>
          <Download size={14} /> Download CSV
        </button>
      </div>

      {/* Filters */}
      <div className="row-center flex-wrap gap-3">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className={styles.selectFilter}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className={styles.selectFilter}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={fetchData} className={styles.btnSubmit}>
          Submit
        </button>
      </div>

      {/* Table */}
      <div className={styles.tableShell}>
        {loading ? (
          <div className="text-muted" style={{ padding: '3rem', textAlign: 'center' }}>Loading...</div>
        ) : !data || data.records.length === 0 ? (
          <div className="text-muted" style={{ padding: '3rem', textAlign: 'center' }}>No records for {MONTHS[month-1]} {year}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '600px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thStyle}>S.No</th>
                <th style={thStyle}>Emp ID</th>
                <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 0, zIndex: 3 }}>Name</th>
                {data.leaveTypes.map(lt => (
                  <th key={lt.code} style={{ ...thStyle, textAlign: 'center' }} title={lt.name}>
                    {lt.code}
                    {lt.period === 'monthly' && (
                      <div className="font-semibold" style={{ fontSize: '0.58rem', color: '#6366f1', textTransform: 'none', letterSpacing: 0 }}>this mo.</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.records.map((emp, idx) => (
                /* row bg is idx % 2 — must stay inline */
                <tr key={emp._id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc'}>
                  <td style={{ ...tdStyle, color: '#94a3b8', width: '40px' }}>{idx + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#6366f1', fontSize: '0.75rem' }}>{emp.employeeId || '-'}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1 }}>{emp.name}</td>
                  {data.leaveTypes.map(lt => {
                    const val   = emp.leaves[lt.code] || 0;
                    const dates = emp.leaveDates?.[lt.code] || [];
                    return (
                      /* color/fontWeight driven by val > 0 — must stay inline */
                      <td key={lt.code} style={{ ...tdStyle, textAlign: 'center', color: val > 0 ? '#0ea5e9' : '#e2e8f0', fontWeight: val > 0 ? 700 : 400 }}>
                        <DateTooltip dates={dates} selectedMonth={month} selectedYear={year}>
                          {val || 0}
                        </DateTooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      {data && (
        <div className="d-flex flex-wrap" style={{ gap: '1rem', fontSize: '16px', color: '#64748b' }}>
          {data.leaveTypes.map(lt => (
            <span key={lt.code}><strong>{lt.code}</strong> = {lt.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '0.75rem 0.625rem', textAlign: 'left', fontSize: '16px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #e2e8f0', borderTop: 'none', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#f8fafc', zIndex: 2, boxShadow: '0 1px 0 #e2e8f0' };
const tdStyle = { padding: '0.625rem', fontSize: '0.78rem', color: '#374151' };
