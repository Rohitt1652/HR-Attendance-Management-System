const path = require('path');

/** Always resolve to backend/uploads regardless of process cwd (FTP/PM2 safe). */
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

/** Turn stored fileUrl (/uploads/..., or full URL) into a safe absolute path. */
function fileUrlToAbsolutePath(fileUrl) {
  if (!fileUrl) return null;

  let relative = String(fileUrl).replace(/\\/g, '/').trim();
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    try {
      relative = new URL(relative).pathname;
    } catch {
      return null;
    }
  }

  relative = relative.replace(/^\/+/, '');
  if (relative.startsWith('uploads/')) {
    relative = relative.slice('uploads/'.length);
  }

  const normalized = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const absolutePath = path.resolve(UPLOADS_ROOT, normalized);
  if (!absolutePath.startsWith(UPLOADS_ROOT)) {
    return null;
  }
  return absolutePath;
}

function relativePathFromFileUrl(fileUrl) {
  const absolute = fileUrlToAbsolutePath(fileUrl);
  if (!absolute) return null;
  return path.relative(UPLOADS_ROOT, absolute).replace(/\\/g, '/');
}

module.exports = {
  UPLOADS_ROOT,
  fileUrlToAbsolutePath,
  relativePathFromFileUrl,
};
