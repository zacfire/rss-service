-- 启用 Row Level Security (RLS)
-- 注意：我们使用 service_role key 访问，所以只需启用 RLS 并添加简单策略

-- 启用 RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;

-- 因为我们只通过 service_role key 访问（绕过 RLS），
-- 所以不需要复杂的用户策略。
-- 添加一个简单的策略允许 service role 完全访问。

-- subscriptions 表策略
CREATE POLICY "Service role full access on subscriptions"
  ON subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- feeds 表策略
CREATE POLICY "Service role full access on feeds"
  ON feeds
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- digests 表策略
CREATE POLICY "Service role full access on digests"
  ON digests
  FOR ALL
  USING (true)
  WITH CHECK (true);
