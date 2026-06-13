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

function mergeRecords(localList, remoteList, options = {}) {
  const deletedIds = Array.isArray(options.deletedIds) ? options.deletedIds : [];
  const deletedSet = new Set(deletedIds.filter(Boolean));
  const merged = new Map();
  (remoteList || []).forEach(r => {
    if (!deletedSet.has(r.id)) merged.set(r.id, r);
  });
  (localList || []).forEach(r => {
    if (!deletedSet.has(r.id)) merged.set(r.id, r);
  });
  return Array.from(merged.values());
}

function isShaConflictError(e) {
  const msg = (e && e.message) || '';
  return e.status === 409 || /does not match|sha|409|conflict/i.test(msg);
}

function contentsApiUrl() {
  return 'https://api.github.com/repos/' + GITHUB_SYNC.owner + '/' +
    GITHUB_SYNC.repo + '/contents/' + GITHUB_SYNC.path;
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
    const msg = err.message || ('GitHub 请求失败 ' + res.status);
    const error = new Error(msg);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function fetchGithubRecordsPublic() {
  const url = 'https://raw.githubusercontent.com/' + GITHUB_SYNC.owner + '/' +
    GITHUB_SYNC.repo + '/' + GITHUB_SYNC.branch + '/' + GITHUB_SYNC.path + '?t=' + Date.now();
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('读取云端数据失败 ' + res.status);
  const json = await res.json();
  return json.records || [];
}

async function fetchGithubFileMeta() {
  const base = contentsApiUrl();
  try {
    const data = await githubApi(base + '?ref=' + GITHUB_SYNC.branch + '&_=' + Date.now());
    const json = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))));
    return { records: json.records || [], sha: data.sha };
  } catch (e) {
    if (/404|Not Found/i.test(e.message || '')) return { records: [], sha: null };
    throw e;
  }
}

async function fetchGithubRecords() {
  if (!isGithubSyncEnabled()) {
    try {
      return await fetchGithubRecordsPublic();
    } catch (e) {
      return [];
    }
  }
  const meta = await fetchGithubFileMeta();
  return meta.records;
}

async function putGithubRecords(list, sha) {
  const base = contentsApiUrl();
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: list
  };
  const body = {
    message: '雀牌地图同步 ' + new Date().toLocaleString('zh-CN'),
    content: toBase64Utf8(JSON.stringify(payload, null, 2)),
    branch: GITHUB_SYNC.branch
  };
  if (sha) body.sha = sha;
  await githubApi(base, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function uploadGithubRecords(list, options = {}) {
  if (!isGithubSyncEnabled()) throw new Error('请先配置 GitHub Token');
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const { records: remote, sha } = await fetchGithubFileMeta();
      const merged = mergeRecords(list, remote, options);
      await putGithubRecords(merged, sha);
      localStorage.setItem('mj_last_github_sync', new Date().toISOString());
      return merged;
    } catch (e) {
      lastError = e;
      if (isShaConflictError(e) && attempt < 5) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

async function pullGithubRecords(localList) {
  const remote = await fetchGithubRecords();
  const merged = mergeRecords(localList, remote);
  localStorage.setItem('mj_last_github_sync', new Date().toISOString());
  return merged;
}

async function testGithubConnection() {
  await fetchGithubRecords();
  return true;
}
