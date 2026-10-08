'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  listTasks, createTask, updateTask, submitTaskExpense,
  approveTaskExpense, rejectTaskExpense, deleteTask, getTaskStats } from
'@/api/officeTaskApi';
import { listEmployees } from '@/api/employeeApi';
import { useAuth } from '@/context/AuthContext';
import {
  ClipboardCheck, CheckCircle2, Clock, DollarSign,
  Plus, Pencil, Trash2, Building2, User, UserCheck, Calendar,
  Phone, FileText, X } from
'lucide-react';

/*
 * OfficeTasksPage — Style migration log
 * Before: 133 inline style blocks
 * After:  ~42 inline style blocks
 * Removed: ~91 (static layout, spacing, color, border patterns)
 * Remaining inline (intentional — all dynamic/data-driven):
 *   - CATEGORY_COLORS[task.category] badge bg/color/border
 *   - PRIORITY_COLORS[task.priority] badge bg/color/border
 *   - EXPENSE_STATUS_COLORS[task.expenseStatus] section bg/border/badge
 *   - isOverdue ? red : muted color for due date / overdue pill
 *   - saving ? 'not-allowed' : 'pointer' and opacity (state-driven)
 *   - tab active: bg '#6366f1' / transparent, color '#fff' / '#64748b'
 *   - stat card icon bg/color from data (s.bg, s.color)
 *   - stat card value color from data (s.color)
 *   - task.linkedExpenseId badge (conditional render)
 *   - approve/reject confirm banners (bg/border/text fixed per action)
 */import styles from "./OfficeTasksPage.module.css";

const ADMIN_ROLES = ['admin', 'hr', 'md'];

const CATEGORY_COLORS = {
  Maintenance: '#f59e0b', Cleaning: '#22c55e', Security: '#ef4444',
  'IT Support': '#6366f1', Plumbing: '#0ea5e9', Electrical: '#f97316',
  Carpentry: '#84cc16', 'Pest Control': '#8b5cf6', Renovation: '#ec4899',
  Procurement: '#64748b', Other: '#94a3b8'
};
const CATEGORIES = Object.keys(CATEGORY_COLORS);
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const EXPENSE_STATUSES = ['Not Submitted', 'Pending', 'Approved', 'Rejected'];
const EXPENSE_CATEGORIES = ['Travel', 'Supplies', 'Equipment', 'Labor', 'Utilities', 'Other'];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null;
const fmtDateTime = (d) => d ? `${fmtDate(d)}, ${fmtTime(d)}` : null;
const isOverdue = (d, status) => d && !['Completed', 'Cancelled'].includes(status) && new Date(d) < new Date();

/* ── Modal shell ────────────────────────────────────────────────── */
function Modal({ title, onClose, children, maxWidth = '560px' }) {
  return (
    <div className="modal-backdrop">
      <div className={`bg-white rounded-2xl overflow-hidden ${styles.modal} ${maxWidth === '420px' ? styles.modalCompact : ''}`}>
        <div className={`row-between ${styles.modalHeader}`}>
          <h3 className={`font-bold text-heading ${styles.modalTitle}`}>{title}</h3>
          <button onClick={onClose} className={`btn-ghost-base cursor-pointer text-secondary ${styles.modalClose}`}>✕</button>
        </div>
        {children}
      </div>
    </div>);

}

