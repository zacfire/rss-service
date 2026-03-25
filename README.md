# RSS AI Digest Web Service

将 [RSS AI Digest](https://github.com/zacfire/rss-ai-digest) 命令行工具转化为多用户网页服务。用户上传 RSS 源，系统每天自动生成 AI 简报并发送到邮箱。

## 架构概览

```
SvelteKit (前端 + API)
├── 订阅管理页面 (OPML 导入 / 单链接添加)
├── API Routes (订阅、验证、配置)
├── Cron Endpoint (/api/cron/generate-digest)
└── V7 Pipeline (Phase 0-5)
    ├── Phase 0: 异常标注（广告、重复、低频）
    ├── Phase 1: AI Summary + Embedding (OpenRouter)
    ├── Phase 2: HDBSCAN 语义聚类 (Python)
    ├── Phase 3: Priority Memo (P0/P1/P2/P3 分层)
    ├── Phase 4: LLM 编辑决策 (Gemini)
    └── Phase 5: 中文翻译 + HTML 渲染

GitHub Actions (定时触发)
├── 每天北京时间 06:00/07:00/08:00 执行
├── scripts/generate-digest.ts (查询订阅者 → 跑 Pipeline → 发邮件)
└── 失败时发送告警邮件

Supabase (数据库)
├── subscriptions (订阅配置 + 用户画像)
├── feeds (RSS 源列表)
└── digests (生成记录)

Resend (邮件发送)
```

## 开发命令

```bash
npm install                  # 安装 Node 依赖
pip install -r requirements.txt  # 安装 Python 依赖 (Phase 2)
npm run dev                  # 启动开发服务器
npm run build                # 生产构建
npm run check                # TypeScript 类型检查
```

## 生成简报

```bash
# 正常流程（GitHub Actions 自动触发）
# 手动本地测试（只发给指定邮箱，不影响其他用户）
npm run generate-digest -- 2026-03-25 08:00 --test-email user@example.com
```

## 环境变量

| 变量 | 用途 |
|------|------|
| `OPENROUTER_API_KEY` | Phase 1/4/5 的 AI 调用 |
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | Supabase Service Role Key |
| `RESEND_API_KEY` | 邮件发送 |

## 项目结构

```
web-service/
├── .github/workflows/daily-digest.yml   # 定时推送
├── scripts/generate-digest.ts           # 推送入口脚本
├── src/
│   ├── routes/                          # SvelteKit 页面 + API
│   │   ├── +page.svelte                 # 订阅管理页面
│   │   └── api/
│   │       ├── subscribe/               # 创建订阅
│   │       ├── feeds/validate/          # RSS 验证
│   │       ├── import/                  # OPML 导入
│   │       ├── config/                  # 订阅配置
│   │       └── cron/generate-digest/    # Cron 触发端点
│   └── lib/server/
│       ├── db.ts                        # Supabase 数据层
│       ├── email.ts                     # Resend 邮件
│       ├── pipeline.ts                  # Web 端简化版 Pipeline
│       ├── pipeline/                    # 完整 V7 Pipeline
│       │   ├── index.ts                 # Pipeline 入口
│       │   ├── phase0-anomaly-detection.ts
│       │   ├── phase1-ai-processing.ts  # Summary + Embedding
│       │   ├── phase2-semantic-clustering.ts  # HDBSCAN (Python)
│       │   ├── phase3-interest-layer.ts # Priority Memo
│       │   ├── phase4-digest-builder.ts # LLM 编辑
│       │   ├── phase5-generate-html.ts  # HTML 渲染
│       │   ├── types.ts
│       │   └── config/creator-config.ts # [死代码] 原始硬编码配置
│       ├── feed-analyzer.ts
│       ├── opml-parser.ts
│       └── rss-validator.ts
├── supabase/                            # 数据库 migrations
├── requirements.txt                     # Python 依赖
└── PROJECT-PLAN.md                      # 初始规划文档
```
