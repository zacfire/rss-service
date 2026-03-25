# CLAUDE.md

## 项目概述

RSS AI Digest Web Service — 多用户版 RSS AI 简报服务。从单用户 CLI 工具 (`/Users/zac/rss-ai-digest`) 改造而来，核心 Pipeline 逻辑复用，外层加了 Supabase 用户管理 + Resend 邮件推送。

## 技术栈

- **前端**: SvelteKit 5 + TailwindCSS
- **后端**: SvelteKit API Routes + Supabase (PostgreSQL)
- **Pipeline**: TypeScript (Phase 0/1/3/4/5) + Python (Phase 2 HDBSCAN)
- **AI**: OpenRouter (Gemini 2.5 Flash for summary, text-embedding-3-small for embedding, Gemini 2.0 Flash for editorial + translation)
- **邮件**: Resend
- **CI/CD**: GitHub Actions (daily-digest.yml)

## 常用命令

```bash
npm run dev                  # 开发服务器
npm run build                # 生产构建
npm run check                # TypeScript 类型检查
npm run generate-digest -- <date> <push_time> [--test-email <email>]
```

## 两套 Pipeline

项目中有**两套独立的 Pipeline**，容易混淆：

| | Web 端 | 脚本端 |
|---|---|---|
| 文件 | `src/lib/server/pipeline.ts` | `src/lib/server/pipeline/index.ts` |
| 调用方 | `routes/api/cron/generate-digest/+server.ts` | `scripts/generate-digest.ts` |
| 功能 | 简化版 MVP（RSS 抓取 + 分组展示，无 AI） | 完整 V7 Pipeline（6 阶段 AI 处理） |
| 用途 | Web 页面预览 | GitHub Actions 定时邮件推送 |

修改 Pipeline 逻辑时注意区分，两边的 bug 需要分别修。

## V7 Pipeline 各阶段

| Phase | 文件 | 功能 | 依赖 |
|-------|------|------|------|
| 0 | `phase0-anomaly-detection.ts` | 广告/重复/低频标注 | 无外部依赖 |
| 1 | `phase1-ai-processing.ts` | AI Summary + Embedding | OpenRouter API |
| 2 | `phase2-semantic-clustering.ts` | HDBSCAN 聚类 | Python subprocess |
| 3 | `phase3-interest-layer.ts` | Priority Memo (P0-P3) | userProfile 动态信任度 |
| 4 | `phase4-digest-builder.ts` | LLM 编辑决策 | OpenRouter API (Gemini) |
| 5 | `phase5-generate-html.ts` | 中文翻译 + HTML | OpenRouter API (Gemini) |

## 信任度系统

从原项目的硬编码 `creator-config.ts` 改为动态系统：

- **`userProfile.keyPublishers`**: 用户标记的关键发布者（authority → 信任度）
- **`userProfile.sourceWeights`**: 按 feed URL 的权重
- **`CREATOR_TRUST_THRESHOLD = 0.95`**: 达到此阈值进入 P0 池
- **P0 为空的 fallback**: Phase 4 prompt 指示 LLM 以多源共鸣 + 时效性为主要依据

### 已知问题

- `config/creator-config.ts` 是死代码（原项目遗留，未被 import），可删除
- 如果 `userProfile` 未设置或 `keyPublishers` 为空，所有文章信任度 ≤ 0.5，P0 永远为空
- Phase 2 的 `TOPIC_CATEGORIES` 仍是硬编码列表，但只影响聚类后的分类标签，不影响必读判断

## RSS 抓取注意事项

- **无 pubDate 的条目会被跳过**（避免 Paul Graham 等无日期 feed 每天灌入老文章）
- 脚本端 (`scripts/generate-digest.ts`) 和 Web 端 (`src/lib/server/pipeline.ts`) 的抓取逻辑独立，bug 需要两边各修
- 时间过滤：脚本端取最近 24h，Web 端取当天 00:00-23:59

## GitHub Actions

- Workflow: `.github/workflows/daily-digest.yml`
- Node.js 22 + Python 3.11
- 三个 cron 时段：UTC 22:00 / 23:00 / 00:00（对应北京 06:00 / 07:00 / 08:00）
- 脚本自动检测当前时段匹配哪个 push_time，手动触发时需指定 push_time
- `--test-email` 参数可安全测试单用户，不影响其他订阅者

## 修改 prompt 时的注意事项

- Phase 4 prompt 不要硬编码话题分类（如"科技与创新"）— 应让 LLM 从聚类结果推导
- Phase 4 fallback 用户描述不要带领域偏向 — 当前是"一位希望获取每日信息摘要的读者"
- Phase 3 editorial guidance 是给 LLM 的编排提示，修改时保持"有 P0 优先 P0，无 P0 走 fallback"的逻辑
- 必读优先级：用户兴趣 > 信任作者 > 时效 > 多源共鸣（原项目验证过的顺序，不要随意调整）

## 环境变量

| 变量 | 用途 | 在哪里配置 |
|------|------|-----------|
| `OPENROUTER_API_KEY` | AI 调用 | GitHub Secrets + 本地 |
| `SUPABASE_URL` | 数据库 | GitHub Secrets + 本地 |
| `SUPABASE_SERVICE_KEY` | 数据库 admin | GitHub Secrets + 本地 |
| `RESEND_API_KEY` | 邮件 | GitHub Secrets + 本地 |

## 与原项目的关系

原项目路径: `/Users/zac/rss-ai-digest`

- Pipeline 核心逻辑从原项目复制并适配多用户
- 原项目用 `creator-config.ts` 硬编码个人偏好，web-service 改为 `userProfile` 动态系统
- 原项目直接读本地文件，web-service 通过 Supabase 管理数据
- 原项目发 Telegram，web-service 发邮件 (Resend)
