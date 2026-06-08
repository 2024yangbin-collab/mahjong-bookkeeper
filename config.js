// Supabase 云端配置
const SUPABASE_CONFIG = {
  url: 'https://isgistikhqqvuvjqooazw.supabase.co',
  get anonKey() {
    return localStorage.getItem('mj_supabase_anon_key') || 'sb_publishable_lxYmaeMZ2-RRMc2t75KSKg_0r4HBy1c';
  }
};

const SUPABASE_LINKS = {
  sql: 'https://supabase.com/dashboard/project/isgistikhqqvuvjqooazw/sql/new',
  api: 'https://supabase.com/dashboard/project/isgistikhqqvuvjqooazw/settings/api',
  auth: 'https://supabase.com/dashboard/project/isgistikhqqvuvjqooazw/auth/providers'
};

const SETUP_SQL = "﻿-- 麻将馆记账本 - 数据库初始化 SQL\n-- 在 Supabase SQL Editor 中粘贴并运行（只需运行一次）\n\n-- 1. 记账记录表\nCREATE TABLE IF NOT EXISTS records (\n  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  client_id TEXT NOT NULL,\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  date DATE NOT NULL,\n  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),\n  category TEXT NOT NULL,\n  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),\n  note TEXT DEFAULT '',\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(user_id, client_id)\n);\n\nALTER TABLE records ADD COLUMN IF NOT EXISTS client_id TEXT;\nCREATE UNIQUE INDEX IF NOT EXISTS idx_records_user_client ON records(user_id, client_id);\n\nCREATE INDEX IF NOT EXISTS idx_records_user_date ON records(user_id, date DESC);\nCREATE INDEX IF NOT EXISTS idx_records_date ON records(date);\n\nALTER TABLE records ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS \"Users can read own records\" ON records;\nCREATE POLICY \"Users can read own records\" ON records\n  FOR SELECT USING (auth.uid() = user_id);\n\nDROP POLICY IF EXISTS \"Users can insert own records\" ON records;\nCREATE POLICY \"Users can insert own records\" ON records\n  FOR INSERT WITH CHECK (auth.uid() = user_id);\n\nDROP POLICY IF EXISTS \"Users can update own records\" ON records;\nCREATE POLICY \"Users can update own records\" ON records\n  FOR UPDATE USING (auth.uid() = user_id);\n\nDROP POLICY IF EXISTS \"Users can delete own records\" ON records;\nCREATE POLICY \"Users can delete own records\" ON records\n  FOR DELETE USING (auth.uid() = user_id);\n\nCREATE TABLE IF NOT EXISTS backup_config (\n  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,\n  auto_backup_enabled BOOLEAN DEFAULT true,\n  last_backup_date DATE,\n  updated_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;\n\nDROP POLICY IF EXISTS \"Users can read own backup config\" ON backup_config;\nCREATE POLICY \"Users can read own backup config\" ON backup_config\n  FOR SELECT USING (auth.uid() = user_id);\n\nDROP POLICY IF EXISTS \"Users can upsert own backup config\" ON backup_config;\nCREATE POLICY \"Users can upsert own backup config\" ON backup_config\n  FOR INSERT WITH CHECK (auth.uid() = user_id);\n\nDROP POLICY IF EXISTS \"Users can update own backup config\" ON backup_config;\nCREATE POLICY \"Users can update own backup config\" ON backup_config\n  FOR UPDATE USING (auth.uid() = user_id);\r\n";

