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

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return '+86' + digits;
  if (digits.length === 13 && digits.startsWith('86')) return '+' + digits;
  if (String(raw || '').startsWith('+') && digits.length >= 11) return '+' + digits;
  throw new Error('请输入11位手机号');
}

function maskPhone(phone) {
  const p = phone || '';
  return p.length >= 7 ? p.slice(0, -8) + '****' + p.slice(-4) : p;
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

async function sendPhoneOtp(phone) {
  if (!isCloudEnabled()) throw new Error('云端未配置');
  const client = getSupabaseClient();
  if (!client) throw new Error('云端未配置');
  const normalized = normalizePhone(phone);
  const { error } = await withTimeout(
    client.auth.signInWithOtp({ phone: normalized }),
    CLOUD_TIMEOUT_MS,
    '云端连接超时'
  );
  if (error) throw error;
  localStorage.setItem('mj_pending_phone', normalized);
  return normalized;
}

async function verifyPhoneOtp(phone, code) {
  if (!isCloudEnabled()) throw new Error('云端未配置');
  const client = getSupabaseClient();
  if (!client) throw new Error('云端未配置');
  const normalized = normalizePhone(phone);
  const token = String(code || '').trim();
  if (!/^\d{6}$/.test(token)) throw new Error('请输入6位验证码');
  const { data, error } = await withTimeout(
    client.auth.verifyOtp({ phone: normalized, token, type: 'sms' }),
    CLOUD_TIMEOUT_MS,
    '云端连接超时'
  );
  if (error) throw error;
  if (!data.session) throw new Error('验证失败，请重新获取验证码');
  localStorage.setItem('mj_phone', normalized);
  localStorage.removeItem('mj_pending_phone');
  return data.session;
}

async function retryCloudSync() {
  if (await hasCloudSession()) {
    updateCloudStatus('syncing');
    await syncRecordsOnLogin();
    showToast('☁️ 云端已重新同步');
    return;
  }
  sessionStorage.removeItem('mj_logged_in');
  showLoginScreen();
  showToast('请重新验证手机号');
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
