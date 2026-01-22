/**
 * V7-Rethink Phase 4: LLM-as-Editor Digest Builder
 *
 * 流程：
 * 1. 读取 Phase 3 生成的 priority memo
 * 2. 构建面向 LLM 的上下文提示
 * 3. 通过 OpenRouter 调用 Gemini 获取 Digest 编排方案
 * 4. 返回结构化的 DigestStructure
 */

import { randomUUID } from 'crypto';
import type {
  PriorityMemo,
  ItemSnapshot,
  DigestStructure,
  NewDigestPlan,
  PipelineConfig,
} from './types.js';

// ==================== 配置 ====================

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'google/gemini-2.0-flash-001';

// ==================== 工具函数 ====================

const truncate = (text: string, maxLength: number): string =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;

function buildLLMPrompt(memo: PriorityMemo, userInterests?: string | null): string {
  const items = memo.items;

  const highTrustItems = items.filter(i => i.annotations.trust_level === 'high');
  const multiSourceItems = items.filter(i => i.annotations.multi_source_signal !== null);
  const multiSourceTopics = [...new Set(
    multiSourceItems.map(i => i.annotations.multi_source_signal!.topic)
  )];
  const urgentItems = items.filter(i => i.annotations.urgency === 'urgent');

  // 构建用户背景部分 - 如果没有设置 interests，使用通用描述
  const userContextSection = userInterests
    ? `
=== 用户背景 ===
${userInterests}
`
    : `
=== 用户背景 ===
• 一位关注科技、创业和投资领域的读者
• 希望每日获取有价值的信息摘要
`;

  const systemPrompt = `
你是一位专业的 AI 编辑助理。
${userContextSection}
=== 今日 RSS 概况 ===
总文章数：${items.length} 篇

📌 高信任创作者更新（${highTrustItems.length} 篇）
这些是用户长期关注的独立思考者，他们的内容通常值得优先考虑：
${highTrustItems.slice(0, 10).map(i =>
    `• [${i.fingerprint.substring(0, 8)}] ${i.publisher}: "${truncate(i.title, 80)}"`
  ).join('\n')}
${highTrustItems.length > 10 ? `... 还有 ${highTrustItems.length - 10} 篇` : ''}

🔥 多源共鸣话题（${multiSourceTopics.length} 个）
多个独立来源都在讨论的话题：
${multiSourceTopics.slice(0, 5).map(t => `• ${t}`).join('\n')}
${multiSourceTopics.length > 5 ? `... 还有 ${multiSourceTopics.length - 5} 个` : ''}

⏰ 时效性强的内容（${urgentItems.length} 篇，发布 < 6 小时）

📊 系统建议的优先级参考：
• P0 池（高信任作者）: ${memo.pools.P0_creator_pool.length} 篇
• P1 池（多源热点）: ${memo.pools.P1_hot_topic_clusters.length} 个话题
• P2 池（单源系列）: ${memo.pools.P2_single_source_clusters.length} 个话题
• P3 池（其他内容）: ${memo.pools.P3_noise_items.length} 篇

=== 编辑任务 ===

1. **必读（3-5 篇）** - 今天最重要的文章

   判断标准（按优先级）：
   a. 对用户当前关注领域的直接价值

   b. 高信任创作者的重要观点
      - annotations.trust_level="high" 的文章通常应优先
      - 但不是强制的！如果今天他们的内容相对不那么关键，可以调整
      - 必须在 metadata.adjustment_notes 中解释调整理由

   c. 时效性和紧迫性
      - annotations.urgency="urgent" 的内容
      - 政策变化、市场突发事件

   d. 多源共鸣
      - annotations.multi_source_signal 存在
      - 说明多个独立来源都在关注

2. **话题聚焦（6-10 篇）** - 按话题组织

   请选择 6-10 篇有价值的文章，按话题组织。

   话题分类建议（可根据今天的内容灵活调整）：
   - 科技与创新
   - 投资与创业
   - 行业深度
   - 思维与方法论
   - 其他热点

   每个话题内：
   - 优先展示 trust_level="high" 的文章
   - 标注 multi_source_signal 的文章
   - 其他按相关性排序

   ⚠️ 重要：
   - 可以从任何 pool 选择内容（包括 P3 池）
   - 总共选择 6-10 篇（不要少于 6 篇，不要多于 10 篇）
   - 每个话题至少 1 篇，最多 3 篇
   - 如果某个话题只有 1 篇好文章，可以只选 1 篇

3. **仅供参考（可选，5-8 篇）** - 有趣但不够重要的内容

   如果有一些有趣但不够重要的内容，可以标注为"仅供参考"。

   标准：
   - 有一定价值，但不够重要放入必读或话题聚焦
   - 话题相对边缘，但可能是"隐藏宝石"
   - 可能对某些特定场景有用

   ⚠️ 限制：最多 8 篇，只需提供 fingerprint

4. **编辑洞察**
   用 2-3 段对话式文字写编辑手记：
   - 今日关键主题
   - 跨话题的联系
   - 值得警惕的信号
   - 意外的发现

=== 输出格式（JSON）===

{
  "must_read": [
    {
      "id": "fingerprint",
      "why": "为什么必读（1-2 句话，说明对用户的价值）",
      "signals": ["trust_author" | "multi_source" | "urgent" | "strategic"]
    }
  ],

  "topics": {
    "话题名（你自己决定，如：投资与创业）": {
      "priority_items": [
        {
          "id": "fingerprint",
          "why": "为什么优先（1 句话）",
          "signals": ["trust_author" | "multi_source" | "urgent"]
        }
      ],
      "other_items": []  // ⚠️ 必须为空数组，不要在这里放文章
    }
  },

  "nice_to_have": ["fingerprint1", "fingerprint2"],  // 可选，5-8 篇，仅 fingerprint

  "editorial_note": "对话式编辑手记（2-3 段，串联今日关键信息，给出判断和建议）",

  "metadata": {
    "total_selected": 15,
    "trust_authors_in_must_read": 2,
    "multi_source_in_must_read": 1,
    "topics_count": 4,
    "nice_to_have_count": 6,  // nice_to_have 数量
    "adjustment_notes": "如果降级了信任作者或提升了非信任作者，在这里解释原因"
  }
}

=== 核心原则 ===

✅ 用编辑判断力，不要机械执行标签
✅ trust_level="high" 通常优先，但不是绝对（可以根据今天的具体情况调整）
✅ 可以从 P3 池中选择有价值的内容（不要浪费这 ${memo.pools.P3_noise_items.length} 篇文章）
✅ 解释你的决策逻辑，保持透明
✅ 如果调整了信任作者的优先级，必须说明理由

❌ 不要捏造文章内容
❌ 不要遗漏明显关键的信息
❌ 不要机械地按 pool 分配（要灵活判断）

=== 今日文章详情 ===
${items.map(item => JSON.stringify({
    id: item.fingerprint,
    title: item.title,
    publisher: item.publisher,
    summary: item.summary?.substring(0, 150) || '',
    hours_old: item.hours_since_published,
    trust_level: item.annotations.trust_level,
    multi_source_topic: item.annotations.multi_source_signal?.topic || null,
    urgency: item.annotations.urgency,
    _system_pool: item.priority_buckets
  }, null, 2)).join(',\n')}

现在开始编辑今日简报。记住：用判断力，不要机械执行。如果某天 P2 池为空，从 P3 池中选择有价值的内容。
返回纯 JSON，不要 markdown 包裹，不要额外解释。
`.trim();

  return systemPrompt;
}

