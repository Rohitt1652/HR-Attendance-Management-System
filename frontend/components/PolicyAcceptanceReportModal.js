'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getPolicyAcceptanceReport } from '@/api/policyApi';
import { X, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import styles from './PolicyAcceptanceReportModal.module.css';

export default function PolicyAcceptanceReportModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [tab, setTab] = useState('pending');

  useEffect(() => {
    getPolicyAcceptanceReport()
      .then((res) => setReport(res.data.data))
      .catch(() => toast.error('Failed to load acceptance report'))
      .finally(() => setLoading(false));
  }, []);

  const policies = report?.policies || [];
  const expandedPolicy = policies.find((p) => p.policyId === expandedId);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Policy acceptance report</h2>
            <p className={styles.subtitle}>See who has and hasn&apos;t accepted each policy</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <p className={styles.loading}>Loading report...</p>
        ) : (
          <>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <Users size={18} color="#4f46e5" />
                <div>
                  <p className={styles.summaryValue}>{report?.totalEmployees ?? 0}</p>
                  <p className={styles.summaryLabel}>Active employees</p>
                </div>
              </div>
              <div className={styles.summaryCard}>
                <AlertTriangle size={18} color="#d97706" />
                <div>
                  <p className={styles.summaryValue}>{report?.employeesWithPending ?? 0}</p>
                  <p className={styles.summaryLabel}>Employees with pending policies</p>
                </div>
              </div>
              <div className={styles.summaryCard}>
                <CheckCircle2 size={18} color="#059669" />
                <div>
                  <p className={styles.summaryValue}>{report?.policiesWithPending ?? 0}</p>
                  <p className={styles.summaryLabel}>Policies with pending acceptances</p>
                </div>
              </div>
            </div>

            {policies.length === 0 ? (
              <p className={styles.empty}>No policies require acceptance yet.</p>
            ) : (
              <div className={styles.policyTable}>
                {policies.map((policy) => (
                  <button
                    key={policy.policyId}
                    type="button"
                    className={`${styles.policyRow} ${expandedId === policy.policyId ? styles.policyRowActive : ''}`}
                    onClick={() => setExpandedId(expandedId === policy.policyId ? null : policy.policyId)}
                  >
                    <div className={styles.policyRowMain}>
                      <p className={styles.policyRowTitle}>{policy.title}</p>
                      <p className={styles.policyRowMeta}>{policy.category} · v{policy.version}</p>
                    </div>
                    <span className={styles.countAccepted}>{policy.acceptedCount} accepted</span>
                    <span className={policy.pendingCount > 0 ? styles.countPending : styles.countDone}>
                      {policy.pendingCount} pending
                    </span>
                  </button>
                ))}
              </div>
            )}

            {expandedPolicy && (
              <div className={styles.detailPanel}>
                <div className={styles.detailHeader}>
                  <h3 className={styles.detailTitle}>{expandedPolicy.title}</h3>
                  <div className={styles.tabRow}>
                    <button
                      type="button"
                      className={`${styles.tabButton} ${tab === 'pending' ? styles.tabActive : ''}`}
                      onClick={() => setTab('pending')}
                    >
                      Pending ({expandedPolicy.pendingCount})
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabButton} ${tab === 'accepted' ? styles.tabActive : ''}`}
                      onClick={() => setTab('accepted')}
                    >
                      Accepted ({expandedPolicy.acceptedCount})
                    </button>
                  </div>
                </div>
                <div className={styles.employeeList}>
                  {(tab === 'pending' ? expandedPolicy.pending : expandedPolicy.accepted).length === 0 ? (
                    <p className={styles.emptyList}>
                      {tab === 'pending' ? 'Everyone has accepted this policy.' : 'No acceptances recorded yet.'}
                    </p>
                  ) : (
                    (tab === 'pending' ? expandedPolicy.pending : expandedPolicy.accepted).map((emp) => (
                      <div key={emp.userId} className={styles.employeeRow}>
                        <div>
                          <p className={styles.employeeName}>{emp.name}</p>
                          <p className={styles.employeeMeta}>
                            {emp.employeeId ? `${emp.employeeId} · ` : ''}{emp.department || emp.role}
                            {emp.email ? ` · ${emp.email}` : ''}
                          </p>
                        </div>
                        {tab === 'accepted' && emp.acceptedAt && (
                          <span className={styles.acceptedDate}>
                            {new Date(emp.acceptedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
