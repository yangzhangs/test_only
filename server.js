const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function parseRepoUrl(repoUrl) {
  const match = repoUrl
    .trim()
    .match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git|\/)?$/i);

  if (!match) {
    throw new Error('Invalid repository URL. Use https://github.com/owner/repo');
  }

  return { owner: match[1], repo: match[2] };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function githubRequest(pathname, token, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      'User-Agent': 'flowforge-actions-studio',
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || `GitHub API error: ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function decodeBase64(content) {
  return Buffer.from(content, 'base64').toString('utf8');
}

function serveStatic(req, res) {
  const reqPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(reqPath).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (indexErr, indexData) => {
        if (indexErr) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexData);
      });
      return;
    }

    const ext = path.extname(filePath);
    const contentType =
      ext === '.css'
        ? 'text/css; charset=utf-8'
        : ext === '.js'
          ? 'application/javascript; charset=utf-8'
          : ext === '.json'
            ? 'application/json; charset=utf-8'
            : 'text/html; charset=utf-8';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function handleLoadWorkflows(req, res) {
  try {
    const { repoUrl, token } = await readBody(req);
    if (!repoUrl) return sendJson(res, 400, { error: 'repoUrl is required' });

    const { owner, repo } = parseRepoUrl(repoUrl);
    let workflowList;
    try {
      workflowList = await githubRequest(`/repos/${owner}/${repo}/contents/.github/workflows`, token);
    } catch (error) {
      if (error.status === 404) {
        return sendJson(res, 200, { owner, repo, hasActions: false, workflows: [] });
      }
      throw error;
    }

    const files = (Array.isArray(workflowList) ? workflowList : [workflowList]).filter(
      (item) => item.type === 'file' && /\.(ya?ml)$/i.test(item.name)
    );

    const workflows = [];
    for (const file of files) {
      const contentData = await githubRequest(`/repos/${owner}/${repo}/contents/${file.path}`, token);
      workflows.push({
        name: file.name,
        path: file.path,
        sha: file.sha,
        content: decodeBase64(contentData.content)
      });
    }

    return sendJson(res, 200, {
      owner,
      repo,
      hasActions: workflows.length > 0,
      workflows
    });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || 'Failed to load workflows' });
  }
}

async function handleSearchMarketplace(req, res) {
  try {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    const query = (parsed.searchParams.get('q') || '').trim();
    const token = (parsed.searchParams.get('token') || '').trim();
    const q = encodeURIComponent(`${query || 'ci'} topic:github-action`);
    const data = await githubRequest(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=12`, token);

    const actions = (data.items || []).map((item) => ({
      name: item.full_name,
      uses: `${item.full_name}@v1`,
      description: item.description || 'No description',
      stars: item.stargazers_count,
      url: item.html_url
    }));

    return sendJson(res, 200, { actions });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || 'Failed to search actions' });
  }
}

async function handleCreatePr(req, res) {
  try {
    const {
      repoUrl,
      token,
      workflowPath,
      workflowContent,
      branchName,
      commitMessage = 'chore: update GitHub Actions workflow via FlowForge Actions Studio',
      prTitle = 'Update GitHub Actions workflow',
      prBody = 'This PR updates workflow configuration using FlowForge Actions Studio.'
    } = await readBody(req);

    if (!repoUrl || !token || !workflowPath || !workflowContent) {
      return sendJson(res, 400, { error: 'repoUrl, token, workflowPath and workflowContent are required' });
    }

    const { owner, repo } = parseRepoUrl(repoUrl);
    const repoInfo = await githubRequest(`/repos/${owner}/${repo}`, token);
    const baseBranch = repoInfo.default_branch;
    const baseRef = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`, token);

    let finalBranch = (branchName || `flowforge-actions-update-${Date.now()}`).replace(/[^a-zA-Z0-9/_-]/g, '-');

    try {
      await githubRequest(`/repos/${owner}/${repo}/git/refs`, token, 'POST', {
        ref: `refs/heads/${finalBranch}`,
        sha: baseRef.object.sha
      });
    } catch (error) {
      if (error.status !== 422) throw error;
      finalBranch = `${finalBranch}-${Date.now()}`;
      await githubRequest(`/repos/${owner}/${repo}/git/refs`, token, 'POST', {
        ref: `refs/heads/${finalBranch}`,
        sha: baseRef.object.sha
      });
    }

    let existingSha;
    try {
      const existingFile = await githubRequest(
        `/repos/${owner}/${repo}/contents/${workflowPath}?ref=${encodeURIComponent(finalBranch)}`,
        token
      );
      existingSha = existingFile.sha;
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    await githubRequest(`/repos/${owner}/${repo}/contents/${workflowPath}`, token, 'PUT', {
      message: commitMessage,
      content: Buffer.from(workflowContent, 'utf8').toString('base64'),
      branch: finalBranch,
      ...(existingSha ? { sha: existingSha } : {})
    });

    const pr = await githubRequest(`/repos/${owner}/${repo}/pulls`, token, 'POST', {
      title: prTitle,
      body: prBody,
      head: finalBranch,
      base: baseBranch
    });

    return sendJson(res, 200, {
      message: 'Pull request created',
      prUrl: pr.html_url,
      branch: finalBranch
    });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || 'Failed to create PR' });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  const parsed = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && parsed.pathname === '/api/repo/workflows') {
    return handleLoadWorkflows(req, res);
  }

  if (req.method === 'GET' && parsed.pathname === '/api/marketplace/search-actions') {
    return handleSearchMarketplace(req, res);
  }

  if (req.method === 'POST' && parsed.pathname === '/api/repo/create-pr') {
    return handleCreatePr(req, res);
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`FlowForge Actions Studio running on http://localhost:${PORT}`);
});
