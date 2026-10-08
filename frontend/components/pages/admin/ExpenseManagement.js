'use client';
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import {
  getAllExpenses, getExpenseSummary, approveExpense, rejectExpense,
  markExpensePaid, deleteExpense, submitExpense,
} from '@/api/expenseApi';
import { listEmployees } from '@/api/employeeApi';
import {
  Receipt, TrendingUp, Clock, CheckCircle2, Calendar,
  Plus, Filter, Search, Trash2, Check, X, CreditCard,
  FileText,
} from 'lucide-react';
import styles from './ExpenseManagement.module.css';

const CATEGORIES = ['Travel', 'Food', 'Office Supplies', 'Software', 'Hardware', 'Training', 'Entertainment', 'Utilities', 'Maintenance', 'Other'];
const CATEGORY_COLORS = {
  Travel: '#0ea5e9', Food: '#f59e0b', 'Office Supplies': '#6366f1',
  Software: '#8b5cf6', Hardware: '#64748b', Training: '#22c55e',
  Entertainment: '#ec4899', Utilities: '#f97316', Maintenance: '#84cc16', Other: '#94a3b8',
};
const STATUS_COLORS = { Pending: '#f59e0b', Approved: '#22c55e', Rejected: '#ef4444' };
const TABS = ['All Expenses', 'Pending', 'Approved', 'Rejected'];

function fmt(n) { return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

function Modal({ title, onClose, children, maxWidth = '560px' }) {
  return (
    <div className="modal-backdrop">
      <div className="admin-modal-panel" style={{ maxWidth }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 className={styles.modalHeaderTitle}>{title}</h3>
          <button onClick={onClose} className={styles.modalCloseBtn}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, sub }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIconBox} style={{ background: color + '18' }}>
        {icon}
      </div>
      <div className={styles.statContent}>
        <p className={styles.statLabel}>{label}</p>
        <p className={styles.statValue}>{value}</p>
        {sub && <p className={styles.statSubtext}>{sub}</p>}
      </div>
    </div>
  );
}