/* ── Task form ──────────────────────────────────────────────────── */
function TaskForm({ task, employees, onSave, onClose }) {
  const blank = { title: '', category: 'Maintenance', priority: 'Medium', dueDate: '', assignedTo: '', description: '', notes: '', vendor: { name: '', phone: '', company: '' } };
  const [form, setForm] = useState(task ? {
    title: task.title || '', category: task.category || 'Maintenance', priority: task.priority || 'Medium',
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    assignedTo: task.assignedTo?._id || task.assignedTo || '',
    description: task.description || '', notes: task.notes || '',
    vendor: { name: task.vendor?.name || '', phone: task.vendor?.phone || '', company: task.vendor?.company || '' }
  } : blank);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setVendor = (k, v) => setForm((f) => ({ ...f, vendor: { ...f.vendor, [k]: v } }));

  const handleSave = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.category) return toast.error('Category is required');
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.assignedTo) delete payload.assignedTo;
      if (!payload.dueDate) delete payload.dueDate;
      if (!payload.vendor.name && !payload.vendor.phone && !payload.vendor.company) delete payload.vendor;
      if (task?._id) await updateTask(task._id, payload);else
      await createTask(payload);
      toast.success(task ? 'Task updated' : 'Task created');
      onSave();
    } catch {toast.error('Save failed');} finally
    {setSaving(false);}
  };

  return (
    <div className="d-flex-col gap-3">
      <div className={`d-grid ${styles.twoColumnGrid}`}>
        <div className={styles.fullWidthField}>
          <label className={styles.label}>Title *</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Task title" className={styles.input} />
        </div>
        <div><label className={styles.label}>Category *</label>
          <select value={form.category} onChange={(e) => set('category', e.target.value)} className={styles.input}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label className={styles.label}>Priority</label>
          <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={styles.input}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div><label className={styles.label}>Due Date</label>
          <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className={styles.input} />
        </div>
        <div><label className={styles.label}>Assign To</label>
          <select value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)} className={styles.input}>
            <option value="">-- Unassigned --</option>
            {employees.map((e) => <option key={e._id} value={e._id}>{e.name} — {e.department}</option>)}
          </select>
        </div>
        <div className={styles.fullWidthField}>
          <label className={styles.label}>Description</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Task details..." className={`${styles.input} ${styles.textarea}`} />
        </div>
      </div>

      <div className={`border-light ${styles.vendorSection}`}>
        <p className={`text-sm text-secondary font-bold uppercase tracking-wide ${styles.vendorHeading}`}>Vendor (optional)</p>
        <div className={`d-grid ${styles.vendorGrid}`}>
          <div><label className={styles.label}>Vendor Name</label><input value={form.vendor.name} onChange={(e) => setVendor('name', e.target.value)} placeholder="Name" className={styles.input} /></div>
          <div><label className={styles.label}>Phone</label><input value={form.vendor.phone} onChange={(e) => setVendor('phone', e.target.value)} placeholder="+91..." className={styles.input} /></div>
          <div><label className={styles.label}>Company</label><input value={form.vendor.company} onChange={(e) => setVendor('company', e.target.value)} placeholder="Company" className={styles.input} /></div>
        </div>
      </div>

      <div>
        <label className={styles.label}>Notes</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Internal notes..." className={`${styles.input} ${styles.textarea}`} />
      </div>

      <div className={`d-flex gap-3 ${styles.formActions}`}>
        <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
        <button onClick={handleSave} disabled={saving} className={`${styles.actionButton} ${styles.saveButton}`}>
          {saving ? 'Saving...' : 'Save Task'}
        </button>
      </div>
    </div>);

}

/* ── Expense form ───────────────────────────────────────────────── */
function ExpenseForm({ task, onSave, onClose }) {
  const [form, setForm] = useState({ expenseAmount: '', expenseCategory: 'Other', bills: [] });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFiles = async (files) => {
    const arr = Array.from(files).slice(0, 5);
    const results = [];
    for (const file of arr) {
      if (file.size > 2 * 1024 * 1024) {toast.error(`${file.name} exceeds 2MB`);continue;}
      const b64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      results.push({ name: file.name, data: b64, type: file.type });
    }
    set('bills', results);
  };

  const handleSave = async () => {
    if (!form.expenseAmount || isNaN(Number(form.expenseAmount))) return toast.error('Valid expense amount required');
    setSaving(true);
    try {
      await submitTaskExpense(task._id, { expenseAmount: Number(form.expenseAmount), expenseCategory: form.expenseCategory, bills: form.bills });
      toast.success('Expense submitted');
      onSave();
    } catch {toast.error('Submit failed');} finally
    {setSaving(false);}
  };

  return (
    <div className="d-flex-col gap-3">
      <div className={`rounded-lg border-default ${styles.taskSummary}`}>
        <p className={`text-md text-secondary ${styles.flushText}`}>Task: <strong className="text-heading">{task.title}</strong></p>
      </div>
      <div className={`d-grid ${styles.twoColumnGrid}`}>
        <div><label className={styles.label}>Expense Amount (₹) *</label><input type="number" min="0" value={form.expenseAmount} onChange={(e) => set('expenseAmount', e.target.value)} placeholder="0.00" className={styles.input} /></div>
        <div><label className={styles.label}>Expense Category</label>
          <select value={form.expenseCategory} onChange={(e) => set('expenseCategory', e.target.value)} className={styles.input}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={styles.label}>Bills / Receipts (up to 5, max 2MB each)</label>
        <input type="file" multiple accept="image/*,.pdf" onChange={(e) => handleFiles(e.target.files)} className={styles.fileInput} />
        {form.bills.length > 0 &&
        <div className={`d-flex flex-wrap ${styles.fileList}`}>
            {form.bills.map((b, i) =>
          <span key={i} className={`text-sm ${styles.fileChip}`}>
                {b.name}
              </span>
          )}
          </div>
        }
      </div>
      <div className={`d-flex gap-3 ${styles.formActions}`}>
        <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
        <button onClick={handleSave} disabled={saving} className={`${styles.actionButton} ${styles.saveButton}`}>
          {saving ? 'Submitting...' : 'Submit Expense'}
        </button>
      </div>
    </div>);

}

