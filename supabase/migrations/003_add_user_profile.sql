-- 添加 user_profile 字段用于存储用户画像
-- 包含 keyPublishers, sourceWeights, topics 等信息

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_profile JSONB;

-- 添加注释说明
COMMENT ON COLUMN subscriptions.user_profile IS '用户画像，包含 keyPublishers（关键发布者）、sourceWeights（源权重）、topics（兴趣主题）';
