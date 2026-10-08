const JobPosting = require('../models/JobPosting');
const Candidate = require('../models/Candidate');
const Interview = require('../models/Interview');
const notify = require('../utils/notify');
const multer = require('multer');
const path = require('path');

const resumeStorage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `resume-${req.params.id}-${Date.now()}${path.extname(file.originalname)}`),
});
exports.uploadResume = multer({
  storage: resumeStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
}).single('resume');

exports.uploadCandidateResume = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { resumeUrl: `/uploads/${req.file.filename}`, resumeFileName: req.file.originalname },
      { new: true }
    );
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });
    res.json({ success: true, data: candidate });
  } catch (err) { next(err); }
};

// ── Job Postings ──────────────────────────────────────────────────────────────

exports.getJobs = async (req, res, next) => {
  try {
    const { status, department } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (department) filter.department = department;
    const jobs = await JobPosting.find(filter).populate('createdBy', 'name').sort({ createdAt: -1 });
    res.json({ success: true, data: jobs });
  } catch (err) { next(err); }
};

exports.createJob = async (req, res, next) => {
  try {
    const job = await JobPosting.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: job });
  } catch (err) { next(err); }
};

exports.updateJob = async (req, res, next) => {
  try {
    const job = await JobPosting.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
};

exports.deleteJob = async (req, res, next) => {
  try {
    await JobPosting.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Job deleted' });
  } catch (err) { next(err); }
};

// ── Candidates ────────────────────────────────────────────────────────────────

exports.getCandidates = async (req, res, next) => {
  try {
    const { jobId, stage } = req.query;
    const filter = {};
    if (jobId) filter.jobId = jobId;
    if (stage) filter.stage = stage;
    const candidates = await Candidate.find(filter)
      .populate('jobId', 'title department')
      .populate('assignedTo', 'name')
      .populate('referredBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: candidates });
  } catch (err) { next(err); }
};

exports.createCandidate = async (req, res, next) => {
  try {
    const candidate = await Candidate.create(req.body);
    res.status(201).json({ success: true, data: candidate });
  } catch (err) { next(err); }
};

exports.updateCandidate = async (req, res, next) => {
  try {
    const candidate = await Candidate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });
    res.json({ success: true, data: candidate });
  } catch (err) { next(err); }
};

exports.deleteCandidate = async (req, res, next) => {
  try {
    await Candidate.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Candidate deleted' });
  } catch (err) { next(err); }
};

// ── Interviews ────────────────────────────────────────────────────────────────

exports.getInterviews = async (req, res, next) => {
  try {
    const { candidateId, jobId } = req.query;
    const filter = {};
    if (candidateId) filter.candidateId = candidateId;
    if (jobId) filter.jobId = jobId;
    const interviews = await Interview.find(filter)
      .populate('candidateId', 'name email stage')
      .populate('jobId', 'title department')
      .populate('interviewers', 'name designation')
      .sort({ scheduledAt: 1 });
    res.json({ success: true, data: interviews });
  } catch (err) { next(err); }
};

exports.scheduleInterview = async (req, res, next) => {
  try {
    const interview = await Interview.create({ ...req.body, createdBy: req.user._id });
    // Notify interviewers
    for (const uid of (req.body.interviewers || [])) {
      await notify(uid, 'interview', 'Interview Scheduled', `You have an interview scheduled on ${new Date(req.body.scheduledAt).toLocaleString()}`, '/admin/hiring');
    }
    res.status(201).json({ success: true, data: interview });
  } catch (err) { next(err); }
};

exports.updateInterview = async (req, res, next) => {
  try {
    const interview = await Interview.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!interview) return res.status(404).json({ success: false, message: 'Interview not found' });
    res.json({ success: true, data: interview });
  } catch (err) { next(err); }
};

exports.deleteInterview = async (req, res, next) => {
  try {
    await Interview.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Interview deleted' });
  } catch (err) { next(err); }
};
