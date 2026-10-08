const CalendarEvent = require('../models/CalendarEvent');

const ADMIN_ROLES = ['admin', 'hr', 'md'];
const hasPermission = (req, perm) => ADMIN_ROLES.includes(req.user?.role) || (req.permissions || []).includes(perm);
const isHoliday = (eventOrBody) => eventOrBody?.type === 'holiday';
const requiredPerm = (type, action) => type === 'holiday' ? `holidays:${action}` : `calendar:event:${action}`;

const canManageEvent = (req, eventOrBody, action) => {
  const perm = requiredPerm(eventOrBody?.type, action);
  return hasPermission(req, perm) || (eventOrBody?.type !== 'holiday' && hasPermission(req, 'calendar:manage'));
};

exports.getEvents = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const filter = { isActive: true };
    if (month && year) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const end = `${year}-${String(month).padStart(2, '0')}-31`;
      filter.date = { $gte: start, $lte: end };
    }
    if (!ADMIN_ROLES.includes(req.user.role)) {
      filter.$or = [
        { targetRoles: { $size: 0 } },
        { targetRoles: req.user.role },
      ];
    }
    const events = await CalendarEvent.find(filter)
      .populate('createdBy', 'name')
      .sort({ date: 1, startTime: 1 });
    res.json({ success: true, data: events });
  } catch (err) { next(err); }
};

exports.createEvent = async (req, res, next) => {
  try {
    if (!canManageEvent(req, req.body, 'create')) {
      return res.status(403).json({ success: false, message: `Forbidden: requires permission "${requiredPerm(req.body?.type, 'create')}"` });
    }
    const body = { ...req.body };
    if (isHoliday(body)) {
      body.isAllDay = true;
      body.color = body.color || '#ca8a04';
    }
    const event = await CalendarEvent.create({
      ...body,
      createdBy: req.user._id,
    });
    await event.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: event });
  } catch (err) { next(err); }
};

exports.updateEvent = async (req, res, next) => {
  try {
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    const effectiveType = req.body?.type || event.type;
    if (!canManageEvent(req, { type: effectiveType }, 'edit')) {
      return res.status(403).json({ success: false, message: `Forbidden: requires permission "${requiredPerm(effectiveType, 'edit')}"` });
    }
    Object.assign(event, req.body);
    if (event.type === 'holiday') {
      event.isAllDay = true;
      event.color = event.color || '#ca8a04';
    }
    await event.save();
    res.json({ success: true, data: event });
  } catch (err) { next(err); }
};

exports.deleteEvent = async (req, res, next) => {
  try {
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    if (!canManageEvent(req, event, 'delete')) {
      return res.status(403).json({ success: false, message: `Forbidden: requires permission "${requiredPerm(event.type, 'delete')}"` });
    }
    event.isActive = false;
    await event.save();
    res.json({ success: true });
  } catch (err) { next(err); }
};
