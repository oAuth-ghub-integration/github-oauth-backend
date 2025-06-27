const mongoose = require('mongoose');

// Schema for Release (Changelog)
const releaseSchema = new mongoose.Schema({
  userId: String,
  repoFullName: String,
  releaseId: Number,
  tagName: String,
  name: String,          // release title
  body: String,          // description/changelog text
  createdAt: Date,
  publishedAt: Date,
  url: String
});

const Release = mongoose.model('GitHubRelease', releaseSchema, 'integrations/github-changelogs');

module.exports = Release; 