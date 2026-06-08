/**
 * 麻将馆记账本 - Supabase 云端同步
 */
let supabaseClient = null;
let cloudSyncReady = false;
const CLOUD_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message || '连接超时')), ms))
  ]);
}

function formatCloudError(e) {
  const msg = (e && (e.message || e.error_description || String(e))) || '未知错误';
  if (/fetch|network|timeout|超时|获取失败|Failed/i.test(msg)) return '网络不通';
  return msg;
}

function isCloudEnabled() {
  return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

async function hasCloudSession() {
  const client = getSupabaseClient();
  if (!client) return false;
  const { data: { session } } = await client.auth.getSession();
  return !!session;
}

function getSupabaseClient() {
  if (!isCloudEnabled()) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey
    );
  }
  return supabaseClient;
}

function accountToEmail(account) {
  return account.trim().toLowerCase() + '@mahjong-bookkeeper.app';
}

function fromCloudRecord(row) {
  return {
    id: row.client_id,
    date: row.date,
    type: row.type,
    category: row.category,
    amount: parseFloat(row.amount),
    note: row.note || '',
    createdAt: row.created_at || new Date().toISOString()
  };
}

function toCloudRecord(record, userId) {
  return {
    client_id: record.id,
    user_id: userId,
    date: record.date,
    type: record.type,
    category: record.category,
    amount: record.amount,
    note: record.note || '',
    created_at: record.createdAt || new Date().toISOString()
  };
}

async function fetchCloudRecords() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from('records')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromCloudRecord);
}

async function uploadRecordsToCloud(list) {
  const client = getSupabaseClient();
  if (!client || !list.length) return;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const rows = list.map(r => toCloudRecord(r, user.id));
  const { error } = await client
    .from('records')
    .upsert(rows, { onConflict: 'user_id,client_id' });
  if (error) throw error;
}

async function deleteCloudRecord(clientId) {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client
    .from('records')
    .delete()
    .eq('client_id', clientId);
  if (error) throw error;
}

async function syncCloudAuth(account, password) {
  if (!isCloudEnabled()) throw new Error('云端未配置');
  const client = getSupabaseClient();
  if (!client) throw new Error('云端未配置');
  const email = accountToEmail(account);
  let result = await withTimeout(
    client.auth.signInWithPassword({ email, password }),
    CLOUD_TIMEOUT_MS,
    '云端连接超时'
  );
  if (result.error) {
    const msg = result.error.message || '';
    if (/invalid login|invalid_credentials|密码|password/i.test(msg)) {
      result = await withTimeout(
        client.auth.signUp({ email, password }),
        CLOUD_TIMEOUT_MS,
        '云端连接超时'
      );
      if (result.error) {
        if (/already registered|already exists/i.test(result.error.message || '')) {
          throw new Error('云端密码不对，请在 Supabase 用户管理重置');
        }
        throw result.error;
      }
      if (!result.data.session) throw new Error('请在 Supabase 关闭邮箱验证后重试');
    } else {
      throw result.error;
    }
  }
  return true;
}

async function retryCloudSync(account, password) {
  updateCloudStatus('syncing');
  if (account && password) await syncCloudAuth(account, password);
  await syncRecordsOnLogin();
  showToast('☁️ 云端已重新同步');
}

async function cloudSignOut() {
  const client = getSupabaseClient();
  if (client) await client.auth.signOut();
  sessionStorage.removeItem('mj_logged_in');
  showLoginScreen();
}

async function syncRecordsOnLogin() {
  if (!isCloudEnabled()) {
    records = loadRecordsLocal();
    cloudSyncReady = true;
    updateCloudStatus('local');
    return;
  }
  try {
    const local = loadRecordsLocal();
    const cloud = await withTimeout(fetchCloudRecords(), CLOUD_TIMEOUT_MS, '云端连接超时');
    if (cloud === null) {
      records = local;
      cloudSyncReady = true;
      const hasSession = await hasCloudSession().catch(() => false);
      updateCloudStatus(hasSession ? 'synced' : 'error', hasSession ? '' : '未登录云端');
      return;
    }
    const merged = new Map();
    local.forEach(r => merged.set(r.id, r));
    cloud.forEach(r => merged.set(r.id, r));
    records = Array.from(merged.values());
    saveRecordsLocal(records);
    await uploadRecordsToCloud(records);
    cloudSyncReady = true;
    updateCloudStatus('synced');
  } catch (e) {
    console.error('云端同步失败:', e);
    records = loadRecordsLocal();
    cloudSyncReady = true;
    const hasSession = await hasCloudSession().catch(() => false);
    if (hasSession) {
      updateCloudStatus('error', formatCloudError(e));
    } else {
      updateCloudStatus('error', '未登录云端，请重新连接');
    }
  }
}

async function persistRecords(options = {}) {
  saveRecordsLocal(records);
  if (!isCloudEnabled() || !cloudSyncReady) return;
  try {
    if (options.deletedId) {
      await deleteCloudRecord(options.deletedId);
    } else if (options.record) {
      const client = getSupabaseClient();
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        const { error } = await client
          .from('records')
          .upsert(toCloudRecord(options.record, user.id), { onConflict: 'user_id,client_id' });
        if (error) throw error;
      }
    } else {
      await uploadRecordsToCloud(records);
    }
    updateCloudStatus('synced');
  } catch (e) {
    console.error('云端保存失败:', e);
    updateCloudStatus('error', formatCloudError(e));
  }
}

function saveAnonKey(key) {
  localStorage.setItem('mj_supabase_anon_key', key.trim());
  supabaseClient = null;
}

async function testCloudConnection() {
  const client = getSupabaseClient();
  if (!client) throw new Error('请先填写 API 密钥');
  const { error } = await client.from('records').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return true;
}

function updateCloudStatus(state, detail) {
  const el = document.getElementById('cloudStatus');
  if (!el) return;
  if (!isCloudEnabled()) {
    el.textContent = '💾 仅本地模式';
    el.style.color = '#999';
    return;
  }
  if (state === 'synced') {
    el.textContent = '☁️ 云端已同步';
    el.style.color = '#2e7d32';
  } else if (state === 'syncing') {
    el.textContent = '⏳ 同步中...';
    el.style.color = '#666';
  } else if (state === 'local') {
    el.textContent = detail ? '💾 本地模式（' + detail + '）' : '💾 本地模式';
    el.style.color = '#666';
  } else {
    el.textContent = '⚠️ 云端异常' + (detail ? '：' + detail : '');
    el.style.color = '#c62828';
  }
}
