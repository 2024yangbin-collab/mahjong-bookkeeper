/**
 * GitHub 云端同步（国内手机网络更稳定）
 */
const GITHUB_SYNC = {
  owner: '2024yangbin-collab',
  repo: 'mahjong-bookkeeper',
  branch: 'master',
  path: 'data/records.json'
};

function getGithubToken() {
  return localStorage.getItem('mj_github_token') || '';
}

function isGithubSyncEnabled() {
  return !!getGithubToken();
}

function saveGithubToken(token) {
  localStorage.setItem('mj_github_token', token.trim());
}

function toBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function githubApi(url, options) {
  const token = getGithubToken();
  if (!token) throw new Error('请先配置 GitHub Token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options && options.headers ? options.headers : {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || ('GitHub 请求失败 ' + res.status));
  }
  return res.json();
}

async function fetchGithubRecords() {
  const base = 'https://api.github.com/repos/' + GITHUB_SYNC.owner + '/' + GITHUB_SYNC.repo + '/contents/' + GITHUB_SYNC.path;
  try {
    const data = await githubApi(base + '?ref=' + GITHUB_SYNC.branch);
    const json = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))));
    return json.records || [];
  } catch (e) {
    if (/404|Not Found/i.test(e.message || '')) return [];
    throw e;
  }
}

async function uploadGithubRecords(list) {
  const base = 'https://api.github.com/repos/' + GITHUB_SYNC.owner + '/' + GITHUB_SYNC.repo + '/contents/' + GITHUB_SYNC.path;
  let sha = null;
  try {
    const existing = await githubApi(base + '?ref=' + GITHUB_SYNC.branch);
    sha = existing.sha;
  } catch (e) {
    if (!/404|Not Found/i.test(e.message || '')) throw e;
  }
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: list
  };
  await githubApi(base, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '麻将馆记账同步 ' + new Date().toLocaleString('zh-CN'),
      content: toBase64Utf8(JSON.stringify(payload, null, 2)),
      sha: sha,
      branch: GITHUB_SYNC.branch
    })
  });
}

async function testGithubConnection() {
  await fetchGithubRecords();
  return true;
}