async function callLLM(prompt: string, apiKey: string): Promise<NewDigestPlan> {
  const systemMessage =
    'You are a precise editorial planner. Always respond with valid JSON that matches the requested schema, no explanations.';

  const payload = {
    model: OPENROUTER_MODEL,
    response_format: { type: 'json_object' as const },
    temperature: 0.3,
    max_output_tokens: 2000,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt },
    ],
  };

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/rss-ai-digest',
      'X-Title': 'RSS AI Digest Pipeline',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter 请求失败 (${response.status} ${response.statusText}): ${errorText}`,
    );
  }

  const result = (await response.json()) as Record<string, any>;
  const requestId: string | undefined = result?.id ?? result?.request_id;
  const rawContent = result?.choices?.[0]?.message?.content;

  const messageContent = Array.isArray(rawContent)
    ? rawContent.map((part: any) => part?.text ?? '').join('\n')
    : rawContent;

  if (!messageContent || typeof messageContent !== 'string') {
    throw new Error('OpenRouter 响应缺失有效的 message content。');
  }

  let plan: NewDigestPlan;
  try {
    plan = JSON.parse(messageContent) as NewDigestPlan;
  } catch (error: any) {
    throw new Error(`解析 LLM 返回 JSON 失败: ${error?.message ?? error}`);
  }

  if (
    !plan.must_read ||
    !plan.topics ||
    !plan.editorial_note ||
    !plan.metadata
  ) {
    throw new Error('LLM 返回的 NewDigestPlan 缺失关键字段。');
  }

  (plan as any).__openrouter_request_id = requestId;

  return plan;
}

function buildDigestStructure(
  memo: PriorityMemo,
  plan: NewDigestPlan
): DigestStructure {
  return {
    date: memo.date,
    generated_at: new Date().toISOString(),
    digest_plan: plan,
    items_metadata: memo.items.map(item => ({
      fingerprint: item.fingerprint,
      title: item.title,
      link: item.link,
      publisher: item.publisher,
      summary: item.summary,
      publishedAt: item.publishedAt,
      annotations: item.annotations,
      priority_buckets: item.priority_buckets,
      cluster_theme: item.cluster_theme,
      cluster_category: item.cluster_category,
    })),
    llm_trace: {
      prompt_id: randomUUID(),
      model: OPENROUTER_MODEL,
      request_id: (plan as any).__openrouter_request_id,
    },
  };
}

// ==================== 主函数 ====================

export interface Phase4Input {
  memo: PriorityMemo;
  config: PipelineConfig;
}

export interface Phase4Output {
  digestStructure: DigestStructure;
  stats: {
    mustReadCount: number;
    topicsCount: number;
    niceToHaveCount: number;
    totalSelected: number;
  };
}

export async function runPhase4(input: Phase4Input): Promise<Phase4Output> {
  console.log('🧠 Phase 4: LLM-as-Editor Digest Builder');

  const { memo, config } = input;

  console.log(`  载入 Priority Memo: ${memo.items.length} 篇文章`);

  const prompt = buildLLMPrompt(memo, config.userInterests);

  console.log('  调用 Gemini 2.0 Flash (OpenRouter)...');

  const plan = await callLLM(prompt, config.openrouterApiKey);

  console.log('✅ Phase 4 完成');
  console.log(`  必读: ${plan.must_read.length} 条`);
  console.log(`  话题: ${Object.keys(plan.topics).length} 个`);
  console.log(`  仅供参考: ${plan.nice_to_have?.length ?? 0} 条`);

  const digestStructure = buildDigestStructure(memo, plan);

  return {
    digestStructure,
    stats: {
      mustReadCount: plan.must_read.length,
      topicsCount: Object.keys(plan.topics).length,
      niceToHaveCount: plan.nice_to_have?.length ?? 0,
      totalSelected: plan.metadata.total_selected,
    },
  };
}
