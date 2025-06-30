const axios = require('axios');
const { Commit, Pull, Issue } = require('../models');
const SyncStatus = require('../models/SyncStatus');

/**
 * Bulk import forked repo data for a user using their GitHub access token.
 * @param {Object} params
 * @param {string} params.accessToken - GitHub OAuth access token
 * @param {string} params.userId - User's GitHub ID (string)
 */
async function bulkImportForkedRepos({ accessToken, userId }) {
  const githubApi = axios.create({
    baseURL: 'https://api.github.com',
    headers: {
      Authorization: `token ${accessToken}`,
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

  // Helper to robustly fetch all paginated results from a GitHub endpoint
  async function fetchPaginated(endpoint, maxItems) {
    let results = [];
    let page = 1;
    const perPage = 100;
    while (results.length < maxItems) {
      // Always add per_page and page params
      const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`;
      const res = await githubApi.get(url);
      if (!Array.isArray(res.data) || res.data.length === 0) break;
      results = results.concat(res.data);
      if (res.data.length < perPage) break;
      page++;
      // Add a small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    return results.slice(0, maxItems);
  }

  // Helper to get total number of issues (excluding PRs) for a repo
  async function getTotalIssues(owner, repo, githubApi) {
    const url = `/repos/${owner}/${repo}/issues?state=all&per_page=100&page=1`;
    const res = await githubApi.get(url);
    let total = 0;
    total += res.data.filter(issue => !issue.pull_request).length;
    const link = res.headers.link;
    if (link) {
      const lastMatch = link.match(/&page=(\d+)>; rel="last"/);
      if (lastMatch) {
        const lastPage = parseInt(lastMatch[1], 10);
        const lastRes = await githubApi.get(`/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${lastPage}`);
        const lastPageIssues = lastRes.data.filter(issue => !issue.pull_request).length;
        total = 100 * (lastPage - 1) + lastPageIssues;
      }
    }
    console.log(`[BulkImport]   Total issues for ${owner}/${repo}: ${total}`);
    return total;
  }

  const repos = await fetchAllForkedRepos();
  // Build a set of original repo full_names to avoid duplicates
  const processedRepos = new Set();
  let hadErrors = false;
  let allCommitsDone = true;
  let allPullsDone = true;
  let allIssuesDone = true;
  for (const repo of repos) {
    let originalFullName;
    if (repo.fork) {
      // Fetch full details to get parent
      try {
        const detailsRes = await githubApi.get(`/repos/${repo.full_name}`);
        const details = detailsRes.data;
        if (details.parent && details.parent.full_name) {
          originalFullName = details.parent.full_name;
          console.log(`[BulkImport] Forked repo: ${repo.full_name} -> Using parent: ${originalFullName}`);
        } else {
          originalFullName = repo.full_name;
          console.log(`[BulkImport] Forked repo: ${repo.full_name} but no parent found, using self`);
        }
      } catch (err) {
        originalFullName = repo.full_name;
        console.log(`[BulkImport] Error fetching parent for forked repo: ${repo.full_name}, using self. Error: ${err.message}`);
      }
    } else {
      originalFullName = repo.full_name;
      console.log(`[BulkImport] Original repo: ${repo.full_name}`);
    }
    if (processedRepos.has(originalFullName)) continue;
    processedRepos.add(originalFullName);
    console.log(`[BulkImport] Importing from original repo: ${originalFullName}`);
    // Log total issues before importing
    const [owner, repoName] = originalFullName.split('/');
    try {
      await getTotalIssues(owner, repoName, githubApi);
    } catch (err) {
      console.error(`[BulkImport]   Error fetching total issues for ${originalFullName}: ${err.message}`);
      hadErrors = true;
    }
    // COMMITS
    let commitsSuccess = true;
    try {
      const commits = await fetchPaginated(`/repos/${originalFullName}/commits`, 2000);
      const commitDocs = commits.map(c => ({
        userId,
        repoFullName: originalFullName,
        sha: c.sha,
        message: c.commit.message,
        authorName: c.commit.author?.name || '',
        authorLogin: c.author?.login || '',
        date: c.commit.author?.date ? new Date(c.commit.author.date) : null,
        url: c.html_url
      }));
      await Commit.insertMany(commitDocs, { ordered: false });
      console.log(`[BulkImport]   Inserted ${commitDocs.length} commits.`);
    } catch (err) {
      console.error(`[BulkImport]   Error importing commits for ${originalFullName}:`, err.message);
      hadErrors = true;
      commitsSuccess = false;
      allCommitsDone = false;
    }
    // PULL REQUESTS
    let pullsSuccess = true;
    try {
      const pulls = await fetchPaginated(`/repos/${originalFullName}/pulls?state=all`, 1000);
      console.log(`[BulkImport]   Found ${pulls.length} pull requests.`);
      const pullDocs = pulls.map(pr => ({
        userId,
        repoFullName: originalFullName,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        authorLogin: pr.user?.login || '',
        createdAt: pr.created_at ? new Date(pr.created_at) : null,
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        url: pr.html_url
      }));
      await Pull.insertMany(pullDocs, { ordered: false });
      console.log(`[BulkImport]   Inserted ${pullDocs.length} pull requests.`);
    } catch (err) {
      console.error(`[BulkImport]   Error importing pull requests for ${originalFullName}:`, err.message);
      hadErrors = true;
      pullsSuccess = false;
      allPullsDone = false;
    }
    // ISSUES
    let issuesSuccess = true;
    try {
      const issues = await fetchPaginated(`/repos/${originalFullName}/issues?state=all`, 500);
      // Exclude pull requests (issues API returns both)
      const filteredIssues = issues.filter(i => !i.pull_request);
      const issueDocs = filteredIssues.map(issue => ({
        userId,
        repoFullName: originalFullName,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        authorLogin: issue.user?.login || '',
        createdAt: issue.created_at ? new Date(issue.created_at) : null,
        closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
        url: issue.html_url
      }));
      await Issue.insertMany(issueDocs, { ordered: false });
      console.log(`[BulkImport]   Inserted ${issueDocs.length} issues.`);
    } catch (err) {
      console.error(`[BulkImport]   Error importing issues for ${originalFullName}:`, err.message);
      hadErrors = true;
      issuesSuccess = false;
      allIssuesDone = false;
    }
  }
  // Set entity sync status flags after all repos are processed
  await SyncStatus.findOneAndUpdate(
    { userId },
    {
      commits: allCommitsDone,
      pulls: allPullsDone,
      issues: allIssuesDone,
      lastUpdated: new Date()
    },
    { upsert: true }
  );
  console.log('[BulkImport] Done!');
  // Only set allSynced to true if there were no errors, and do it as the very last step
  if (!hadErrors) {
    await SyncStatus.findOneAndUpdate(
      { userId },
      { allSynced: true, lastUpdated: new Date() },
      { upsert: true }
    );
    console.log('[BulkImport] Sync status set to allSynced: true');
  } else {
    console.log('[BulkImport] Sync status NOT set to allSynced: true due to errors during import.');
  }
}

module.exports = { bulkImportForkedRepos }; 