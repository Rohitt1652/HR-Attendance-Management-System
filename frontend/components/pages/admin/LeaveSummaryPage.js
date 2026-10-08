'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getLeaveSummary } from '@/api/leaveApi';
import { Download } from 'lucide-react';

function DateTooltip({ dates, isMonthly, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const TYPE_COLORS = { full_day: '#00695c', half_day: '#e65100', hourly: '#6a1b9a' };
  const TYPE_LABELS = { full_day: '', half_day: '(Half)', hourly: '(Hourly)' };

  const now = new Date();
  const monthLabel = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  // For monthly leaves: filter to current month only
  const displayDates = isMonthly
    ? (dates || []).filter(d => {
        const dt = new Date(d.date || d);
        return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
      })
    : (dates || []);

  // Only show tooltip trigger if there are dates OR it's monthly (to show "none this month")
  const hasAnything = isMonthly || (displayDates.length > 0);
  if (!hasAnything) return children;

  const handleEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShow(true);
  };

  return (
    <span style={{ position: 'relative', cursor: isMonthly || displayDates.length > 0 ? 'pointer' : 'default' }}
      onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position: 'fixed', top: pos.y - 8, left: pos.x, transform: 'translate(-50%, -100%)',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
          padding: '8px 12px', zIndex: 9999, whiteSpace: 'nowrap',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', fontSize: '16px', lineHeight: 1.8,
          minWidth: '140px',
        }}>
          {/* Month header for monthly leaves */}
          {isMonthly && (
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px', paddingBottom: '4px', borderBottom: '1px solid #f1f5f9' }}>
              📅 {monthLabel}
            </div>
          )}

          {displayDates.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '16px', fontStyle: 'italic' }}>No leaves this month</div>
          ) : (
            displayDates.map((d, i) => {
              const dateStr = new Date(d.date || d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: isMonthly ? undefined : 'numeric' });
              const type = d.type || 'full_day';
              const color = TYPE_COLORS[type] || '#00695c';
              const lbl = TYPE_LABELS[type] || '';
              return (
                <div key={i} style={{ color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                  {dateStr} {lbl && <span style={{ fontSize: '0.62rem', opacity: 0.8 }}>{lbl}</span>}
                </div>
              );
            })
          )}

          {!isMonthly && displayDates.length > 0 && (
            <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '8px', fontSize: '0.6rem', color: '#94a3b8' }}>
              <span style={{ color: '#00695c' }}>● Full</span>
              <span style={{ color: '#e65100' }}>● Half</span>
              <span style={{ color: '#6a1b9a' }}>● Hourly</span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export default function LeaveSummaryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getLeaveSummary({ year });
      setData(res.data.data);
    } catch { toast.error('Failed to load leave summary'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [year]);

  const years = [];
  for (let y = new Date().getFullYear(); y >= 2020; y--) years.push(y);

  const filtered = data?.summary?.filter(emp =>
    emp.name?.toLowerCase().includes(search.toLowerCase()) ||
    emp.employeeId?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleDownload = () => {
    if (!data) return;
    const lt = data.leaveTypes;
    let csv = 'S.No,Name,Employee ID,Department';
    lt.forEach(l => { csv += `,${l.code} Availed,${l.code} Balance`; });
    csv += '\n';
    filtered.forEach((emp, i) => {
      csv += `${i + 1},"${emp.name}",${emp.employeeId || ''},${emp.department || ''}`;
      lt.forEach(l => {
        const d = emp.leaves[l.code];
        csv += `,${d?.availed || 0},${d?.balance || 0}`;
      });
      csv += '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `leave-summary-${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-page-stack">
      {/* Header */}
      <div className="admin-header">
        <div>
          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Leave Summary</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '4px' }}>All employees — availed & balanced leaves for {year}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-select font-semibold" value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ background: '#fafbfc' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee..."
            style={{ width: '180px', background: '#fafbfc' }} />
          <button className="btn btn--success" onClick={handleDownload}>
            <Download size={14} /> Download CSV
          </button>
        </div>
      </div>

      {/* Compact insights bar */}
      {data && (() => {
        const emps = data.summary || [];
        const lowBalance = emps.filter(e => Object.values(e.leaves).some(l => l.balance <= 1 && l.balance >= 0 && l.allocated > 0)).length;
        const typeCounts = {};
        emps.forEach(e => Object.entries(e.leaves).forEach(([code, l]) => { if (l.availed > 0) typeCounts[code] = (typeCounts[code] || 0) + l.availed; }));
        const mostUsed = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
        return (
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.625rem 1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f0f0f0', fontSize: '0.75rem', color: '#6b7280' }}>
            <span><strong style={{ color: '#111827' }}>{emps.length}</strong> employees</span>
            <span style={{ color: '#d1d5db' }}>·</span>
            {lowBalance > 0 && <><span style={{ color: '#f59e0b' }}>⚠ <strong>{lowBalance}</strong> low balance</span><span style={{ color: '#d1d5db' }}>·</span></>}
            {mostUsed && <><span>Most used: <strong style={{ color: '#4f46e5' }}>{mostUsed[0]}</strong> ({mostUsed[1]}d)</span><span style={{ color: '#d1d5db' }}>·</span></>}
            <span>Year: <strong style={{ color: '#111827' }}>{year}</strong></span>
          </div>
        );
      })()}

      {/* Format hint */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.75rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span className="font-bold">Format:</span> <span style={{ background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>Availed / Balance</span> — Hover on availed count to see leave dates
      </div>

      {/* Table */}
      <div className="admin-table-shell" style={{ borderRadius: '14px', overflow: 'auto', maxHeight: 'calc(100vh - 320px)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : !data || filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>No data found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '600px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thStyle}>#</th>
                <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 0, zIndex: 3 }}>Employee</th>
                {data.leaveTypes.map(lt => (
                  <th key={lt.code} style={{ ...thStyle, textAlign: 'center', minWidth: '65px' }} title={lt.name}>
                    {lt.code}
                    {lt.period === 'monthly' && (
                      <div style={{ fontSize: '0.58rem', color: '#6366f1', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>this mo.</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, idx) => (
                <tr key={emp._id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc'}>
                  <td style={{ ...tdStyle, color: '#94a3b8', fontSize: '16px', width: '35px' }}>{idx + 1}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fff' : '#fafbfc', zIndex: 1 }}>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{emp.name}</span>
                    {emp.employeeId && <span style={{ fontSize: '15px', color: '#94a3b8', marginLeft: '4px' }}>({emp.employeeId})</span>}
                  </td>
                  {data.leaveTypes.map(lt => {
                    const d = emp.leaves[lt.code];
                    const availed = d?.availed || 0;
                    const balance = d?.balance ?? 0;
                    const isNeg = balance < 0;
                    const isLow = balance > 0 && balance <= 1;
                    const isMonthly = d?.isMonthly || lt.period === 'monthly';

                    return (
                      <td key={lt.code} style={{ ...tdStyle, textAlign: 'center', padding: '0.5rem 0.25rem' }}>
                        <DateTooltip dates={d?.dates || []} isMonthly={isMonthly}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.75rem' }}>
                            <span style={{ color: availed > 0 ? '#dc2626' : '#cbd5e1', fontWeight: availed > 0 ? 700 : 400 }}>{availed}</span>
                            <span style={{ color: '#cbd5e1', fontSize: '0.65rem' }}>/</span>
                            <span style={{ color: isNeg ? '#dc2626' : isLow ? '#f59e0b' : balance > 0 ? '#16a34a' : '#cbd5e1', fontWeight: balance !== 0 ? 700 : 400 }}>{balance}</span>
                          </span>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '16px', color: '#64748b' }}>
            {data.leaveTypes.map(lt => (
              <span key={lt.code}><strong>{lt.code}</strong> = {lt.name}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '16px', color: '#64748b' }}>
            <span><span style={{ color: '#dc2626', fontWeight: 700 }}>Red</span> = Availed / Exceeded</span>
            <span><span style={{ color: '#16a34a', fontWeight: 700 }}>Green</span> = Balance available</span>
            <span><span style={{ color: '#f59e0b', fontWeight: 700 }}>Yellow</span> = Low balance (≤1)</span>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '0.75rem 0.5rem', textAlign: 'left', fontSize: '16px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #e2e8f0', borderTop: 'none', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#f8fafc', zIndex: 2, boxShadow: '0 1px 0 #e2e8f0' };
const tdStyle = { padding: '0.625rem 0.5rem', fontSize: '0.78rem', color: '#374151' };
