-- 麻将馆记账本 - 数据库初始化 SQL
-- 在 Supabase SQL Editor 中粘贴并运行

-- 1. 记账记录表
CREATE TABLE IF NOT EXISTS records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 索引
CREATE INDEX IF NOT EXISTS idx_records_user_date ON records(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);

-- 3. RLS 安全策略：每人只能看自己的数据
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own records" ON records;
CREATE POLICY "Users can read own records" ON records
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own records" ON records;
CREATE POLICY "Users can insert own records" ON records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own records" ON records;
CREATE POLICY "Users can delete own records" ON records
  FOR DELETE USING (auth.uid() = user_id);

-- 4. 自动备份配置表
CREATE TABLE IF NOT EXISTS backup_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_backup_enabled BOOLEAN DEFAULT true,
  last_backup_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own backup config" ON backup_config;
CREATE POLICY "Users can read own backup config" ON backup_config
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own backup config" ON backup_config;
CREATE POLICY "Users can upsert own backup config" ON backup_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own backup config" ON backup_config;
CREATE POLICY "Users can update own backup config" ON backup_config
  FOR UPDATE USING (auth.uid() = user_id);
