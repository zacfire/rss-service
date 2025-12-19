-- RSS AI Digest Web Service - 初始数据库 Schema
-- 运行方式: 在 Supabase Dashboard 的 SQL Editor 中执行

-- 订阅配置表
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  push_time TIME DEFAULT '07:00:00',
  timezone TEXT DEFAULT 'Asia/Shanghai',
  interests TEXT, -- 用户关注重点：关注的人、感兴趣的话题、特别关注的内容
  is_active BOOLEAN DEFAULT true,
  verify_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RSS 订阅源表
CREATE TABLE IF NOT EXISTS feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  publisher TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'invalid')),
  error_message TEXT,
  is_enabled BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(subscription_id, url)
);

-- 简报历史表
CREATE TABLE IF NOT EXISTS digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  html_url TEXT,
  stats JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(subscription_id, date)
);

-- 推送日志表
CREATE TABLE IF NOT EXISTS push_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  digest_id UUID REFERENCES digests(id),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'telegram')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_feeds_subscription ON feeds(subscription_id);
CREATE INDEX IF NOT EXISTS idx_feeds_status ON feeds(status);
CREATE INDEX IF NOT EXISTS idx_digests_date ON digests(subscription_id, date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_push_time ON subscriptions(push_time) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON subscriptions(email);

-- Row Level Security (RLS)
-- 暂时关闭RLS以便后端直接访问
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE feeds DISABLE ROW LEVEL SECURITY;
ALTER TABLE digests DISABLE ROW LEVEL SECURITY;
ALTER TABLE push_logs DISABLE ROW LEVEL SECURITY;

-- 自动更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
