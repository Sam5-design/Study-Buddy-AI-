/**
 * Route guard (FR-3): blocks a route unless the user is logged in.
 *
 * - Logged in            -> carry on to the route.
 * - Browser page visit   -> send them to the login page.
 * - JavaScript / API call (e.g. fetch from the Generate Plan button)
 *                        -> reply with a 401 JSON message the page can show.
 */
module.exports = function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  const isPageVisit = req.method === 'GET' && req.accepts(['html', 'json']) === 'html';

  if (isPageVisit) {
    return res.redirect('/login');
  }

  return res.status(401).json({ message: 'You need to be logged in to do that.' });
};
