const Expense = require('../models/Expense');

const ADMIN_ROLES = ['admin', 'hr', 'md'];

// POST /api/expenses — any authenticated user
exports.submitExpense = async (req, res, next) => {
  try {
    const { title, category, amount, currency, date, description, receiptUrl } = req.body;
    if (!title || !category || !amount || !date) {
      return res.status(400).json({ success: false, message: 'title, category, amount and date are required' });
    }
    const expense = await Expense.create({
      submittedBy: req.user._id,
      title,
      category,
      amount,
      currency: currency || 'INR',
      date,
      description,
      receiptUrl,
    });
    await expense.populate('submittedBy', 'name email department designation');
    res.status(201).json({ success: true, data: expense });
  } catch (err) { next(err); }
};

// GET /api/expenses/my — own expenses
exports.getMyExpenses = async (req, res, next) => {
  try {
    const expenses = await Expense.find({ submittedBy: req.user._id })
      .populate('approvedBy', 'name')
      .populate('paidBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: expenses });
  } catch (err) { next(err); }
};

// GET /api/expenses — HR/admin, with filters
exports.getAllExpenses = async (req, res, next) => {
  try {
    const { status, category, submittedBy, startDate, endDate, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (submittedBy) filter.submittedBy = submittedBy;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .populate('submittedBy', 'name email department designation employeeId')
        .populate('approvedBy', 'name')
        .populate('paidBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Expense.countDocuments(filter),
    ]);

    res.json({ success: true, data: expenses, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
};

// PUT /api/expenses/:id/approve — HR/admin
exports.approveExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    if (expense.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Only pending expenses can be approved' });
    }
    expense.status = 'Approved';
    expense.approvedBy = req.user._id;
    expense.rejectionReason = undefined;
    await expense.save();
    await expense.populate('submittedBy', 'name email department');
    await expense.populate('approvedBy', 'name');
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
};

// PUT /api/expenses/:id/reject — HR/admin
exports.rejectExpense = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    if (expense.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Only pending expenses can be rejected' });
    }
    expense.status = 'Rejected';
    expense.rejectionReason = reason;
    await expense.save();
    await expense.populate('submittedBy', 'name email department');
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
};

// PUT /api/expenses/:id/mark-paid — admin only
exports.markPaid = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    if (expense.status !== 'Approved') {
      return res.status(400).json({ success: false, message: 'Only approved expenses can be marked as paid' });
    }
    expense.paymentStatus = 'Paid';
    expense.paidAt = new Date();
    expense.paidBy = req.user._id;
    await expense.save();
    await expense.populate('submittedBy', 'name email department');
    await expense.populate('paidBy', 'name');
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
};

// DELETE /api/expenses/:id — admin only
exports.deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });

    const canManage = (req.permissions || []).includes('expenses:manage');
    const isOwner = String(expense.submittedBy) === String(req.user._id);
    if (!canManage && !isOwner) {
      return res.status(403).json({ success: false, message: 'You can only delete your own expenses' });
    }
    if (!canManage && expense.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Only pending expenses can be deleted' });
    }

    await expense.deleteOne();
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) { next(err); }
};

// GET /api/expenses/summary — HR/admin
exports.getExpenseSummary = async (req, res, next) => {
  try {
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(`${currentYear}-01-01`);
    const yearEnd = new Date(`${currentYear}-12-31T23:59:59`);

    const [totalAgg, byCategory, byStatus, byMonth] = await Promise.all([
      // Overall totals
      Expense.aggregate([
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),

      // By category
      Expense.aggregate([
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]),

      // By status
      Expense.aggregate([
        {
          $group: {
            _id: '$status',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),

      // By month (current year)
      Expense.aggregate([
        { $match: { date: { $gte: yearStart, $lte: yearEnd } } },
        {
          $group: {
            _id: { month: { $month: '$date' } },
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.month': 1 } },
      ]),
    ]);

    // Pending count
    const pendingCount = await Expense.countDocuments({ status: 'Pending' });

    // Approved amount
    const approvedAgg = await Expense.aggregate([
      { $match: { status: 'Approved' } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    ]);

    // This month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const thisMonthAgg = await Expense.aggregate([
      { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    ]);

    res.json({
      success: true,
      data: {
        totalAmount: totalAgg[0]?.totalAmount || 0,
        totalCount: totalAgg[0]?.count || 0,
        pendingCount,
        approvedAmount: approvedAgg[0]?.totalAmount || 0,
        thisMonthAmount: thisMonthAgg[0]?.totalAmount || 0,
        byCategory,
        byStatus,
        byMonth,
      },
    });
  } catch (err) { next(err); }
};
