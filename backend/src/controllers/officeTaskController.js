const OfficeTask = require('../models/OfficeTask');
const Expense = require('../models/Expense');

const POPULATE_FIELDS = [
  { path: 'createdBy', select: 'name employeeId department' },
  { path: 'assignedTo', select: 'name employeeId department' },
  { path: 'expenseApprovedBy', select: 'name' },
  { path: 'linkedExpenseId', select: 'title amount status paymentStatus' },
];

// POST /api/office-tasks — any admin/hr/reception user
exports.createTask = async (req, res, next) => {
  try {
    const {
      title, description, category, priority, dueDate,
      assignedTo, vendor, notes,
    } = req.body;
    if (!title || !category) {
      return res.status(400).json({ success: false, message: 'title and category are required' });
    }
    const task = await OfficeTask.create({
      title, description, category, priority: priority || 'Medium',
      dueDate: dueDate || null,
      assignedTo: assignedTo || null,
      vendor: vendor || null,
      notes,
      createdBy: req.user._id,
    });
    await task.populate(POPULATE_FIELDS);
    res.status(201).json({ success: true, data: task });
  } catch (err) { next(err); }
};

// GET /api/office-tasks — list with filters
exports.listTasks = async (req, res, next) => {
  try {
    const { status, category, priority, expenseStatus, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (expenseStatus) filter.expenseStatus = expenseStatus;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [tasks, total] = await Promise.all([
      OfficeTask.find(filter)
        .populate(POPULATE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      OfficeTask.countDocuments(filter),
    ]);
    res.json({ success: true, data: tasks, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

// GET /api/office-tasks/:id
exports.getTask = async (req, res, next) => {
  try {
    const task = await OfficeTask.findById(req.params.id).populate(POPULATE_FIELDS);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) { next(err); }
};

// PUT /api/office-tasks/:id — update task details
exports.updateTask = async (req, res, next) => {
  try {
    const {
      title, description, category, priority, status,
      assignedTo, dueDate, taskStartTime, taskCompleteTime,
      vendor, bills, notes,
    } = req.body;

    const task = await OfficeTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (category !== undefined) task.category = category;
    if (priority !== undefined) task.priority = priority;
    if (status !== undefined) task.status = status;
    if (assignedTo !== undefined) task.assignedTo = assignedTo || null;
    if (dueDate !== undefined) task.dueDate = dueDate || null;
    if (taskStartTime !== undefined) task.taskStartTime = taskStartTime || null;
    if (taskCompleteTime !== undefined) task.taskCompleteTime = taskCompleteTime || null;
    if (vendor !== undefined) task.vendor = vendor || null;
    if (bills !== undefined) task.bills = bills;
    if (notes !== undefined) task.notes = notes;

    await task.save();
    await task.populate(POPULATE_FIELDS);
    res.json({ success: true, data: task });
  } catch (err) { next(err); }
};

// POST /api/office-tasks/:id/submit-expense — reception submits expense for HR review
exports.submitExpense = async (req, res, next) => {
  try {
    const { expenseAmount, expenseCategory, bills } = req.body;
    if (!expenseAmount || expenseAmount <= 0) {
      return res.status(400).json({ success: false, message: 'expenseAmount must be greater than 0' });
    }
    const task = await OfficeTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (task.expenseStatus === 'Approved') {
      return res.status(400).json({ success: false, message: 'Expense already approved' });
    }

    task.expenseAmount = expenseAmount;
    task.expenseCategory = expenseCategory || 'Maintenance';
    task.expenseStatus = 'Pending';
    task.expenseSubmittedAt = new Date();
    if (bills && bills.length) task.bills = bills;

    await task.save();
    await task.populate(POPULATE_FIELDS);
    res.json({ success: true, data: task, message: 'Expense submitted for HR review' });
  } catch (err) { next(err); }
};

// PUT /api/office-tasks/:id/approve-expense — HR approves and auto-creates Expense record
exports.approveExpense = async (req, res, next) => {
  try {
    const task = await OfficeTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (task.expenseStatus !== 'Pending') {
      return res.status(400).json({ success: false, message: 'No pending expense to approve' });
    }

    // Auto-create an Expense record in the main expense module
    const expense = await Expense.create({
      submittedBy: task.createdBy,
      title: `[Task] ${task.title}`,
      category: mapExpenseCategory(task.expenseCategory),
      amount: task.expenseAmount,
      currency: 'INR',
      date: task.taskCompleteTime || task.updatedAt || new Date(),
      description: `Auto-generated from office task: ${task.title}. ${task.description || ''}`.trim(),
      receiptUrl: task.bills?.[0] || null,
      status: 'Approved',
      approvedBy: req.user._id,
    });

    task.expenseStatus = 'Approved';
    task.expenseApprovedBy = req.user._id;
    task.linkedExpenseId = expense._id;
    task.expenseRejectionReason = undefined;
    await task.save();
    await task.populate(POPULATE_FIELDS);

    res.json({ success: true, data: task, message: 'Expense approved and added to office expenses' });
  } catch (err) { next(err); }
};

// PUT /api/office-tasks/:id/reject-expense — HR rejects
exports.rejectExpense = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });

    const task = await OfficeTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (task.expenseStatus !== 'Pending') {
      return res.status(400).json({ success: false, message: 'No pending expense to reject' });
    }

    task.expenseStatus = 'Rejected';
    task.expenseRejectionReason = reason;
    await task.save();
    await task.populate(POPULATE_FIELDS);
    res.json({ success: true, data: task });
  } catch (err) { next(err); }
};

// DELETE /api/office-tasks/:id
exports.deleteTask = async (req, res, next) => {
  try {
    const task = await OfficeTask.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) { next(err); }
};

// GET /api/office-tasks/stats
exports.getStats = async (req, res, next) => {
  try {
    const [byStatus, byCategory, pendingExpenses, totalExpenseApproved] = await Promise.all([
      OfficeTask.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      OfficeTask.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      OfficeTask.countDocuments({ expenseStatus: 'Pending' }),
      OfficeTask.aggregate([
        { $match: { expenseStatus: 'Approved' } },
        { $group: { _id: null, total: { $sum: '$expenseAmount' } } },
      ]),
    ]);
    res.json({
      success: true,
      data: {
        byStatus,
        byCategory,
        pendingExpenses,
        totalExpenseApproved: totalExpenseApproved[0]?.total || 0,
      },
    });
  } catch (err) { next(err); }
};

// Map task expense category to Expense model category
function mapExpenseCategory(cat) {
  const map = {
    'Maintenance': 'Maintenance',
    'Utilities': 'Utilities',
    'Office Supplies': 'Office Supplies',
    'Hardware': 'Hardware',
    'Other': 'Other',
  };
  return map[cat] || 'Maintenance';
}
