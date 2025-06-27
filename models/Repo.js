const mongoose = require('mongoose');

// Schema for GitHub Repository
const repoSchema = new mongoose.Schema({
  userId: String,           // reference to integration.githubId
  repoId: Number,           // GitHub repo ID
  name: String,
  fullName: String,         // e.g. orgName/repoName
  private: Boolean,
  htmlUrl: String,
  description: String,
  language: String,
  forksCount: Number,
  starsCount: Number,
  openIssuesCount: Number,
  // ... other repo fields as needed
});

const Repo = mongoose.model('GitHubRepo', repoSchema, 'integrations/github-repos');

module.exports = Repo; 