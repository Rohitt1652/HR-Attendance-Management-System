const Department = require('../models/Department');
const User = require('../models/User');

exports.listDepartments = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const departments = await Department.find(filter)
      .populate('teamLeaderId', 'name employeeId department designation profilePhotoUrl')
      .sort({ name: 1 });

    // Attach employee count per department
    const counts = await User.aggregate([
      { $match: { status: 'Active', department: { $ne: null } } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]));

    const result = departments.map(d => ({
      ...d.toObject(),
      teamLeader: d.teamLeaderId || null,
      employeeCount: countMap[d.name] || 0,
    }));

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.getDepartment = async (req, res, next) => {
  try {
    const dept = await Department.findById(req.params.id)
      .populate('teamLeaderId', 'name employeeId department designation profilePhotoUrl');
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    res.json({ success: true, data: dept });
  } catch (err) { next(err); }
};

exports.createDepartment = async (req, res, next) => {
  try {
    const { name, description, teamLeaderId, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Department name is required' });

    const dept = await Department.create({
      name: name.trim(),
      description: description || '',
      teamLeaderId: teamLeaderId || null,
      status: status || 'active',
    });

    res.status(201).json({ success: true, data: dept });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Department name already exists' });
    next(err);
  }
};

exports.updateDepartment = async (req, res, next) => {
  try {
    const { name, description, teamLeaderId, status } = req.body;
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });

    if (status !== undefined && status !== dept.status) {
      const canManageStatus = (req.permissions || []).some(p => ['departments:delete', 'departments:manage-status'].includes(p));
      if (!canManageStatus) {
        return res.status(403).json({ success: false, message: 'Forbidden: requires permission "departments:delete" or "departments:manage-status"' });
      }
    }

    const oldName = dept.name;
    if (name && name.trim()) dept.name = name.trim();
    if (description !== undefined) dept.description = description;
    if (teamLeaderId !== undefined) dept.teamLeaderId = teamLeaderId || null;
    if (status) dept.status = status;
    dept.updatedAt = new Date();
    await dept.save();

    // If department was renamed, update all employees' department string
    if (name && name.trim() !== oldName) {
      await User.updateMany({ department: oldName }, { department: dept.name });
    }

    // Do NOT bulk-update employee teamLeadId here.
    // Department.teamLeaderId is the source of truth.
    // Leave visibility uses Department.teamLeaderId directly.

    const populated = await Department.findById(dept._id)
      .populate('teamLeaderId', 'name employeeId department designation profilePhotoUrl');
    res.json({ success: true, data: populated });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Department name already exists' });
    next(err);
  }
};

exports.updateDepartmentStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or inactive' });
    }

    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });

    dept.status = status;
    dept.updatedAt = new Date();
    await dept.save();

    res.json({ success: true, message: status === 'active' ? 'Department activated' : 'Department deactivated', data: dept });
  } catch (err) { next(err); }
};

exports.deleteDepartment = async (req, res, next) => {
  try {
    const dept = await Department.findById(req.params.id);
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    // Soft delete
    dept.status = 'inactive';
    dept.updatedAt = new Date();
    await dept.save();
    res.json({ success: true, message: 'Department deactivated' });
  } catch (err) { next(err); }
};

// Get department names list (for dropdowns — lightweight)
exports.getDepartmentNames = async (req, res, next) => {
  try {
    const departments = await Department.find({ status: 'active' }).select('name').sort({ name: 1 });
    res.json({ success: true, data: departments.map(d => d.name) });
  } catch (err) { next(err); }
};
