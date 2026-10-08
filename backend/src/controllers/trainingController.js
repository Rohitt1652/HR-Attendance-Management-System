const Training = require('../models/Training');
const TrainingEnrollment = require('../models/TrainingEnrollment');
const User = require('../models/User');
const notify = require('../utils/notify');

// ── Trainings ─────────────────────────────────────────────────────────────────

exports.getTrainings = async (req, res, next) => {
  try {
    const { status, category } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    const trainings = await Training.find(filter).populate('createdBy', 'name').sort({ startDate: -1 });
    res.json({ success: true, data: trainings });
  } catch (err) { next(err); }
};

exports.createTraining = async (req, res, next) => {
  try {
    const training = await Training.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: training });
  } catch (err) { next(err); }
};

exports.updateTraining = async (req, res, next) => {
  try {
    const training = await Training.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!training) return res.status(404).json({ success: false, message: 'Training not found' });
    res.json({ success: true, data: training });
  } catch (err) { next(err); }
};

exports.deleteTraining = async (req, res, next) => {
  try {
    await Training.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Training deleted' });
  } catch (err) { next(err); }
};

// ── Enrollments ───────────────────────────────────────────────────────────────

exports.getEnrollments = async (req, res, next) => {
  try {
    const { trainingId, userId, paymentStatus } = req.query;
    const filter = {};
    if (trainingId) filter.trainingId = trainingId;
    if (userId) filter.userId = userId;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    const enrollments = await TrainingEnrollment.find(filter)
      .populate('trainingId', 'title isPaid fee startDate endDate status')
      .populate('userId', 'name email department designation employeeId')
      .populate('enrolledBy', 'name')
      .populate('collectedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: enrollments });
  } catch (err) { next(err); }
};

exports.getMyEnrollments = async (req, res, next) => {
  try {
    const enrollments = await TrainingEnrollment.find({ userId: req.user._id })
      .populate('trainingId', 'title category isPaid fee startDate endDate status venue trainer')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: enrollments });
  } catch (err) { next(err); }
};

exports.enrollUser = async (req, res, next) => {
  try {
    const { trainingId, userId } = req.body;
    const training = await Training.findById(trainingId);
    if (!training) return res.status(404).json({ success: false, message: 'Training not found' });

    const targetUserId = userId || req.user._id;
    const existing = await TrainingEnrollment.findOne({ trainingId, userId: targetUserId });
    if (existing) return res.status(400).json({ success: false, message: 'Already enrolled' });

    const enrollment = await TrainingEnrollment.create({
      trainingId,
      userId: targetUserId,
      enrolledBy: req.user._id,
      amountDue: training.isPaid ? training.fee : 0,
      paymentStatus: training.isPaid ? 'Pending' : 'Waived',
    });

    await notify(targetUserId, 'training', 'Training Enrollment', `You have been enrolled in "${training.title}"`, '/employee/training');
    res.status(201).json({ success: true, data: enrollment });
  } catch (err) { next(err); }
};

exports.updateEnrollment = async (req, res, next) => {
  try {
    const enrollment = await TrainingEnrollment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found' });
    res.json({ success: true, data: enrollment });
  } catch (err) { next(err); }
};

exports.collectTrainingPayment = async (req, res, next) => {
  try {
    const { amountPaid, paymentMethod, paymentRef } = req.body;
    const enrollment = await TrainingEnrollment.findById(req.params.id);
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found' });

    enrollment.amountPaid = (enrollment.amountPaid || 0) + amountPaid;
    enrollment.paymentMethod = paymentMethod;
    enrollment.paymentRef = paymentRef;
    enrollment.collectedBy = req.user._id;
    enrollment.paidAt = new Date();
    if (enrollment.amountPaid >= enrollment.amountDue) enrollment.paymentStatus = 'Paid';
    await enrollment.save();

    await notify(enrollment.userId, 'payment', 'Training Payment Received', `Payment of ₹${amountPaid} received for your training.`, '/employee/training');
    res.json({ success: true, data: enrollment });
  } catch (err) { next(err); }
};

exports.getTrainingPaymentSummary = async (req, res, next) => {
  try {
    const { trainingId } = req.params;
    const enrollments = await TrainingEnrollment.find({ trainingId })
      .populate('userId', 'name employeeId department')
      .populate('collectedBy', 'name');
    const totalDue = enrollments.reduce((s, e) => s + (e.amountDue || 0), 0);
    const totalPaid = enrollments.reduce((s, e) => s + (e.amountPaid || 0), 0);
    const pending = enrollments.filter(e => e.paymentStatus === 'Pending');
    res.json({ success: true, data: { enrollments, totalDue, totalPaid, totalPending: totalDue - totalPaid, pendingCount: pending.length } });
  } catch (err) { next(err); }
};
