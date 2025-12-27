-- 添加 content 字段用于存储结构化简报内容
ALTER TABLE digests ADD COLUMN IF NOT EXISTS content JSONB;

-- 添加注释说明
COMMENT ON COLUMN digests.content IS '结构化简报内容，包含 must_read, topics, items_metadata 等';
COMMENT ON COLUMN digests.stats IS '统计信息，如处理时间、文章数量等';
