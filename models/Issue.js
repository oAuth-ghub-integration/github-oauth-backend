const mongoose = require('mongoose');

// Schema for Issue
const issueSchema = new mongoose.Schema({
  userId: String,
  repoFullName: String,
  number: Number,
  title: String,
  state: String,
  authorLogin: String,
  createdAt: Date,
  closedAt: Date,
  url: String
});

const Issue = mongoose.model('GitHubIssue', issueSchema, 'integrations/github-issues');

module.exports = Issue; 