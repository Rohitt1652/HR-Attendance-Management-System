function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/(?:^|;\s*)portal_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

module.exports = { getTokenFromRequest };
