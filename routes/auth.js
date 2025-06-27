const express = require('express');
const axios = require('axios');
const { Integration, GitUser, Org, Repo, Commit, Pull, Issue, Release } = require('../models');

const router = express.Router();

// Helper: Fetch and store GitHub data for the connected user
async function fetchAndStoreGitHubData(accessToken, userId, username) {
  // Common config for axios requests
  const authHeader = { Authorization: `token ${accessToken}` };

  try {
    // 1. Fetch Organizations
    const orgsRes = await axios.get('https://api.github.com/user/orgs', { headers: authHeader });
    const orgs = orgsRes.data;  // array of org objects
    // Store orgs in DB (clear old ones for this user first to avoid duplicates)
    await Org.deleteMany({ userId });
    for (let org of orgs) {
      await Org.create({
        userId,
        orgId: org.id,
        login: org.login,
        name: org.name || org.login,
        description: org.description || "",
        url: org.html_url,
        reposCount: org.public_repos,    // number of public repos (private count not in this response)
        membersCount: org.members_count || 0  // members_count might not be in this response without an org-specific API call
      });
    }

    // 2. Fetch Repositories (all accessible to user)
    let repos = [];
    let page = 1;
    const perPage = 100;
    // Use /user/repos with pagination to get all repos (public and private accessible to the user)
    while (true) {
      const repoRes = await axios.get(`https://api.github.com/user/repos?per_page=${perPage}&page=${page}`, { headers: authHeader });
      const repoPage = repoRes.data;
      if (repoPage.length === 0) break;
      repos = repos.concat(repoPage);
      if (repoPage.length < perPage) break;  // no more pages if we got less than perPage
      page++;
    }
    // Store repos in DB
    await Repo.deleteMany({ userId });
    for (let repo of repos) {
      await Repo.create({
        userId,
        repoId: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        htmlUrl: repo.html_url,
        description: repo.description || "",
        language: repo.language,
        forksCount: repo.forks_count,
        starsCount: repo.stargazers_count,
        openIssuesCount: repo.open_issues_count
      });
    }

    // 3. Fetch Commits, Pulls, Issues, Releases for each repository
    // First, clear old data in those collections for this user
    await Commit.deleteMany({ userId });
    await Pull.deleteMany({ userId });
    await Issue.deleteMany({ userId });
    await Release.deleteMany({ userId });

    for (let repo of repos) {
      const [owner, repoName] = repo.full_name.split('/');
      const repoFullName = repo.full_name;
      // 3a. Commits
      page = 1;
      const commitsPerPage = 100;
      while (true) {
        const commitsRes = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/commits?per_page=${commitsPerPage}&page=${page}`, { headers: authHeader });
        const commitPage = commitsRes.data;
        if (commitPage.length === 0) break;
        // Store each commit
        for (let commitData of commitPage) {
          await Commit.create({
            userId,
            repoFullName: repoFullName,
            sha: commitData.sha,
            message: commitData.commit.message,
            authorName: commitData.commit.author.name,
            authorLogin: commitData.author ? commitData.author.login : "",  // commit.author is the GitHub user (null if author not on GitHub)
            date: commitData.commit.author.date,
            url: commitData.html_url
          });
        }
        if (commitPage.length < commitsPerPage) break;
        page++;
      }

      // 3b. Pull Requests (state=all to get open & closed)
      page = 1;
      const pullsPerPage = 100;
      while (true) {
        const pullsRes = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/pulls?state=all&per_page=${pullsPerPage}&page=${page}`, { headers: authHeader });
        const pullPage = pullsRes.data;
        if (pullPage.length === 0) break;
        for (let pr of pullPage) {
          await Pull.create({
            userId,
            repoFullName: repoFullName,
            number: pr.number,
            title: pr.title,
            state: pr.state,
            authorLogin: pr.user.login,
            createdAt: pr.created_at,
            mergedAt: pr.merged_at,
            url: pr.html_url
          });
        }
        if (pullPage.length < pullsPerPage) break;
        page++;
      }

      // 3c. Issues (state=all)
      page = 1;
      const issuesPerPage = 100;
      while (true) {
        const issuesRes = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/issues?state=all&per_page=${issuesPerPage}&page=${page}`, { headers: authHeader });
        const issuePage = issuesRes.data;
        if (issuePage.length === 0) break;
        for (let issue of issuePage) {
          // Skip pull requests in the issues list to avoid duplicates (issues API returns PRs too)
          if (issue.pull_request) continue;
          await Issue.create({
            userId,
            repoFullName: repoFullName,
            number: issue.number,
            title: issue.title,
            state: issue.state,
            authorLogin: issue.user.login,
            createdAt: issue.created_at,
            closedAt: issue.closed_at,
            url: issue.html_url
          });
        }
        if (issuePage.length < issuesPerPage) break;
        page++;
      }

      // 3d. Releases (Changelogs)
      page = 1;
      const relPerPage = 50;
      while (true) {
        const relRes = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/releases?per_page=${relPerPage}&page=${page}`, { headers: authHeader });
        const relPage = relRes.data;
        if (relPage.length === 0) break;
        for (let rel of relPage) {
          await Release.create({
            userId,
            repoFullName: repoFullName,
            releaseId: rel.id,
            tagName: rel.tag_name,
            name: rel.name,
            body: rel.body || "",
            createdAt: rel.created_at,
            publishedAt: rel.published_at,
            url: rel.html_url
          });
        }
        if (relPage.length < relPerPage) break;
        page++;
      }

      // (Optional) fetch and store repository contributors or org members to 'GitHubUser' if desired.
      // For brevity, we won't fetch all org members or contributors, but this could be done similarly with GitHub APIs:
      // e.g., GET /repos/{owner}/{repo}/contributors for contributors list.
    }

    console.log(`Data sync complete for GitHub user ${username} (${userId})`);
  } catch (err) {
    console.error("Error fetching GitHub data:", err);
    // In a real app, handle errors (e.g., rate limit reached) accordingly.
  }
}

