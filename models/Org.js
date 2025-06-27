const mongoose = require('mongoose');

// Schema for GitHub Organization
const orgSchema = new mongoose.Schema({
  userId: String,            // reference to integration.githubId
  orgId: Number,             // GitHub org ID
  login: String,             // org username
  name: String,              // display name
  description: String,
  url: String,
  reposCount: Number,
  membersCount: Number,
  // ... any other org fields you want
});

const Org = mongoose.model('GitHubOrg', orgSchema, 'integrations/github-organizations');

module.exports = Org; 