/* ── Approve modal ──────────────────────────────────────────────── */
function ApproveModal({ task, onSave, onClose }) {
  const [saving, setSaving] = useState(false);
  const handleApprove = async () => {
    setSaving(true);
    try {await approveTaskExpense(task._id);toast.success('Expense approved');onSave();}
    catch {toast.error('Approve failed');} finally
    {setSaving(false);}
  };
  return (
    <div className="d-flex-col gap-4">
      <div className={`rounded-lg ${styles.approvalNotice}`}>
        <p className={`text-body ${styles.approvalNoticeText}`}>
          Approve expense of <strong>₹{task.expenseAmount?.toLocaleString('en-IN')}</strong> for task <strong>{task.title}</strong>?
        </p>
      </div>
      <div className={`d-flex gap-3 ${styles.dialogActions}`}>
        <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
        <button onClick={handleApprove} disabled={saving} className={`${styles.actionButton} ${styles.approveButton}`}>
          {saving ? 'Approving...' : 'Approve'}
        </button>
      </div>
    </div>);

}

/* ── Reject modal ───────────────────────────────────────────────── */
function RejectModal({ task, onSave, onClose }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const handleReject = async () => {
    if (!reason.trim()) return toast.error('Please provide a reason');
    setSaving(true);
    try {await rejectTaskExpense(task._id, reason);toast.success('Expense rejected');onSave();}
    catch {toast.error('Reject failed');} finally
    {setSaving(false);}
  };
  return (
    <div className="d-flex-col gap-3">
      <div className={`rounded-lg ${styles.rejectionNotice}`}>
        <p className={`text-body ${styles.rejectionNoticeText}`}>
          Rejecting expense of <strong>₹{task.expenseAmount?.toLocaleString('en-IN')}</strong> for <strong>{task.title}</strong>
        </p>
      </div>
      <div><label className={styles.label}>Reason *</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Explain why the expense is being rejected..." className={`${styles.input} ${styles.textarea}`} />
      </div>
      <div className={`d-flex gap-3 ${styles.dialogActions}`}>
        <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
        <button onClick={handleReject} disabled={saving} className={`${styles.actionButton} ${styles.rejectButton}`}>
          {saving ? 'Rejecting...' : 'Reject'}
        </button>
      </div>
    </div>);

}

