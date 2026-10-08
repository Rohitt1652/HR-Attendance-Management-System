const Settings = require('../models/Settings');

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await Settings.getGlobal();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const {
      officeStartTime, lateThreshold, fullDayRequiredHours, halfDayRequiredHours,
      saturdayRequiredHours, saturdayOffRule, customSaturdayOffs,
      weekendDays, shifts, inactivityTimeoutMinutes,
      companyName, companyTagline, companyLogo, companyFavicon, companyEmail,
      companyPhone, companyAddress, companyWebsite,
    } = req.body;
    const settings = await Settings.getGlobal();
    if (officeStartTime !== undefined) settings.officeStartTime = officeStartTime;
    if (lateThreshold !== undefined) settings.lateThreshold = lateThreshold;
    if (fullDayRequiredHours !== undefined) settings.fullDayRequiredHours = Number(fullDayRequiredHours) || 0;
    if (halfDayRequiredHours !== undefined) settings.halfDayRequiredHours = Number(halfDayRequiredHours) || 0;
    if (saturdayRequiredHours !== undefined) settings.saturdayRequiredHours = Number(saturdayRequiredHours) || 0;
    if (saturdayOffRule !== undefined) settings.saturdayOffRule = saturdayOffRule;
    if (customSaturdayOffs !== undefined) settings.customSaturdayOffs = Array.isArray(customSaturdayOffs) ? customSaturdayOffs.map(Number).filter(n => n >= 1 && n <= 5) : [];
    if (weekendDays !== undefined) settings.weekendDays = weekendDays;
    if (shifts !== undefined) settings.shifts = shifts;
    if (inactivityTimeoutMinutes !== undefined) settings.inactivityTimeoutMinutes = inactivityTimeoutMinutes;
    if (companyName !== undefined) settings.companyName = companyName;
    if (companyTagline !== undefined) settings.companyTagline = companyTagline;
    if (companyLogo !== undefined) settings.companyLogo = companyLogo;
    if (companyFavicon !== undefined) settings.companyFavicon = companyFavicon;
    if (companyEmail !== undefined) settings.companyEmail = companyEmail;
    if (companyPhone !== undefined) settings.companyPhone = companyPhone;
    if (companyAddress !== undefined) settings.companyAddress = companyAddress;
    if (companyWebsite !== undefined) settings.companyWebsite = companyWebsite;
    settings.updatedAt = new Date();
    await settings.save();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
};

exports.addHoliday = async (req, res, next) => {
  try {
    const { date, name } = req.body;
    if (!date || !name) return res.status(400).json({ success: false, message: 'date and name required' });
    const settings = await Settings.getGlobal();
    settings.holidays.push({ date: new Date(date), name });
    settings.updatedAt = new Date();
    await settings.save();
    res.status(201).json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
};

exports.removeHoliday = async (req, res, next) => {
  try {
    const settings = await Settings.getGlobal();
    const dateStr = req.params.date;
    settings.holidays = settings.holidays.filter(
      (h) => new Date(h.date).toISOString().slice(0, 10) !== dateStr
    );
    settings.updatedAt = new Date();
    await settings.save();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
};

// ── Department Management ─────────────────────────────────────────────────────

exports.getDepartments = async (req, res, next) => {
  try {
    // Read-only: return department names from Department collection (for dropdowns)
    const Department = require('../models/Department');
    const departments = await Department.find({ status: 'active' }).select('name').sort({ name: 1 });
    res.json({ success: true, data: departments.map(d => d.name) });
  } catch (err) { next(err); }
};

exports.addDepartment = async (req, res, next) => {
  try {
    const { name, teamLeaderId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Department name is required' });
    const settings = await Settings.getGlobal();
    const trimmed = name.trim();
    const exists = settings.departments.some(d => {
      const dName = typeof d === 'string' ? d : d.name;
      return dName.toLowerCase() === trimmed.toLowerCase();
    });
    if (exists) return res.status(409).json({ success: false, message: 'Department already exists' });
    settings.departments.push({ name: trimmed, teamLeaderId: teamLeaderId || null });
    settings.departments.sort((a, b) => (a.name || a).localeCompare(b.name || b));
    settings.updatedAt = new Date();
    await settings.save();
    res.status(201).json({ success: true, data: settings.departments });
  } catch (err) { next(err); }
};

exports.updateDepartment = async (req, res, next) => {
  try {
    const { oldName, newName, teamLeaderId } = req.body;
    if (!oldName) return res.status(400).json({ success: false, message: 'oldName is required' });
    const settings = await Settings.getGlobal();
    const idx = settings.departments.findIndex(d => {
      const dName = typeof d === 'string' ? d : d.name;
      return dName === oldName;
    });
    if (idx === -1) return res.status(404).json({ success: false, message: 'Department not found' });

    const finalName = (newName && newName.trim()) || oldName;
    if (finalName !== oldName) {
      const duplicate = settings.departments.some((d, i) => {
        if (i === idx) return false;
        const dName = typeof d === 'string' ? d : d.name;
        return dName.toLowerCase() === finalName.toLowerCase();
      });
      if (duplicate) return res.status(409).json({ success: false, message: 'Department name already exists' });
    }

    settings.departments[idx] = { name: finalName, teamLeaderId: teamLeaderId !== undefined ? teamLeaderId : (settings.departments[idx].teamLeaderId || null) };
    settings.departments.sort((a, b) => (a.name || a).localeCompare(b.name || b));
    settings.updatedAt = new Date();
    await settings.save();

    // Update employee department names if renamed
    if (finalName !== oldName) {
      const User = require('../models/User');
      await User.updateMany({ department: oldName }, { department: finalName });
    }

    // If teamLeaderId changed, update employees in this department
    if (teamLeaderId !== undefined) {
      const User = require('../models/User');
      if (teamLeaderId) {
        await User.updateMany({ department: finalName, role: 'employee' }, { teamLeadId: teamLeaderId });
      }
    }

    res.json({ success: true, data: settings.departments });
  } catch (err) { next(err); }
};

exports.removeDepartment = async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ success: false, message: 'Department name is required' });
    const settings = await Settings.getGlobal();
    settings.departments = settings.departments.filter(d => {
      const dName = typeof d === 'string' ? d : d.name;
      return dName !== name;
    });
    settings.updatedAt = new Date();
    await settings.save();
    res.json({ success: true, data: settings.departments });
  } catch (err) { next(err); }
};
