const express = require('express');
const {
  getStatus,
  removeIntegration,
  getEntityData,
  getProfile,
  getOrganizations,
  getRepositories,
  getRepositoryCommits,
  getRepositoryPulls,
  getRepositoryIssues,
  getRepositoryReleases,
  getSummary
} = require('../controllers/githubController');

const router = express.Router();

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.githubId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Check integration status
router.get('/status', getStatus);

// Remove GitHub integration (disconnect)
router.post('/remove', requireAuth, removeIntegration);

// Generic route to get data by entity type
router.get('/:entity', requireAuth, getEntityData);

// Get user's GitHub integration info
router.get('/profile', requireAuth, getProfile);

// Get user's organizations
router.get('/organizations', requireAuth, getOrganizations);

// Get user's repositories
router.get('/repositories', requireAuth, getRepositories);

// Get commits for a specific repository
router.get('/repositories/:repoFullName/commits', requireAuth, getRepositoryCommits);

// Get pull requests for a specific repository
router.get('/repositories/:repoFullName/pulls', requireAuth, getRepositoryPulls);

// Get issues for a specific repository
router.get('/repositories/:repoFullName/issues', requireAuth, getRepositoryIssues);

// Get releases for a specific repository
router.get('/repositories/:repoFullName/releases', requireAuth, getRepositoryReleases);

// Get all data for a user (summary)
router.get('/summary', requireAuth, getSummary);

module.exports = router; 