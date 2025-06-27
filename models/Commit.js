const mongoose = require('mongoose');

// Schema for GitHub Commit (storing minimal info for demo)
const commitSchema = new mongoose.Schema({
  userId: String,         // reference to integration.githubId
  repoFullName: String,   // e.g. orgName/repoName (to know which repo commit belongs to)
  sha: String,
  message: String,
  authorName: String,
  authorLogin: String,
  date: Date,
  url: String
});

const Commit = mongoose.model('GitHubCommit', commitSchema, 'integrations/github-commits');

module.exports = Commit; 