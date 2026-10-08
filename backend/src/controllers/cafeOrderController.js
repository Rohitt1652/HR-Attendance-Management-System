const CafeOrder = require('../models/CafeOrder');
const notify = require('../utils/notify');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Orders ────────────────────────────────────────────────────────────────────

exports.placeOrder = async (req, res, next) => {
  try {
    const { items, notes, lunchDate } = req.body;
    if (!items || !items.length) return res.status(400).json({ success: false, message: 'No items in order' });

    // Validate and parse lunchDate (default to today)
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let bookingDate = today;
    if (lunchDate) {
      bookingDate = new Date(lunchDate);
      bookingDate.setHours(0, 0, 0, 0);
      if (bookingDate < today) {
        return res.status(400).json({ success: false, message: 'Cannot book lunch for a past date' });
      }
      // Limit to 7 days in advance
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + 7);
      if (bookingDate > maxDate) {
        return res.status(400).json({ success: false, message: 'Cannot book more than 7 days in advance' });
      }
    }

    // Cutoff time check: if booking for today, enforce time limits per category
    if (bookingDate.getTime() === today.getTime()) {
      const { CafeConfig } = require('../models/CafeMenu');
      let config = await CafeConfig.findOne({ key: 'global' });
      if (!config) config = { lunchCutoff: '11:30', snacksCutoff: '17:00' };
      const hasLunchItems = items.some(i => (i.category || '').toLowerCase() === 'lunch');
      const hasOtherItems = items.some(i => (i.category || '').toLowerCase() !== 'lunch');

      if (hasLunchItems) {
        const cutoff = config.lunchCutoff || '11:30';
        const [cutH, cutM] = cutoff.split(':').map(Number);
        const cutoffTime = new Date(now);
        cutoffTime.setHours(cutH, cutM, 0, 0);
        if (now > cutoffTime) {
          return res.status(400).json({ success: false, message: `Lunch booking for today is closed (cutoff: ${cutoff}). Remove lunch items or pre-book for tomorrow.` });
        }
      }

      if (hasOtherItems && !hasLunchItems) {
        const cutoff = config.snacksCutoff || '17:00';
        const [cutH, cutM] = cutoff.split(':').map(Number);
        const snackCutoff = new Date(now);
        snackCutoff.setHours(cutH, cutM, 0, 0);
        if (now > snackCutoff) {
          return res.status(400).json({ success: false, message: `Snacks/beverages ordering for today is closed (cutoff: ${cutoff}). You can pre-book for tomorrow.` });
        }
      }
    }

    const totalAmount = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const day = DAYS[bookingDate.getDay()];
    const order = await CafeOrder.create({
      userId: req.user._id,
      items,
      totalAmount,
      day,
      lunchDate: bookingDate,
      notes,
    });
    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await CafeOrder.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
};

exports.getAllOrders = async (req, res, next) => {
  try {
    const { status, paymentStatus, date } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (date) {
      const d = new Date(date);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      filter.lunchDate = { $gte: start, $lte: end };
    }
    const orders = await CafeOrder.find(filter)
      .populate('userId', 'name employeeId department')
      .populate('collectedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, cancelReason } = req.body;
    const order = await CafeOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.status = status;
    if (cancelReason) order.cancelReason = cancelReason;
    await order.save();
    if (status === 'Ready') {
      await notify(order.userId, 'cafe', 'Order Ready', 'Your cafe order is ready for pickup!', '/employee/cafe-orders');
    }
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await CafeOrder.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['Pending', 'Confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel order at this stage' });
    }
    order.status = 'Cancelled';
    order.cancelReason = req.body.reason || 'Cancelled by user';
    await order.save();
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};

exports.deleteOrder = async (req, res, next) => {
  try {
    const order = await CafeOrder.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, message: 'Order deleted' });
  } catch (err) { next(err); }
};

// ── Payments ──────────────────────────────────────────────────────────────────

// Employee submits payment proof (UPI screenshot / transaction ID)
exports.submitPayment = async (req, res, next) => {
  try {
    const { paymentMethod, paymentRef, paymentScreenshot, paymentNote } = req.body;
    const order = await CafeOrder.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.paymentStatus === 'Paid') return res.status(400).json({ success: false, message: 'Already marked as paid' });
    if (order.status === 'Cancelled') return res.status(400).json({ success: false, message: 'Order is cancelled' });
    order.paymentStatus = 'Submitted';
    order.paymentMethod = paymentMethod || 'UPI';
    order.paymentRef = paymentRef || '';
    order.paymentScreenshot = paymentScreenshot || '';
    order.paymentNote = paymentNote || '';
    await order.save();
    res.json({ success: true, data: order, message: 'Payment details submitted for verification' });
  } catch (err) { next(err); }
};

exports.collectPayment = async (req, res, next) => {
  try {
    const { paymentMethod, paymentRef } = req.body;
    const order = await CafeOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.paymentStatus = 'Paid';
    order.paymentMethod = paymentMethod || order.paymentMethod;
    order.paymentRef = paymentRef || order.paymentRef;
    order.paidAt = new Date();
    order.collectedBy = req.user._id;
    await order.save();
    await notify(order.userId, 'payment', 'Payment Confirmed', `Payment of ₹${order.totalAmount} confirmed for your cafe order.`, '/employee/lunch');
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
};

exports.getPaymentSummary = async (req, res, next) => {
  try {
    const { date } = req.query;
    const filter = {};
    if (date) {
      const d = new Date(date);
      filter.orderDate = { $gte: new Date(d.setHours(0,0,0,0)), $lte: new Date(d.setHours(23,59,59,999)) };
    }
    const orders = await CafeOrder.find({ ...filter, status: { $ne: 'Cancelled' } })
      .populate('userId', 'name employeeId department')
      .populate('collectedBy', 'name');
    const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);
    const totalPaid = orders.filter(o => o.paymentStatus === 'Paid').reduce((s, o) => s + o.totalAmount, 0);
    const totalUnpaid = orders.filter(o => o.paymentStatus === 'Unpaid').reduce((s, o) => s + o.totalAmount, 0);
    res.json({ success: true, data: { orders, totalRevenue, totalPaid, totalUnpaid, orderCount: orders.length } });
  } catch (err) { next(err); }
};
