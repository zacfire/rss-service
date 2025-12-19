# RSS AI Digest Web Service - MVP 规划

## 项目目标

将现有 RSS AI Digest 命令行工具转化为网页服务，用户无需登录即可：
1. 上传 RSS 订阅源（OPML 或单链接）
2. 验证和管理订阅源
3. 设置推送时间和邮箱
4. 自动接收 AI 简报

---

## 用户流程

```
┌─────────────────────────────────────────────────────────┐
│  1. 上传 OPML 文件 / 添加 RSS 链接                        │
│                    ↓                                     │
│  2. 系统异步验证 RSS 有效性                               │
│                    ↓                                     │
│  3. 显示验证结果，用户管理 RSS（启用/禁用/删除）           │
│                    ↓                                     │
│  4. 填写邮箱 + 选择推送时间                               │
│                    ↓                                     │
│  5. 提交 → 完成配置                                       │
│                    ↓                                     │
│  6. 每天定时生成简报 → 发送到邮箱                          │
└─────────────────────────────────────────────────────────┘

修改配置：发送验证邮件 → 点击链接 → 修改
```

---

## 成本分析

### 单次运行成本（基于现有 Pipeline）

| 阶段 | API 调用 | 成本 |
|------|----------|------|
| Phase 1 Summary | N × OpenRouter (Gemini 2.5 Flash) | ~$0.0003/篇 |
| Phase 1 Embedding | N × Replicate (Qwen3-8B) | ~$0.00006/篇 |
| Phase 4 编辑 | 1 × OpenRouter | ~$0.002 |
| Phase 5 翻译 | 1 × OpenRouter | ~$0.003 |

**估算：30篇文章 ≈ $0.015/次**

### 月度成本（Per User）

| 用户类型 | RSS源 | 日均文章 | 月度API成本 |
|----------|-------|----------|-------------|
| 轻度 | 10-20 | 5篇 | ~$0.15 |
| 普通 | 30 | 15篇 | ~$0.30 |

### 基础设施（免费额度）

| 服务 | 免费额度 | 说明 |
|------|----------|------|
| Supabase | 500MB, 50K MAU | 足够 MVP |
| Vercel | 100GB 带宽 | 足够 MVP |
| Resend | 3000封/月 | 100用户×30天 |

---

## MVP 功能与限制

### 核心功能
- OPML 导入 / 单链接添加
- RSS 自动验证
- RSS 管理（启用/禁用/删除/搜索）
- 邮箱配置
- 推送时间选择
- 每日自动简报

### MVP 限制
| 限制项 | 值 |
|--------|-----|
| RSS 源数量 | ≤ 30 |
| 推送频率 | 每日 1 次 |
| 历史保留 | 7 天 |

---

## 技术栈

```
Frontend:   SvelteKit + TailwindCSS
Backend:    SvelteKit API Routes
Database:   Supabase (PostgreSQL)
Email:      Resend
Deploy:     Vercel
Pipeline:   复用现有 v7-rethink（TypeScript + Python）
```

---

## 已完成的开发

### 前端组件
- `src/routes/+page.svelte` - 主页面（步骤向导）
- `src/lib/components/FileUpload.svelte` - 文件上传组件
- `src/lib/components/FeedList.svelte` - RSS列表管理组件
- `src/lib/components/ConfigForm.svelte` - 配置表单组件

### API 路由
- `POST /api/import` - OPML 文件导入
- `POST /api/feeds/validate` - RSS 源验证
- `POST /api/subscribe` - 订阅提交

### 服务端模块
- `src/lib/server/opml-parser.ts` - OPML 解析器
- `src/lib/server/rss-validator.ts` - RSS 验证服务
- `src/lib/server/db.ts` - Supabase 数据库操作

### 数据库
- `supabase/migrations/001_initial.sql` - 数据库 Schema

---

## 待完成的开发

### 高优先级
1. [ ] 安装依赖并测试运行
2. [ ] 创建 Supabase 项目并配置
3. [ ] 连接数据库，完善订阅流程
4. [ ] 集成现有 Pipeline 生成简报
5. [ ] 实现邮件推送（Resend）

### 中优先级
6. [ ] 定时任务系统（Vercel Cron / Supabase Edge Functions）
7. [ ] 配置修改功能（邮件验证链接）
8. [ ] 简报历史查看

### 低优先级
9. [ ] Telegram 推送
10. [ ] 更好的错误处理和提示

---

## 运行说明

```bash
# 进入项目目录
cd web-service

# 安装依赖
npm install

# 复制环境变量
cp .env.example .env
# 编辑 .env 填入你的 Supabase 配置

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

---

## 后续迭代（付费版）

待 MVP 验证后再添加：
- 用户登录系统
- 更多 RSS 源配额
- 自定义作者优先级
- Telegram 推送
- 付费订阅（Stripe）

---

*创建时间: 2024-12-15*
*状态: MVP 开发中*