// OAuth Redirect Route
router.get('/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = 'http://localhost:3000/auth/github/callback';
  const scope = ['repo', 'read:org', 'read:user'].join(' ');  // scopes we need
  
  // GitHub OAuth authorize URL
  const githubAuthUrl = 
    `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  
  res.redirect(githubAuthUrl);
});

// OAuth Callback Route
router.get('/github/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send("Missing code parameter");
  }
  
  try {
    // Exchange the code for an access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code
      },
      { headers: { Accept: 'application/json' } }
    );
    
    const accessToken = tokenResponse.data.access_token;
    const scope = tokenResponse.data.scope;
    // Note: GitHub OAuth tokens for apps typically don't come with refresh_token in this flow

    if (!accessToken) {
      return res.status(500).send("Failed to obtain access token");
    }

    // Fetch user info from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}` }
    });
    const ghUser = userResponse.data;
    /* ghUser will contain fields like: id, login, avatar_url, name, email, etc. */

    // Upsert integration info in database (insert if new user, update if re-connecting)
    const githubIdStr = String(ghUser.id);
    const integrationData = {
      githubId: githubIdStr,
      username: ghUser.login,
      avatarUrl: ghUser.avatar_url,
      accessToken: accessToken,
      scope: scope,
      lastSynced: new Date()
    };
    
    await Integration.findOneAndUpdate(
      { githubId: githubIdStr }, 
      integrationData, 
      { upsert: true, new: true }
    );

    // Save the user profile in 'GitHubUser' collection as well (for completeness)
    await GitUser.findOneAndUpdate(
      { userId: githubIdStr, githubId: ghUser.id },
      {
        userId: githubIdStr,
        githubId: ghUser.id,
        login: ghUser.login,
        name: ghUser.name,
        avatarUrl: ghUser.avatar_url,
        url: ghUser.html_url
      },
      { upsert: true }
    );

    // Set session to mark user as logged in
    req.session.githubId = githubIdStr;

    // **Fetch GitHub Data (orgs, repos, commits, pulls, issues, releases)**
    // We perform data fetching after obtaining the token.
    await fetchAndStoreGitHubData(accessToken, githubIdStr, ghUser.login);

    // Redirect to frontend (assuming frontend is running on 4200).
    res.redirect('http://localhost:4200/');
  } catch (err) {
    console.error("Error in OAuth callback:", err);
    res.status(500).send("Authentication failed");
  }
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Error logging out');
    }
    res.redirect('http://localhost:4200/');
  });
});

module.exports = router; 