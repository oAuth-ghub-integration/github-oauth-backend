// githubBulkImport.js
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const {
  Commit,
  Pull,
  Issue,
  Repo
} = require('../models');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

if (!GITHUB_TOKEN || !MONGODB_URI) {
  console.error('Missing GITHUB_TOKEN or MONGODB_URI in .env');
  process.exit(1);
}

const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GitHubBulkImportScript'
  }
});

async function fetchAllForkedRepos() {
  let repos = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const res = await githubApi.get(`/user/repos?per_page=${perPage}&page=${page}&type=fork`);
    const pageRepos = res.data.filter(r => r.fork);
    repos = repos.concat(pageRepos);
    if (pageRepos.length < perPage) break;
    page++;
  }
  return repos;
}

async function fetchPaginated(endpoint, maxItems) {
  let results = [];
  let page = 1;
  const perPage = 100;
  while (results.length < maxItems) {
    const res = await githubApi.get(`${endpoint}?per_page=${perPage}&page=${page}`);
    if (!Array.isArray(res.data) || res.data.length === 0) break;
    results = results.concat(res.data);
    if (res.data.length < perPage) break;
    page++;
  }
  return results.slice(0, maxItems);
}

async function importRepoData(repo) {
  const repoFullName = repo.full_name;
  const userId = repo.owner.id.toString();
  console.log(`\nImporting for repo: ${repoFullName}`);

  // COMMITS
  try {
    const commits = await fetchPaginated(`/repos/${repoFullName}/commits`, 2000);
    const commitDocs = commits.map(c => ({
      userId,
      repoFullName,
      sha: c.sha,
      message: c.commit.message,
      authorName: c.commit.author?.name || '',
      authorLogin: c.author?.login || '',
      date: c.commit.author?.date ? new Date(c.commit.author.date) : null,
      url: c.html_url
    }));
    await Commit.insertMany(commitDocs, { ordered: false });
    console.log(`  Inserted ${commitDocs.length} commits.`);
  } catch (err) {
    console.error('  Error importing commits:', err.message);
  }

  // PULL REQUESTS
  try {
    const pulls = await fetchPaginated(`/repos/${repoFullName}/pulls?state=all`, 1000);
    const pullDocs = pulls.map(pr => ({
      userId,
      repoFullName,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      authorLogin: pr.user?.login || '',
      createdAt: pr.created_at ? new Date(pr.created_at) : null,
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      url: pr.html_url
    }));
    await Pull.insertMany(pullDocs, { ordered: false });
    console.log(`  Inserted ${pullDocs.length} pull requests.`);
  } catch (err) {
    console.error('  Error importing pull requests:', err.message);
  }

  // ISSUES
  try {
    const issues = await fetchPaginated(`/repos/${repoFullName}/issues?state=all`, 500);
    // Exclude pull requests (issues API returns both)
    const filteredIssues = issues.filter(i => !i.pull_request);
    const issueDocs = filteredIssues.map(issue => ({
      userId,
      repoFullName,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      authorLogin: issue.user?.login || '',
      createdAt: issue.created_at ? new Date(issue.created_at) : null,
      closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
      url: issue.html_url
    }));
    await Issue.insertMany(issueDocs, { ordered: false });
    console.log(`  Inserted ${issueDocs.length} issues.`);
  } catch (err) {
    console.error('  Error importing issues:', err.message);
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB.');
  const repos = await fetchAllForkedRepos();
  console.log(`Found ${repos.length} forked repos.`);
  for (const repo of repos) {
    await importRepoData(repo);
  }
  await mongoose.disconnect();
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
}); 