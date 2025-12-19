-- 添加 interests 字段到 subscriptions 表
-- 用于存储用户关注的人、事、话题，供 AI 处理时参考

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS interests TEXT;

-- 添加注释
COMMENT ON COLUMN subscriptions.interests IS '用户关注重点：关注的人、感兴趣的话题、特别关注的内容';
