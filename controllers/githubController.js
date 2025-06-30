const { Integration, Org, Repo, Commit, Pull, Issue, Release, GitUser } = require('../models');
const SyncStatus = require('../models/SyncStatus');

// Check integration status
const getStatus = async (req, res) => {
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
};

// Remove GitHub integration (disconnect)
const removeIntegration = async (req, res) => {
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
    await SyncStatus.deleteOne({ userId: githubId });
    // Destroy session
    req.session.destroy(err => {
      if (err) console.error("Session destroy error:", err);
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Error removing integration:", err);
    res.status(500).send("Failed to remove integration");
  }
};

// Generic route to get data by entity type
const getEntityData = async (req, res) => {
  const githubId = req.session.githubId;
  const entity = req.params.entity;
  const search = req.query.search;
  try {
    let model, sort = {};
    switch (entity) {
      case 'organizations':
        model = Org;
        sort = { name: 1 };
        break;
      case 'repos':
        model = Repo;
        sort = { name: 1 };
        break;
      case 'commits':
        model = Commit;
        sort = { date: -1 };
        break;
      case 'pulls':
        model = Pull;
        sort = { createdAt: -1 };
        break;
      case 'issues':
        model = Issue;
        sort = { createdAt: -1 };
        break;
      case 'changelogs':
        model = Release;
        sort = { publishedAt: -1 };
        break;
      case 'users':
        model = GitUser;
        sort = { login: 1 };
        break;
      default:
        return res.status(400).send("Unknown entity");
    }
    let query = { userId: githubId };
    if (search && search.trim().length > 0) {
      // Dynamically get all string field names except _id, __v, userId
      const allStringFields = Object.entries(model.schema.paths)
        .filter(([field, schemaType]) =>
          !['_id', '__v', 'userId'].includes(field) &&
          schemaType.instance === 'String'
        )
        .map(([field]) => field);
      const regex = new RegExp(search.trim(), 'i');
      query['$or'] = allStringFields.map(field => ({ [field]: regex }));
    }
    const result = await paginatedQuery(
      model,
      query,
      sort,
      req
    );
    res.json(result);
  } catch (err) {
    console.error("Error fetching data for", entity, err);
    res.status(500).send("Failed to fetch data");
  }
};

// Get user's GitHub integration info
const getProfile = async (req, res) => {
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
};

// Helper for paginated response
async function paginatedQuery(model, query, sort, req) {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [data, total] = await Promise.all([
    model.find(query).sort(sort).skip(skip).limit(parseInt(limit)),
    model.countDocuments(query)
  ]);
  return {
    data,
    page: parseInt(page),
    limit: parseInt(limit),
    total
  };
}

// Get commits for a specific repository
const getRepositoryCommits = async (req, res) => {
  try {
    const result = await paginatedQuery(
      Commit,
      { userId: req.session.githubId, repoFullName: req.params.repoFullName },
      { date: -1 },
      req
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching commits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get pull requests for a specific repository
const getRepositoryPulls = async (req, res) => {
  try {
    const result = await paginatedQuery(
      Pull,
      { userId: req.session.githubId, repoFullName: req.params.repoFullName },
      { createdAt: -1 },
      req
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching pull requests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get issues for a specific repository
const getRepositoryIssues = async (req, res) => {
  try {
    const result = await paginatedQuery(
      Issue,
      { userId: req.session.githubId, repoFullName: req.params.repoFullName },
      { createdAt: -1 },
      req
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get releases for a specific repository
const getRepositoryReleases = async (req, res) => {
  try {
    const result = await paginatedQuery(
      Release,
      { userId: req.session.githubId, repoFullName: req.params.repoFullName },
      { publishedAt: -1 },
      req
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching releases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all data for a user (summary)
const getSummary = async (req, res) => {
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
};

const getSyncStatus = async (req, res) => {
  console.log("getSyncStatus is working in githubController.js");
  const githubId = req.session.githubId;
  console.log("githubId in getSyncStatus", githubId);
  if (!githubId) return res.status(401).json({ error: 'Not authenticated' });
  const status = await SyncStatus.findOne({ userId: githubId });
  console.log("status in getSyncStatus", status);
  res.json(status || {});
};

// Get user's organizations
const getOrganizations = async (req, res) => {
  try {
    const result = await paginatedQuery(
      Org,
      { userId: req.session.githubId },
      { name: 1 },
      req
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get user's repositories
const getRepositories = async (req, res) => {
  try {
    const result = await paginatedQuery(
      Repo,
      { userId: req.session.githubId },
      { name: 1 },
      req
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get users for a specific repository
const getUsers = async (req, res) => {
  try {
    const result = await paginatedQuery(
      GitUser,
      { userId: req.session.githubId },
      { login: 1 },
      req
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
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
  getSummary,
  getSyncStatus,
  getUsers
}; 