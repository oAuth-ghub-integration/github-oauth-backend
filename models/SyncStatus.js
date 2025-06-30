const mongoose = require('mongoose');

const syncStatusSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  users: { type: Boolean, default: false },
  organizations: { type: Boolean, default: false },
  repos: { type: Boolean, default: false },
  commits: { type: Boolean, default: false },
  pulls: { type: Boolean, default: false },
  issues: { type: Boolean, default: false },
  changelogs: { type: Boolean, default: false },
  allSynced: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SyncStatus', syncStatusSchema, 'sync-status'); 