// Export all models for easy importing
const Integration = require('./Integration');
const Org = require('./Org');
const Repo = require('./Repo');
const Commit = require('./Commit');
const Pull = require('./Pull');
const Issue = require('./Issue');
const Release = require('./Release');
const GitUser = require('./GitUser');

module.exports = {
  Integration,
  Org,
  Repo,
  Commit,
  Pull,
  Issue,
  Release,
  GitUser
}; 