const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const { getTokenFromRequest } = require('../utils/token');

const authenticate = async (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    // Load permissions from Role collection
    const roleDoc = await Role.findOne({ name: user.role });
    req.user = user;
    req.permissions = roleDoc?.permissions || [];
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = authenticate;
