// Export all routes for easy importing
const authRoutes = require('./auth');
const githubRoutes = require('./github');

module.exports = {
  authRoutes,
  githubRoutes
}; 