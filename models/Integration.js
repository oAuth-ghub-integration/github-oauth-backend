const mongoose = require('mongoose');

// Schema for GitHub integration (stores user auth info)
const integrationSchema = new mongoose.Schema({
  githubId: { type: String, unique: true },   // GitHub user ID (as string)
  username: String,                          // GitHub username/login
  avatarUrl: String,                         // GitHub avatar (optional, for display)
  accessToken: String,                       // OAuth access token
  scope: String,                             // scopes granted
  lastSynced: Date                           // last data sync timestamp
});

const Integration = mongoose.model('GitHubIntegration', integrationSchema, 'integrations/github-integration');

module.exports = Integration; 