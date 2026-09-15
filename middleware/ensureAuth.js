/**
 * Blocks a route unless the request has an authenticated session (FR-3).
 *
 * This file was empty on main. It's added here because the generate-plan
 * route needs it, and every other authenticated route will need the same
 * thing, this is the standard Passport session-based check, no project
 * specific decisions in it. Soumith, move it or adjust it if you'd
 * rather it live somewhere else.
 */
module.exports = function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: 'You need to be logged in to do that.' });
};