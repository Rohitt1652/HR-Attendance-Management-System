'use client';
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getMyExpenses, submitExpense, deleteExpense } from '@/api/expenseApi';
import { Receipt, Clock, CheckCircle2, XCircle, Plus, Trash2, FileText } from 'lucide-react';
import styles from './MyExpenses.module.css';

const CATEGORIES = ['Travel', 'Food', 'Office Supplies', 'Software', 'Hardware', 'Training', 'Entertainment', 'Utilities', 'Maintenance', 'Other'];
const CATEGORY_COLORS = {
  Travel: '#0ea5e9', Food: '#f59e0b', 'Office Supplies': '#6366f1',
  Software: '#8b5cf6', Hardware: '#64748b', Training: '#22c55e',
  Entertainment: '#ec4899', Utilities: '#f97316', Maintenance: '#84cc16', Other: '#94a3b8',
};
const STATUS_COLORS = { Pending: '#f59e0b', Approved: '#22c55e', Rejected: '#ef4444' };

function fmt(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
      <div className="modal modal--lg">
        <div className={styles.modalHeader}>
          <h3 className="modal__title">{title}</h3>
          <button onClick={onClose} className={styles.modalClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, sub }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: `${color}18` }}>
        {icon}
      </div>
      <div className={styles.minW0}>
        <p className={styles.statLabel}>{label}</p>
        <p className={styles.statValue}>{value}</p>
        {sub && <p className={styles.statSub}>{sub}</p>}
      </div>
    </div>
  );
}

function SubmitExpenseModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    title: '', category: 'Travel', amount: '', currency: 'INR',
    date: new Date().toISOString().slice(0, 10), description: '', receiptUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleReceipt = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Receipt must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => set('receiptUrl', ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.title || !form.category || !form.amount || !form.date) {
      return toast.error('Title, category, amount and date are required');
    }
    setSaving(true);
    try {
      await submitExpense({ ...form, amount: parseFloat(form.amount) });
      toast.success('Expense submitted successfully');
      onSave();
    } catch {
      toast.error('Failed to submit expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.form}>
      <div className={styles.formGrid}>
        <div className={`form-group ${styles.formSpan}`}>
          <label className="form-label">Title *</label>
          <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Team lunch, Flight to Mumbai" />
        </div>
        <div className="form-group">
          <label className="form-label">Category *</label>
          <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(category => <option key={category}>{category}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Amount (₹) *</label>
          <input className="form-input" type="number" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">Date *</label>
          <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className={`form-group ${styles.formSpan}`}>
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Optional details about this expense..." />
        </div>
        <div className={`form-group ${styles.formSpan}`}>
          <label className="form-label">Receipt (max 2MB, optional)</label>
          <input className={styles.fileInput} type="file" accept="image/*,application/pdf" onChange={handleReceipt} />
          {form.receiptUrl && <p className={styles.receiptAttached}>Receipt attached</p>}
        </div>
      </div>
      <div className={styles.formActions}>
        <button onClick={onClose} className="btn btn--secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn btn--primary">
          {saving ? 'Submitting...' : 'Submit Expense'}
        </button>
      </div>
    </div>
  );
}

function ExpenseCard({ expense, onDelete }) {
  const [showReceipt, setShowReceipt] = useState(false);
  const catColor = CATEGORY_COLORS[expense.category] || '#94a3b8';
  const statusColor = STATUS_COLORS[expense.status] || '#94a3b8';

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIcon} style={{ background: `${catColor}18` }}>
            <Receipt size={18} color={catColor} />
          </div>
          <div className={styles.minW0}>
            <p className={styles.cardTitle}>{expense.title}</p>
            <p className={styles.cardDate}>
              {new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        <span className={styles.amount}>{fmt(expense.amount)}</span>
      </div>

      <div className={styles.badgeRow}>
        <span className={styles.badge} style={{ color: catColor, background: `${catColor}15`, borderColor: `${catColor}30` }}>
          {expense.category}
        </span>
        <span className={styles.badge} style={{ color: statusColor, background: `${statusColor}15`, borderColor: `${statusColor}30` }}>
          {expense.status}
        </span>
        {expense.paymentStatus === 'Paid' && <span className={`${styles.badge} ${styles.paidBadge}`}>Paid</span>}
      </div>

      {expense.description && <p className={styles.description}>{expense.description}</p>}

      {expense.rejectionReason && (
        <div className={styles.rejection}>
          <p><strong>Rejection reason:</strong> {expense.rejectionReason}</p>
        </div>
      )}

      {expense.receiptUrl && (
        <div>
          <button onClick={() => setShowReceipt(!showReceipt)} className={styles.receiptToggle}>
            <FileText size={13} /> {showReceipt ? 'Hide Receipt' : 'View Receipt'}
          </button>
          {showReceipt && expense.receiptUrl.startsWith('data:image') && (
            <img src={expense.receiptUrl} alt="Receipt" className={styles.receiptPreview} />
          )}
        </div>
      )}

      {expense.status === 'Pending' && (
        <div className={styles.cardFooter}>
          <button onClick={() => onDelete(expense)} className={styles.deleteButton}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function MyExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [activeTab, setActiveTab] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyExpenses();
      setExpenses(res.data.data || []);
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (expense) => {
    if (!confirm(`Delete expense "${expense.title}"?`)) return;
    try {
      await deleteExpense(expense._id);
      toast.success('Expense deleted');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete expense');
    }
  };

  const totalSubmitted = expenses.length;
  const pendingCount = expenses.filter(e => e.status === 'Pending').length;
  const approvedAmount = expenses.filter(e => e.status === 'Approved').reduce((sum, e) => sum + e.amount, 0);
  const rejectedCount = expenses.filter(e => e.status === 'Rejected').length;

  const tabs = ['All', 'Pending', 'Approved', 'Rejected'];
  const filtered = activeTab === 'All' ? expenses : expenses.filter(e => e.status === activeTab);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My Expenses</h1>
          <p className={styles.subtitle}>Track and submit your office expense claims</p>
        </div>
        <button onClick={() => setShowSubmitModal(true)} className={`btn btn--primary btn--lg ${styles.submitButton}`}>
          <Plus size={16} /> Submit Expense
        </button>
      </div>

      <div className={styles.statGrid}>
        <StatCard icon={<Receipt size={22} color="#6366f1" />} label="Total Submitted" value={totalSubmitted} color="#6366f1" sub="all time" />
        <StatCard icon={<Clock size={22} color="#f59e0b" />} label="Pending" value={pendingCount} color="#f59e0b" sub="awaiting review" />
        <StatCard icon={<CheckCircle2 size={22} color="#22c55e" />} label="Approved" value={fmt(approvedAmount)} color="#22c55e" sub="total approved" />
        <StatCard icon={<XCircle size={22} color="#ef4444" />} label="Rejected" value={rejectedCount} color="#ef4444" sub="not approved" />
      </div>

      <div className={styles.tabs}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`${styles.tab}${activeTab === tab ? ` ${styles.tabActive}` : ''}`}>
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.empty}>Loading expenses...</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <Receipt size={40} color="#e2e8f0" />
          <p>No expenses found</p>
          {activeTab === 'All' && (
            <button onClick={() => setShowSubmitModal(true)} className="btn btn--primary">
              Submit your first expense
            </button>
          )}
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map(expense => (
            <ExpenseCard key={expense._id} expense={expense} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showSubmitModal && (
        <Modal title="Submit Expense" onClose={() => setShowSubmitModal(false)}>
          <SubmitExpenseModal onSave={() => { setShowSubmitModal(false); load(); }} onClose={() => setShowSubmitModal(false)} />
        </Modal>
      )}
    </div>
  );
}
