const Role = require('../models/Role');

exports.listRoles = async (req, res, next) => {
  try {
    const roles = await Role.find().sort({ name: 1 });
    res.json({ success: true, data: roles, allPermissions: Role.ALL_PERMISSIONS });
  } catch (err) {
    next(err);
  }
};

exports.getRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    res.json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
};

exports.createRole = async (req, res, next) => {
  try {
    const { name, label, permissions } = req.body;
    if (!name || !label) return res.status(400).json({ success: false, message: 'name and label required' });
    const role = await Role.create({ name: name.toLowerCase().replace(/\s+/g, '_'), label, permissions: permissions || [] });
    res.status(201).json({ success: true, data: role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Role name already exists' });
    next(err);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const { label, permissions } = req.body;
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (label) role.label = label;
    if (permissions !== undefined) role.permissions = permissions;
    role.updatedAt = new Date();
    await role.save();
    res.json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
};

exports.deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.isSystem) return res.status(403).json({ success: false, message: 'Cannot delete a system role' });
    await role.deleteOne();
    res.json({ success: true, message: 'Role deleted' });
  } catch (err) {
    next(err);
  }
};

// Sync permissions: accepts the full list from frontend and ensures admin/md have all of them
exports.syncPermissions = async (req, res, next) => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ success: false, message: 'permissions array required' });
    }

    // Find what's new compared to admin's current permissions
    const adminRole = await Role.findOne({ name: 'admin' });
    const currentAdminPerms = adminRole?.permissions || [];
    const newPerms = permissions.filter(p => !currentAdminPerms.includes(p));

    // Add all permissions to admin and md roles (they should have everything)
    if (newPerms.length > 0) {
      await Role.updateMany(
        { name: { $in: ['admin', 'md'] } },
        { $addToSet: { permissions: { $each: newPerms } }, $set: { updatedAt: new Date() } }
      );
      if (newPerms.includes('performance:manage_team')) {
        await Role.updateOne(
          { name: 'team_lead' },
          {
            $addToSet: { permissions: 'performance:manage_team' },
            $set: { updatedAt: new Date() },
          }
        );
      }
    }

    // Grant the new WFH permission once to its default manager roles. The
    // marker prevents later Sync operations from undoing an admin's removal.
    const wfhMigration = '2026-07-urgent-wfh-management';
    await Role.updateMany(
      { name: { $in: ['hr', 'team_lead'] }, appliedMigrations: { $ne: wfhMigration } },
      {
        $addToSet: {
          permissions: 'attendance:manage_wfh',
          appliedMigrations: wfhMigration,
        },
        $set: { updatedAt: new Date() },
      }
    );

    res.json({ 
      success: true, 
      message: newPerms.length > 0 ? `Synced ${newPerms.length} new permission(s)` : 'All permissions already synced',
      added: newPerms,
      total: permissions.length,
    });
  } catch (err) {
    next(err);
  }
};
