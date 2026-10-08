const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

exports.login = async (req, res, next) => {
  try {
    const { email, employeeId, password } = req.body;
    if (!password || (!email && !employeeId)) {
      return res.status(400).json({ success: false, message: 'Credentials required' });
    }
    const query = email ? { email: email.toLowerCase() } : { employeeId };
    const user = await User.findOne(query);
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (user.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Account is inactive. Contact HR.' });
    }
    const roleDoc = await Role.findOne({ name: user.role });
    const permissions = roleDoc?.permissions || [];
    const token = signToken(user._id);
    const { password: _pw, ...userData } = user.toObject();
    res.json({ success: true, data: { token, user: { ...userData, permissions } } });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }
    const user = await User.findById(req.user._id);
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

exports.adminResetPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: `Password reset for ${user.name}` });
  } catch (err) {
    next(err);
  }
};

exports.logout = (req, res) => {
  res.json({ success: true, message: 'Logged out' });
};

exports.getMe = (req, res) => {
  const userData = req.user.toObject ? req.user.toObject() : req.user;
  res.json({ success: true, data: { ...userData, permissions: req.permissions || [] } });
};
