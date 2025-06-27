const mongoose = require('mongoose');

// Schema for Pull Request
const pullSchema = new mongoose.Schema({
  userId: String,
  repoFullName: String,
  number: Number,
  title: String,
  state: String,
  authorLogin: String,
  createdAt: Date,
  mergedAt: Date,
  url: String
});

const Pull = mongoose.model('GitHubPull', pullSchema, 'integrations/github-pulls');

module.exports = Pull; 