/* ── Task card ──────────────────────────────────────────────────── */
function TaskCard({ task, isAdmin, onEdit, onDelete, onStatusUpdate, onExpense, onApprove, onReject }) {
  const overdue = isOverdue(task.dueDate, task.status);

  return (
    <div className={`bg-white d-flex-col ${styles.taskCard}`}>

      {/* Header */}
      <div className={`row-between ${styles.taskCardHeader}`}>
        <div className="flex-1 min-w-0">
          <p className={`font-extrabold text-heading text-truncate ${styles.taskTitle}`}>{task.title}</p>
        </div>
        <div className={`d-flex flex-wrap flex-shrink-0 ${styles.taskBadges}`}>
          {/* Category + priority badges — colors are data-driven */}
          <span className={`font-bold ${styles.colorBadge}`} data-category={task.category}>
            {task.category}
          </span>
          <span className={`font-bold ${styles.colorBadge}`} data-priority={task.priority}>
            {task.priority}
          </span>
          {task.linkedExpenseId &&
          <span className={`font-bold ${styles.linkedExpenseBadge}`}>
              Linked to expense
            </span>
          }
        </div>
      </div>

      {/* Created by / assigned to */}
      <div className="d-flex flex-wrap gap-4">
        {task.createdBy &&
        <span className={`row-center text-sm text-secondary ${styles.metadataItem}`}>
            <User size={12} /> {task.createdBy.name || task.createdBy}
            {task.createdBy.department && <span className="text-muted">· {task.createdBy.department}</span>}
          </span>
        }
        {task.assignedTo &&
        <span className={`row-center text-sm font-semibold ${styles.assignmentItem}`}>
            <UserCheck size={12} /> {task.assignedTo.name || task.assignedTo}
          </span>
        }
      </div>

      {/* Description */}
      {task.description &&
      <p className={`text-md text-muted overflow-hidden ${styles.taskDescription}`}>
          {task.description}
        </p>
      }

      {/* Times */}
      <div className="d-flex flex-wrap gap-3">
        {task.taskStartTime &&
        <span className={`row-center text-sm text-secondary ${styles.compactMetadataItem}`}>
            <Clock size={11} /> Started: {fmtDateTime(task.taskStartTime)}
          </span>
        }
        {task.taskCompleteTime &&
        <span className={`row-center text-sm ${styles.completedMetadataItem}`}>
            <CheckCircle2 size={11} /> Done: {fmtDateTime(task.taskCompleteTime)}
          </span>
        }
      </div>

      {/* Due date — color is data-driven */}
      {task.dueDate &&
      <span className={`row-center text-sm ${styles.dueDate} ${overdue ? styles.overdue : ''}`}>
          <Calendar size={11} />
          Due: {fmtDate(task.dueDate)}
          {overdue && <span className={`font-bold ${styles.overdueBadge}`}>OVERDUE</span>}
        </span>
      }

      {/* Vendor */}
      {task.vendor?.name &&
      <div className={`rounded-md border-default ${styles.vendorDetails}`}>
          <div className="d-flex flex-wrap align-center gap-3">
            <span className={`row-center text-sm text-body-clr font-semibold ${styles.compactMetadataItem}`}>
              <Building2 size={11} /> {task.vendor.name}
              {task.vendor.company && <span className="text-muted font-normal"> · {task.vendor.company}</span>}
            </span>
            {task.vendor.phone &&
          <span className={`row-center text-sm text-secondary ${styles.compactMetadataItem}`}>
                <Phone size={11} /> {task.vendor.phone}
              </span>
          }
          </div>
        </div>
      }

      {/* Bills */}
      {task.bills?.length > 0 &&
      <span className={`row-center text-sm font-semibold ${styles.expenseLink}`}>
          <FileText size={11} />
          <span className={styles.expenseLinkBadge}>
            {task.bills.length} bill{task.bills.length !== 1 ? 's' : ''}
          </span>
        </span>
      }

      {/* Expense section */}
      {task.expenseStatus && task.expenseStatus !== 'Not Submitted' &&
      <div className={styles.expensePanel} data-expense-status={task.expenseStatus}>
          <div className="row-between flex-wrap gap-2">
            <div>
              <span className="text-sm text-secondary">Expense: </span>
              <span className="text-body font-bold text-heading">₹{task.expenseAmount?.toLocaleString('en-IN')}</span>
              {task.expenseCategory && <span className={`text-sm text-muted ${styles.expenseCategory}`}>· {task.expenseCategory}</span>}
            </div>
            <span className={`font-bold ${styles.colorBadge}`} data-expense-status={task.expenseStatus}>
              {task.expenseStatus}
            </span>
          </div>
          {task.expenseStatus === 'Rejected' && task.expenseRejectionReason &&
        <p className={`text-sm ${styles.rejectionReason}`}>Reason: {task.expenseRejectionReason}</p>
        }
          {isAdmin && task.expenseStatus === 'Pending' &&
        <div className={`d-flex gap-2 ${styles.expenseReviewActions}`}>
              <button onClick={() => onApprove(task)} className={`cursor-pointer font-bold ${styles.approveExpenseButton}`}>
                ✓ Approve
              </button>
              <button onClick={() => onReject(task)} className={`cursor-pointer font-bold ${styles.rejectExpenseButton}`}>
                ✕ Reject
              </button>
            </div>
        }
        </div>
      }

      {/* Action buttons */}
      <div className={`d-flex flex-wrap ${styles.taskActions}`}>
        {task.status === 'Open' &&
        <button onClick={() => onStatusUpdate(task, 'In Progress')} className={`cursor-pointer font-bold ${styles.startTaskButton}`}>
          
            ▶ Start
          </button>
        }
        {task.status === 'In Progress' &&
        <button onClick={() => onStatusUpdate(task, 'Completed')} className={`cursor-pointer font-bold ${styles.completeTaskButton}`}>
          
            ✓ Complete
          </button>
        }
        {task.status === 'Completed' && (!task.expenseStatus || task.expenseStatus === 'Not Submitted') &&
        <button onClick={() => onExpense(task)} className={`cursor-pointer font-bold ${styles.expenseButton}`}>
          
            $ Submit Expense
          </button>
        }
        <div className="flex-1" />
        <button onClick={() => onEdit(task)} className={`cursor-pointer font-semibold row-center ${styles.editTaskButton}`}>
          
          <Pencil size={11} /> Edit
        </button>
        <button onClick={() => onDelete(task._id)} className={`cursor-pointer font-semibold row-center ${styles.deleteTaskButton}`}>
          
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </div>);

}