function AddExpenseModal({ employees, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', category: 'Travel', amount: '', currency: 'INR', date: new Date().toISOString().slice(0, 10), description: '', receiptUrl: '', submittedByOverride: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleReceipt = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Receipt must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => set('receiptUrl', ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.title || !form.category || !form.amount || !form.date) return toast.error('Title, category, amount and date are required');
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (!payload.submittedByOverride) delete payload.submittedByOverride;
      await submitExpense(payload);
      toast.success('Expense submitted');
      onSave();
    } catch { toast.error('Failed to submit expense'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Title *</label>
          <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Team lunch, Flight to Mumbai" />
        </div>
        <div>
          <label className="form-label">Category *</label>
          <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Amount (₹) *</label>
          <input className="form-input" type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="form-label">Date *</label>
          <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div>
          <label className="form-label">On behalf of</label>
          <select className="form-select" value={form.submittedByOverride} onChange={e => set('submittedByOverride', e.target.value)}>
            <option value="">Self</option>
            {employees.map(emp => <option key={emp._id} value={emp._id}>{emp.name}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={form.description} onChange={e => set('description', e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder="Optional details..." />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Receipt (max 2MB)</label>
          <input type="file" accept="image/*,application/pdf" onChange={handleReceipt} style={{ fontSize: '0.8rem' }} />
          {form.receiptUrl && <p style={{ fontSize: '0.72rem', color: '#22c55e', marginTop: '4px' }}>✓ Receipt attached</p>}
        </div>
      </div>
      <div className="admin-modal-footer" style={{ marginTop: '0.5rem' }}>
        <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Submitting...' : 'Submit Expense'}
        </button>
      </div>
    </div>
  );
}

function RejectModal({ expense, onSave, onClose }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReject = async () => {
    if (!reason.trim()) return toast.error('Please provide a rejection reason');
    setSaving(true);
    try {
      await rejectExpense(expense._id, reason);
      toast.success('Expense rejected');
      onSave();
    } catch { toast.error('Failed to reject expense'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0 }}>
        Rejecting: <strong>{expense.title}</strong> — {fmt(expense.amount)}
      </p>
      <div>
        <label className="form-label">Rejection Reason *</label>
        <textarea className="form-textarea" value={reason} onChange={e => setReason(e.target.value)} rows={3} style={{ resize: 'vertical' }} placeholder="Explain why this expense is being rejected..." />
      </div>
      <div className="admin-modal-footer">
        <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn--danger" onClick={handleReject} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Rejecting...' : 'Reject Expense'}
        </button>
      </div>
    </div>
  );
}

function ExpenseCard({ expense, isAdmin, onApprove, onReject, onMarkPaid, onDelete }) {
  const [showReceipt, setShowReceipt] = useState(false);
  const catColor = CATEGORY_COLORS[expense.category] || '#94a3b8';
  const statusColor = STATUS_COLORS[expense.status] || '#94a3b8';
  const emp = expense.submittedBy;

  return (
    <div className={styles.expenseCard}>
      <div className={styles.expenseCardHeader}>
        <div className={styles.expenseTitleGroup}>
          <div className={styles.expenseCategoryIconBox} style={{ background: catColor + '18' }}>
            <Receipt size={18} color={catColor} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p className={styles.expenseTitleText}>{expense.title}</p>
            {emp && (
              <p className={styles.expenseEmployeeText}>
                {emp.name} {emp.department ? `· ${emp.department}` : ''}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span className={styles.expenseAmountText}>{fmt(expense.amount)}</span>
        </div>
      </div>

      <div className={styles.expenseBadgesRow}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: catColor, background: catColor + '15', padding: '2px 10px', borderRadius: '20px', border: `1px solid ${catColor}30` }}>
          {expense.category}
        </span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor, background: statusColor + '15', padding: '2px 10px', borderRadius: '20px', border: `1px solid ${statusColor}30` }}>
          {expense.status}
        </span>
        {expense.paymentStatus === 'Paid' && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#22c55e', background: '#22c55e15', padding: '2px 10px', borderRadius: '20px', border: '1px solid #22c55e30' }}>
            Paid
          </span>
        )}
        <span className={styles.expenseDateText}>
          {new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {expense.description && (
        <p className={styles.expenseDesc}>{expense.description}</p>
      )}

      {expense.rejectionReason && (
        <div className={styles.rejectionBox}>
          <p className={styles.rejectionText}><strong>Rejection reason:</strong> {expense.rejectionReason}</p>
        </div>
      )}

      {expense.receiptUrl && (
        <div>
          <button onClick={() => setShowReceipt(!showReceipt)} className={styles.btnReceiptToggle}>
            <FileText size={13} /> {showReceipt ? 'Hide Receipt' : 'View Receipt'}
          </button>
          {showReceipt && expense.receiptUrl.startsWith('data:image') && (
            <img src={expense.receiptUrl} alt="Receipt" className={styles.receiptImage} />
          )}
        </div>
      )}

      <div className={styles.expenseActionsRow}>
        {expense.status === 'Pending' && (
          <>
            <button onClick={() => onApprove(expense)} className={styles.btnApprove}>
              <Check size={13} /> Approve
            </button>
            <button onClick={() => onReject(expense)} className={styles.btnReject}>
              <X size={13} /> Reject
            </button>
          </>
        )}
        {expense.status === 'Approved' && expense.paymentStatus === 'Unpaid' && isAdmin && (
          <button onClick={() => onMarkPaid(expense)} className={styles.btnMarkPaid}>
            <CreditCard size={13} /> Mark Paid
          </button>
        )}
        {isAdmin && (
          <button onClick={() => onDelete(expense)} className={styles.btnDelete}>
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function ExpenseManagement() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'md'].includes(user?.role);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All Expenses');
  const [filters, setFilters] = useState({ category: '', search: '', startDate: '', endDate: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeTab !== 'All Expenses') params.status = activeTab;
      if (filters.category) params.category = filters.category;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const [expRes, sumRes] = await Promise.all([
        getAllExpenses(params),
        getExpenseSummary(),
      ]);
      let data = expRes.data.data || [];
      if (filters.search) {
        const q = filters.search.toLowerCase();
        data = data.filter(e =>
          e.submittedBy?.name?.toLowerCase().includes(q) ||
          e.title?.toLowerCase().includes(q)
        );
      }
      setExpenses(data);
      setSummary(sumRes.data.data);
    } catch { toast.error('Failed to load expenses'); }
    finally { setLoading(false); }
  }, [activeTab, filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    listEmployees().then(r => setEmployees(r.data.data || [])).catch(() => {});
  }, []);

  const handleApprove = async (expense) => {
    try {
      await approveExpense(expense._id);
      toast.success('Expense approved');
      load();
    } catch { toast.error('Failed to approve'); }
  };

  const handleMarkPaid = async (expense) => {
    try {
      await markExpensePaid(expense._id);
      toast.success('Marked as paid');
      load();
    } catch { toast.error('Failed to mark paid'); }
  };

  const handleDelete = async (expense) => {
    if (!confirm(`Delete expense "${expense.title}"?`)) return;
    try {
      await deleteExpense(expense._id);
      toast.success('Expense deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  // Bar chart helper
  const maxCatAmount = summary?.byCategory?.reduce((m, c) => Math.max(m, c.totalAmount), 0) || 1;

  return (
    <div className={`admin-page-stack ${styles.pageContainer}`}>
      {/* Header */}
      <div className={`admin-header ${styles.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Expense Management</h1>
          <p className={styles.pageSubtitle}>Review and manage office expense claims</p>
        </div>
        <button className={`btn btn--primary ${styles.btnAddExpense}`} onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {/* Stat Cards */}
      <div className={styles.statsRow}>
        <StatCard icon={<TrendingUp size={22} color="#6366f1" />} label="Total Amount" value={fmt(summary?.totalAmount)} color="#6366f1" sub={`${summary?.totalCount || 0} expenses`} />
        <StatCard icon={<Clock size={22} color="#f59e0b" />} label="Pending" value={summary?.pendingCount || 0} color="#f59e0b" sub="awaiting review" />
        <StatCard icon={<CheckCircle2 size={22} color="#22c55e" />} label="Approved Amount" value={fmt(summary?.approvedAmount)} color="#22c55e" sub="approved expenses" />
        <StatCard icon={<Calendar size={22} color="#0ea5e9" />} label="This Month" value={fmt(summary?.thisMonthAmount)} color="#0ea5e9" sub={new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} />
      </div>

      {/* Category breakdown bar chart */}
      {summary?.byCategory?.length > 0 && (
        <div className={`card ${styles.chartCard}`}>
          <p className={styles.chartTitle}>Spending by Category</p>
          <div className={styles.chartStack}>
            {summary.byCategory.map(cat => (
              <div key={cat._id} className={styles.chartRow}>
                <span className={styles.chartCatLabel}>{cat._id}</span>
                <div className={styles.chartTrack}>
                  <div className={styles.chartBar} style={{ width: `${(cat.totalAmount / maxCatAmount) * 100}%`, background: CATEGORY_COLORS[cat._id] || '#94a3b8' }} />
                </div>
                <span className={styles.chartAmount}>{fmt(cat.totalAmount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={styles.tabBtn} style={{
            fontWeight: activeTab === tab ? 700 : 500,
            background: activeTab === tab ? '#6366f1' : 'transparent',
            color: activeTab === tab ? '#fff' : '#64748b',
          }}>{tab}</button>
        ))}
      </div>

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={14} color="#94a3b8" className={styles.searchIcon} />
          <input className={`form-input ${styles.searchInput}`} value={filters.search} onChange={e => setFilter('search', e.target.value)} placeholder="Search employee or title..." />
        </div>
        <select className="form-select" value={filters.category} onChange={e => setFilter('category', e.target.value)} style={{ width: 'auto', minWidth: '140px' }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <div className={styles.dateFilterGroup}>
          <Filter size={14} color="#94a3b8" />
          <input className="form-input" type="date" value={filters.startDate} onChange={e => setFilter('startDate', e.target.value)} style={{ width: 'auto' }} />
          <span className={styles.dateSeparator}>to</span>
          <input className="form-input" type="date" value={filters.endDate} onChange={e => setFilter('endDate', e.target.value)} style={{ width: 'auto' }} />
        </div>
        {(filters.category || filters.search || filters.startDate || filters.endDate) && (
          <button onClick={() => setFilters({ category: '', search: '', startDate: '', endDate: '' })} className={styles.btnClearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {/* Expense list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading expenses...</div>
      ) : expenses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <Receipt size={40} color="#e2e8f0" style={{ marginBottom: '0.75rem' }} />
          <p style={{ margin: 0 }}>No expenses found</p>
        </div>
      ) : (
        <div className={styles.expenseGrid}>
          {expenses.map(exp => (
            <ExpenseCard
              key={exp._id}
              expense={exp}
              isAdmin={isAdmin}
              onApprove={handleApprove}
              onReject={setRejectTarget}
              onMarkPaid={handleMarkPaid}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <Modal title="Add Expense" onClose={() => setShowAddModal(false)}>
          <AddExpenseModal employees={employees} onSave={() => { setShowAddModal(false); load(); }} onClose={() => setShowAddModal(false)} />
        </Modal>
      )}
      {rejectTarget && (
        <Modal title="Reject Expense" onClose={() => setRejectTarget(null)} maxWidth="480px">
          <RejectModal expense={rejectTarget} onSave={() => { setRejectTarget(null); load(); }} onClose={() => setRejectTarget(null)} />
        </Modal>
      )}
    </div>
  );
}
