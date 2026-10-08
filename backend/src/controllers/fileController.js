const path = require('path');
const fs = require('fs');
const { canAccessUploadPath } = require('../utils/accessControl');
const { fileUrlToAbsolutePath, UPLOADS_ROOT } = require('../utils/uploadPath');

function resolveUploadPath(relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absolutePath = path.resolve(UPLOADS_ROOT, normalized);
  if (!absolutePath.startsWith(UPLOADS_ROOT)) {
    return null;
  }
  return absolutePath;
}

exports.serveUpload = async (req, res, next) => {
  try {
    const relativePath = req.params[0];
    if (!relativePath) {
      return res.status(400).json({ success: false, message: 'File path required' });
    }

    const allowed = await canAccessUploadPath(req, relativePath);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const absolutePath = resolveUploadPath(relativePath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    res.sendFile(absolutePath);
  } catch (err) {
    next(err);
  }
};
