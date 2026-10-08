'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getMyPayslips, getPayslip, downloadPayslipPdf } from '@/api/payslipApi';
import { useAuth } from '@/context/AuthContext';
import styles from './MyPayslips.module.css';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

function PayslipDetail({ payslip, onClose }) {
  const emp = payslip.employeeId;
  const rows = [
    { label: 'Basic Salary', amount: payslip.basicSalary, type: 'earning' },
    { label: 'HRA', amount: payslip.hra, type: 'earning' },
    { label: 'Allowances', amount: payslip.allowances, type: 'earning' },
    { label: 'Deductions', amount: -payslip.deductions, type: 'deduction' },
    { label: 'Tax (TDS)', amount: -payslip.tax, type: 'deduction' },
  ];

  return (
    <div className={`modal-backdrop ${styles.backdrop}`}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerRow}>
            <div>
              <p className={styles.eyebrow}>PAYSLIP</p>
              <h2 className={styles.modalTitle}>{MONTHS[payslip.month]} {payslip.year}</h2>
            </div>
            <button className={styles.closeButton} onClick={onClose}>✕ Close</button>
          </div>
        </div>

        <div className={styles.modalBody}>
          {/* Employee info */}
          <div className={styles.employeeGrid}>
            {[
              ['Name', emp?.name], ['Employee ID', emp?.employeeId],
              ['Department', emp?.department], ['Designation', emp?.designation],
            ].map(([label, val]) => (
              <div key={label}>
                <p className={styles.infoLabel}>{label}</p>
                <p className={styles.infoValue}>{val || '-'}</p>
              </div>
            ))}
          </div>

          {/* Attendance summary */}
          <div className={styles.attendanceGrid}>
            {[
              ['Working Days', payslip.workingDays, '#6366f1'],
              ['Present Days', payslip.presentDays, '#22c55e'],
              ['Leave Days', payslip.leaveDays, '#f59e0b'],
            ].map(([label, val, color]) => (
              <div key={label} className={styles.attendanceCard} style={{ '--accent': color }}>
                <p className={styles.attendanceValue}>{val}</p>
                <p className={styles.attendanceLabel}>{label}</p>
              </div>
            ))}
          </div>

          {/* Earnings & Deductions */}
          <div className={styles.salaryTable}>
            <div className={styles.salaryHeader}>
              <span>Component</span><span>Amount</span>
            </div>
            {rows.map(row => (
              <div key={row.label} className={styles.salaryRow}>
                <span className={styles.componentLabel}>{row.label}</span>
                <span className={`${styles.amount} ${row.type === 'deduction' ? styles.deduction : styles.earning}`}>
                  {row.type === 'deduction' ? '-' : '+'}₹{Math.abs(row.amount).toLocaleString()}
                </span>
              </div>
            ))}
            <div className={styles.netRow}>
              <span className={styles.netLabel}>Net Salary</span>
              <span className={styles.netValue}>₹{payslip.netSalary.toLocaleString()}</span>
            </div>
          </div>

          {payslip.notes && (
            <div className={styles.notes}>
              📝 {payslip.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MyPayslips() {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    getMyPayslips().then(res => setPayslips(res.data.data || [])).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  }, []);

  const handleView = async (id) => {
    setDetailLoading(true);
    try { const res = await getPayslip(id); setSelected(res.data.data); }
    catch { toast.error('Failed to load payslip'); }
    finally { setDetailLoading(false); }
  };

  if (loading) return <div className={styles.loading}>Loading...</div>;

  return (
    <div className="admin-page-stack">
      <div>
        <h2 className={styles.pageTitle}>My Payslips</h2>
        <p className={styles.pageSubtitle}>{payslips.length} payslips available</p>
      </div>

      {payslips.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyIcon}>💰</p>
          <p className="text-muted">No payslips published yet</p>
        </div>
      ) : (
        <div className={styles.payslipGrid}>
          {payslips.map(p => (
            <div key={p._id} className={styles.payslipCard}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.cardTitle}>{MONTHS[p.month]} {p.year}</p>
                  <p className={styles.cardMeta}>{p.presentDays} days present</p>
                </div>
                <div className={styles.cardIcon}>💰</div>
              </div>
              <p className={styles.cardSalary}>₹{p.netSalary.toLocaleString()}</p>
              <button className={`${styles.cardButton} ${styles.viewButton}`} onClick={() => handleView(p._id)} disabled={detailLoading}>
                View Payslip
              </button>
              <button onClick={async () => {
                try {
                  const res = await downloadPayslipPdf(p._id);
                  const url = window.URL.createObjectURL(new Blob([res.data]));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `payslip_${p.month}_${p.year}.pdf`;
                  a.click();
                  window.URL.revokeObjectURL(url);
                } catch { toast.error('Failed to download PDF'); }
              }}
                className={`${styles.cardButton} ${styles.downloadButton}`}>
                📄 Download PDF
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && <PayslipDetail payslip={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
