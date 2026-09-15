module.exports = function ensureAuthenticated(req, res, next) {
  if (typeof req.isAuthenticated === 'function' && req.isAuthenticated()) {
    return next();
  }

  // Change '/login' only if your existing project uses a different login route.
  return res.redirect('/login');
};
