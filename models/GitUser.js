const mongoose = require('mongoose');

// Schema for GitHub Users (store basic info of users related to the data)
const userSchema = new mongoose.Schema({
  userId: String,       // reference to integration.githubId (who fetched this data)
  githubId: Number,     // GitHub user ID of the profile stored
  login: String,
  name: String,
  avatarUrl: String,
  url: String
  // ... other fields like email if needed
});

const GitUser = mongoose.model('GitHubUser', userSchema, 'integrations/github-users');

module.exports = GitUser; 