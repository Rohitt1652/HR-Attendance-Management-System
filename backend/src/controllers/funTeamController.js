const FunTeam = require('../models/FunTeam');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `team-${Date.now()}${path.extname(file.originalname)}`),
});
exports.upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

exports.listTeams = async (req, res, next) => {
  try {
    const teams = await FunTeam.find({ isActive: true })
      .populate('captain', 'name profilePhotoUrl designation')
      .populate('members', 'name profilePhotoUrl designation department')
      .sort({ name: 1 });
    res.json({ success: true, data: teams });
  } catch (err) { next(err); }
};

exports.getTeam = async (req, res, next) => {
  try {
    const team = await FunTeam.findById(req.params.id)
      .populate('captain', 'name profilePhotoUrl designation')
      .populate('members', 'name profilePhotoUrl designation department');
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
};

exports.createTeam = async (req, res, next) => {
  try {
    const { name, description, color, captain, members } = req.body;
    const team = await FunTeam.create({
      name, description, color,
      captain: captain || null,
      members: members ? (Array.isArray(members) ? members : [members]) : [],
      logoUrl: req.file ? `/uploads/${req.file.filename}` : null,
    });
    res.status(201).json({ success: true, data: team });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Team name already exists' });
    next(err);
  }
};

exports.updateTeam = async (req, res, next) => {
  try {
    const { name, description, color, captain, members } = req.body;
    const update = { name, description, color, captain: captain || null };
    if (members !== undefined) update.members = Array.isArray(members) ? members : [members];
    if (req.file) update.logoUrl = `/uploads/${req.file.filename}`;
    const team = await FunTeam.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('captain', 'name profilePhotoUrl designation')
      .populate('members', 'name profilePhotoUrl designation department');
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
};

exports.deleteTeam = async (req, res, next) => {
  try {
    await FunTeam.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Team deleted' });
  } catch (err) { next(err); }
};

exports.addMember = async (req, res, next) => {
  try {
    const team = await FunTeam.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { members: req.body.userId } },
      { new: true }
    ).populate('members', 'name profilePhotoUrl designation');
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
};

exports.removeMember = async (req, res, next) => {
  try {
    const team = await FunTeam.findByIdAndUpdate(
      req.params.id,
      { $pull: { members: req.params.userId } },
      { new: true }
    ).populate('members', 'name profilePhotoUrl designation');
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
};

// ── Events ────────────────────────────────────────────────────────────────────

const eventImageStorage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `event-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
});
exports.uploadEventImages = multer({ storage: eventImageStorage, limits: { fileSize: 10 * 1024 * 1024 } }).array('images', 10);

exports.addEvent = async (req, res, next) => {
  try {
    const { title, description, date, videoUrls } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Event title required' });
    const images = (req.files || []).map(f => `/uploads/${f.filename}`);
    const videos = videoUrls
      ? (Array.isArray(videoUrls) ? videoUrls : [videoUrls]).filter(Boolean)
      : [];
    const team = await FunTeam.findByIdAndUpdate(
      req.params.id,
      { $push: { events: { title, description, date, images, videoUrls: videos } } },
      { new: true }
    );
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.status(201).json({ success: true, data: team.events[team.events.length - 1] });
  } catch (err) { next(err); }
};

exports.updateEvent = async (req, res, next) => {
  try {
    const { title, description, date, videoUrls, existingImages } = req.body;
    const newImages = (req.files || []).map(f => `/uploads/${f.filename}`);
    const kept = existingImages ? (Array.isArray(existingImages) ? existingImages : [existingImages]) : [];
    const images = [...kept, ...newImages];
    const videos = videoUrls
      ? (Array.isArray(videoUrls) ? videoUrls : [videoUrls]).filter(Boolean)
      : [];
    const team = await FunTeam.findOneAndUpdate(
      { _id: req.params.id, 'events._id': req.params.eventId },
      { $set: { 'events.$.title': title, 'events.$.description': description, 'events.$.date': date, 'events.$.images': images, 'events.$.videoUrls': videos } },
      { new: true }
    );
    if (!team) return res.status(404).json({ success: false, message: 'Event not found' });
    const event = team.events.id(req.params.eventId);
    res.json({ success: true, data: event });
  } catch (err) { next(err); }
};

exports.deleteEvent = async (req, res, next) => {
  try {
    const team = await FunTeam.findByIdAndUpdate(
      req.params.id,
      { $pull: { events: { _id: req.params.eventId } } },
      { new: true }
    );
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, message: 'Event deleted' });
  } catch (err) { next(err); }
};
