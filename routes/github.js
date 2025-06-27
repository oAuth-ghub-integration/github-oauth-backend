const express = require('express');
const { Integration, Org, Repo, Commit, Pull, Issue, Release, GitUser } = require('../models');

const router = express.Router();

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.githubId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Check integration status
router.get('/status', async (req, res) => {
  const githubId = req.session.githubId;
  if (!githubId) {
    return res.json({ connected: false });
  }
  const integration = await Integration.findOne({ githubId });
  if (!integration) {
    return res.json({ connected: false });
  }
  res.json({
    connected: true,
    username: integration.username,
    lastSynced: integration.lastSynced
  });
});

// Remove GitHub integration (disconnect)
router.post('/remove', requireAuth, async (req, res) => {
  const githubId = req.session.githubId;
  try {
    // Remove integration entry and all related data
    await Integration.deleteOne({ githubId });
    await Org.deleteMany({ userId: githubId });
    await Repo.deleteMany({ userId: githubId });
    await Commit.deleteMany({ userId: githubId });
    await Pull.deleteMany({ userId: githubId });
    await Issue.deleteMany({ userId: githubId });
    await Release.deleteMany({ userId: githubId });
    await GitUser.deleteMany({ userId: githubId });
    // Destroy session
    req.session.destroy(err => {
      if (err) console.error("Session destroy error:", err);
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Error removing integration:", err);
    res.status(500).send("Failed to remove integration");
  }
});

// Generic route to get data by entity type
router.get('/:entity', requireAuth, async (req, res) => {
  const githubId = req.session.githubId;
  const entity = req.params.entity;
  try {
    let result;
    switch (entity) {
      case 'organizations':
        result = await Org.find({ userId: githubId });
        break;
      case 'repos':
        result = await Repo.find({ userId: githubId });
        break;
      case 'commits':
        result = await Commit.find({ userId: githubId });
        break;
      case 'pulls':
        result = await Pull.find({ userId: githubId });
        break;
      case 'issues':
        result = await Issue.find({ userId: githubId });
        break;
      case 'changelogs':
        result = await Release.find({ userId: githubId });
        break;
      case 'users':
        result = await GitUser.find({ userId: githubId });
        break;
      default:
        return res.status(400).send("Unknown entity");
    }
    res.json(result);
  } catch (err) {
    console.error("Error fetching data for", entity, err);
    res.status(500).send("Failed to fetch data");
  }
});

// Get user's GitHub integration info
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const integration = await Integration.findOne({ githubId: req.session.githubId });
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    
    res.json({
      githubId: integration.githubId,
      username: integration.username,
      avatarUrl: integration.avatarUrl,
      lastSynced: integration.lastSynced
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's organizations
router.get('/organizations', requireAuth, async (req, res) => {
  try {
    const orgs = await Org.find({ userId: req.session.githubId });
    res.json(orgs);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's repositories
router.get('/repositories', requireAuth, async (req, res) => {
  try {
    const repos = await Repo.find({ userId: req.session.githubId });
    res.json(repos);
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get commits for a specific repository
router.get('/repositories/:repoFullName/commits', requireAuth, async (req, res) => {
  try {
    const commits = await Commit.find({ 
      userId: req.session.githubId,
      repoFullName: req.params.repoFullName 
    }).sort({ date: -1 });
    
    res.json(commits);
  } catch (error) {
    console.error('Error fetching commits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pull requests for a specific repository
router.get('/repositories/:repoFullName/pulls', requireAuth, async (req, res) => {
  try {
    const pulls = await Pull.find({ 
      userId: req.session.githubId,
      repoFullName: req.params.repoFullName 
    }).sort({ createdAt: -1 });
    
    res.json(pulls);
  } catch (error) {
    console.error('Error fetching pull requests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get issues for a specific repository
router.get('/repositories/:repoFullName/issues', requireAuth, async (req, res) => {
  try {
    const issues = await Issue.find({ 
      userId: req.session.githubId,
      repoFullName: req.params.repoFullName 
    }).sort({ createdAt: -1 });
    
    res.json(issues);
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get releases for a specific repository
router.get('/repositories/:repoFullName/releases', requireAuth, async (req, res) => {
  try {
    const releases = await Release.find({ 
      userId: req.session.githubId,
      repoFullName: req.params.repoFullName 
    }).sort({ publishedAt: -1 });
    
    res.json(releases);
  } catch (error) {
    console.error('Error fetching releases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all data for a user (summary)
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const [orgs, repos, commits, pulls, issues, releases] = await Promise.all([
      Org.countDocuments({ userId: req.session.githubId }),
      Repo.countDocuments({ userId: req.session.githubId }),
      Commit.countDocuments({ userId: req.session.githubId }),
      Pull.countDocuments({ userId: req.session.githubId }),
      Issue.countDocuments({ userId: req.session.githubId }),
      Release.countDocuments({ userId: req.session.githubId })
    ]);

    res.json({
      organizations: orgs,
      repositories: repos,
      commits: commits,
      pullRequests: pulls,
      issues: issues,
      releases: releases
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 