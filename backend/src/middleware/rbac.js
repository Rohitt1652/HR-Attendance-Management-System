/**
 * Permission-based authorization middleware.
 * Usage: authorize('employees:view')  or  authorize('employees:create', 'employees:edit')
 * Passes if the user has ANY of the listed permissions.
 */
const authorize = (...perms) => (req, res, next) => {
  const userPerms = req.permissions || [];
  const hasAny = perms.some((p) => userPerms.includes(p));
  if (!hasAny) {
    return res.status(403).json({
      success: false,
      message: `Forbidden: requires permission "${perms[0]}"`,
    });
  }
  next();
};

module.exports = authorize;