/* ── Main page ──────────────────────────────────────────────────── */
export default function OfficeTasksPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);

  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ total: 0, openInProgress: 0, completed: 0, pendingExpense: 0 });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('All');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterExpenseStatus, setFilterExpenseStatus] = useState('');

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [expenseTask, setExpenseTask] = useState(null);
  const [approveTask, setApproveTask] = useState(null);
  const [rejectTask, setRejectTask] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tRes, sRes, eRes] = await Promise.all([listTasks(), getTaskStats(), listEmployees({ limit: 200, status: 'Active' })]);
      setTasks(tRes.data.data || []);
      const s = sRes.data.data || {};
      setStats({ total: s.total || 0, openInProgress: (s.open || 0) + (s.inProgress || 0), completed: s.completed || 0, pendingExpense: s.pendingExpense || 0 });
      setEmployees(eRes.data.data || []);
    } catch {toast.error('Failed to load tasks');} finally
    {setLoading(false);}
  };

  useEffect(() => {fetchAll();}, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this task?')) return;
    try {await deleteTask(id);toast.success('Task deleted');fetchAll();}
    catch {toast.error('Delete failed');}
  };

  const handleStatusUpdate = async (task, newStatus) => {
    const payload = { status: newStatus };
    if (newStatus === 'In Progress') payload.taskStartTime = new Date().toISOString();
    if (newStatus === 'Completed') payload.taskCompleteTime = new Date().toISOString();
    try {await updateTask(task._id, payload);toast.success(`Task marked as ${newStatus}`);fetchAll();}
    catch {toast.error('Update failed');}
  };

  const TABS = ['All', 'Open', 'In Progress', 'Completed', 'Cancelled'];
  const filtered = tasks.filter((t) => {
    if (tab !== 'All' && t.status !== tab) return false;
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterExpenseStatus && (t.expenseStatus || 'Not Submitted') !== filterExpenseStatus) return false;
    return true;
  });
  const tabCount = (t) => t === 'All' ? tasks.length : tasks.filter((x) => x.status === t).length;

  const statCards = [
  { label: 'Total Tasks', value: stats.total, color: '#6366f1', bg: '#eff6ff', Icon: ClipboardCheck },
  { label: 'Open / In Progress', value: stats.openInProgress, color: '#f59e0b', bg: '#fffbeb', Icon: Clock },
  { label: 'Completed', value: stats.completed, color: '#22c55e', bg: '#f0fdf4', Icon: CheckCircle2 },
  { label: 'Pending Expense', value: stats.pendingExpense, color: '#ef4444', bg: '#fef2f2', Icon: DollarSign }];


  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={`row-between flex-wrap gap-3 ${styles.pageHeader}`}>
        <div>
          <h1 className={`section-title tracking-tight ${styles.pageTitle}`}>Office Tasks</h1>
          <p className={`text-secondary ${styles.pageSubtitle}`}>Manage maintenance, cleaning, IT and other office tasks</p>
        </div>
        <button onClick={() => {setEditTask(null);setShowTaskForm(true);}}
        className={`row-center gap-2 cursor-pointer font-bold text-white ${styles.createTaskButton}`}>
          
          <Plus size={16} /> New Task
        </button>
      </div>

      {/* Stat cards — icon bg/color and value color are data-driven */}
      <div className={`d-grid ${styles.statsGrid}`}>
        {statCards.map((s) =>
        <div key={s.label} className={`bg-white row-center rounded-2xl ${styles.statCard}`}>
        <div className={`d-flex align-center justify-center flex-shrink-0 ${styles.statIcon}`} data-label={s.label}>
              <s.Icon size={22} color={s.color} strokeWidth={2} />
            </div>
            <div>
              <div className={`font-extrabold leading-none ${styles.statValue}`} data-label={s.label}>{s.value}</div>
              <div className={`text-sm text-secondary font-medium ${styles.statLabel}`}>{s.label}</div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs — active state bg/color are conditional */}
      <div className={`d-flex flex-wrap ${styles.tabs}`}>
        {TABS.map((t) =>
      <button key={t} onClick={() => setTab(t)} className={`row-center cursor-pointer ${styles.tabButton} ${tab === t ? styles.active : ''}`}>
            {t}
            <span className={`font-bold ${styles.tabCount}`}>
              {tabCount(t)}
            </span>
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className={`d-flex flex-wrap align-center ${styles.filters}`}>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={styles.select}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={styles.select}>
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={filterExpenseStatus} onChange={(e) => setFilterExpenseStatus(e.target.value)} className={styles.select}>
          <option value="">All Expense Status</option>
          {EXPENSE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        {(filterCategory || filterPriority || filterExpenseStatus) &&
        <button onClick={() => {setFilterCategory('');setFilterPriority('');setFilterExpenseStatus('');}}
        className={`row-center cursor-pointer font-semibold ${styles.clearFiltersButton}`}>
          
            <X size={12} /> Clear
          </button>
        }
        <span className={`text-muted text-md ${styles.resultCount}`}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Task grid */}
      {loading ?
      <div className={`text-secondary ${styles.loadingState}`}>Loading tasks...</div> :
      filtered.length === 0 ?
      <div className={`bg-white rounded-2xl ${styles.emptyState}`}>
          <div className={`d-flex align-center justify-center ${styles.emptyStateIcon}`}>
            <ClipboardCheck size={28} color="#6366f1" strokeWidth={1.5} />
          </div>
          <p className={`font-bold text-heading ${styles.emptyStateTitle}`}>No tasks found</p>
          <p className={`text-muted ${styles.emptyStateText}`}>
            {tasks.length === 0 ? 'Create your first office task to get started' : 'Try adjusting your filters'}
          </p>
          {tasks.length === 0 &&
        <button onClick={() => {setEditTask(null);setShowTaskForm(true);}}
        className={`row-center cursor-pointer font-bold text-white ${styles.emptyStateButton}`}>
          
              <Plus size={15} /> Create Task
            </button>
        }
        </div> :

      <div className={`d-grid ${styles.taskGrid}`}>
          {filtered.map((task) =>
        <TaskCard
          key={task._id} task={task} isAdmin={isAdmin}
          onEdit={(t) => {setEditTask(t);setShowTaskForm(true);}}
          onDelete={handleDelete}
          onStatusUpdate={handleStatusUpdate}
          onExpense={(t) => setExpenseTask(t)}
          onApprove={(t) => setApproveTask(t)}
          onReject={(t) => setRejectTask(t)} />

        )}
        </div>
      }

      {/* Modals */}
      {showTaskForm &&
      <Modal title={editTask ? 'Edit Task' : 'New Office Task'} onClose={() => {setShowTaskForm(false);setEditTask(null);}}>
          <TaskForm task={editTask} employees={employees} onSave={() => {setShowTaskForm(false);setEditTask(null);fetchAll();}} onClose={() => {setShowTaskForm(false);setEditTask(null);}} />
        </Modal>
      }
      {expenseTask &&
      <Modal title="Submit Expense" onClose={() => setExpenseTask(null)}>
          <ExpenseForm task={expenseTask} onSave={() => {setExpenseTask(null);fetchAll();}} onClose={() => setExpenseTask(null)} />
        </Modal>
      }
      {approveTask &&
      <Modal title="Approve Expense" onClose={() => setApproveTask(null)} maxWidth="420px">
          <ApproveModal task={approveTask} onSave={() => {setApproveTask(null);fetchAll();}} onClose={() => setApproveTask(null)} />
        </Modal>
      }
      {rejectTask &&
      <Modal title="Reject Expense" onClose={() => setRejectTask(null)} maxWidth="420px">
          <RejectModal task={rejectTask} onSave={() => {setRejectTask(null);fetchAll();}} onClose={() => setRejectTask(null)} />
        </Modal>
      }
    </div>);

}
