/**
 * V7-Rethink Phase 5: HTML生成
 *
 * 输入: DigestStructure (Phase 4 输出)
 * 输出: 最终 HTML 字符串
 */

import type {
  DigestStructure,
  ItemMetadata,
  PipelineConfig,
} from './types.js';

// ==================== 类型定义 ====================

interface DigestItem {
  title: string;
  link: string;
  publisher: string;
  summary: string;
  publishedAt: string;
  editorial_reason?: string;
  signals?: string[];
}

type TranslationMap = Map<string, string>;

// ==================== OpenRouter 翻译配置 ====================

const OPENROUTER_TRANSLATE_MODEL = 'google/gemini-2.0-flash-001';

async function translateTexts(texts: string[], apiKey: string): Promise<TranslationMap> {
  const unique = Array.from(
    new Set(texts.filter((t) => t && t.trim().length > 0)),
  );
  const translations: TranslationMap = new Map();

  if (unique.length === 0) {
    return translations;
  }

  const prompt = `
You are a translation assistant. For each string below, produce a fluent Simplified Chinese translation that preserves meaning, tone, entities, and technical terms. If the string is already Chinese, return it as-is. Keep the output factual and concise. Respond strictly with a JSON array of objects in the same order, with keys "original" and "translation".

Input strings (JSON array):
${JSON.stringify(unique)}
`.trim();

  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/rss-ai-digest',
          'X-Title': 'RSS AI Digest Translation',
        },
        body: JSON.stringify({
          model: OPENROUTER_TRANSLATE_MODEL,
          response_format: { type: 'json_object' as const },
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You translate text into fluent Simplified Chinese. Preserve meaning and accuracy. Return only JSON.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter 请求失败 (${response.status} ${response.statusText}): ${errorText}`,
      );
    }

    const result = (await response.json()) as Record<string, any>;
    const messageContent = result?.choices?.[0]?.message?.content;

    if (!messageContent || typeof messageContent !== 'string') {
      throw new Error('OpenRouter 响应缺少 message content');
    }

    const parsed = JSON.parse(messageContent) as Array<{
      original: string;
      translation: string;
    }>;

    parsed.forEach((entry) => {
      if (entry?.original) {
        translations.set(entry.original, entry.translation ?? entry.original);
      }
    });
  } catch (error: any) {
    console.error('⚠️ 翻译阶段出错，使用原文：', error?.message ?? error);
  }

  return translations;
}

// ==================== 工具函数 ====================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${month}月${day}日`;
}

function findItem(id: string, items: ItemMetadata[]): ItemMetadata {
  const found = items.find(item => item.fingerprint === id);
  if (!found) {
    throw new Error(`Item not found: ${id}`);
  }
  return found;
}

function renderHeader(dateStr: string, generatedAt: string): string {
  const formattedDate = formatDate(dateStr);

  return `
    <header>
      <h1>今日RSS简报 · ${formattedDate}</h1>
      <div class="meta">生成时间：${new Date(generatedAt).toLocaleString('zh-CN')}</div>
    </header>
  `;
}

function renderMustReadSection(
  items: DigestItem[],
  translations: TranslationMap,
): string {
  if (items.length === 0) return '';

  const list = items
    .map((item) => {
      const translatedTitle = translations.get(item.title) ?? item.title;
      const translatedSummary = translations.get(item.summary) ?? item.summary;
      const translatedReason = item.editorial_reason
        ? (translations.get(item.editorial_reason) ?? item.editorial_reason)
        : '';

      const combinedContent = translatedSummary + (translatedReason ? ` ${translatedReason}` : '');

      return `
        <li>
          <h3>
            <a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color: #2196f3; text-decoration: none;">${item.publisher} · ${translatedTitle}</a>
          </h3>
          ${combinedContent ? `<p class="summary">${combinedContent}</p>` : ''}
        </li>
      `;
    })
    .join('\n');

  return `
    <section class="section must-read">
      <h2>🔴 必读</h2>
      <ul>${list}</ul>
    </section>
  `;
}

function renderWorthWatchSection(
  items: DigestItem[],
  translations: TranslationMap,
): string {
  if (items.length === 0) return '';

  const list = items
    .map((item) => {
      const translatedTitle = translations.get(item.title) ?? item.title;
      const translatedReason = item.editorial_reason
        ? (translations.get(item.editorial_reason) ?? item.editorial_reason)
        : '';

      return `
        <li>
          <p class="summary-inline">
            <strong><a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color: #2196f3; text-decoration: none;">${translatedTitle} - ${item.publisher}</a></strong>
            ${translatedReason ? ` ${translatedReason}` : ''}
          </p>
        </li>
      `;
    })
    .join('\n');

  return `
    <section class="section worth-watch">
      <h2>🟡 值得关注</h2>
      <ul>${list}</ul>
    </section>
  `;
}

function renderNiceToKnowSection(
  items: DigestItem[],
  translations: TranslationMap,
): string {
  if (items.length === 0) return '';

  const list = items
    .map((item) => {
      const translatedTitle = translations.get(item.title) ?? item.title;

      return `
        <li>
          <a href="${item.link}" target="_blank" rel="noopener noreferrer">${translatedTitle} - ${item.publisher}</a>
        </li>
      `;
    })
    .join('\n');

  return `
    <section class="section nice-to-know">
      <h2>🟢 随便看看（${items.length}篇）</h2>
      <ul>${list}</ul>
    </section>
  `;
}

function renderEditorialNote(
  note: string,
  adjustmentNotes: string | undefined,
  translations: TranslationMap,
): string {
  if (!note) return '';
  const translatedNote = translations.get(note) ?? note;
  const translatedAdjustment = adjustmentNotes
    ? (translations.get(adjustmentNotes) ?? adjustmentNotes)
    : '';

  const showAdjustmentNotes = translatedAdjustment &&
    translatedAdjustment.trim() !== '' &&
    translatedAdjustment !== '无';

  return `
    <section class="editorial-note-section">
      <h2>💡 编辑手记</h2>
      <div class="editorial-note-content">
        <p>${translatedNote}</p>
        ${showAdjustmentNotes ? `
          <div class="adjustment-notes">
            <strong>📝 编辑说明：</strong>${translatedAdjustment}
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

function generateHTML(
  structure: DigestStructure,
  translations: TranslationMap,
): string {
  const { date, generated_at, digest_plan, items_metadata } = structure;

  const mustReadData: DigestItem[] = digest_plan.must_read.map(entry => {
    const item = findItem(entry.id, items_metadata);
    return {
      title: item.title,
      link: item.link,
      publisher: item.publisher,
      summary: item.summary,
      publishedAt: item.publishedAt,
      editorial_reason: entry.why,
      signals: entry.signals,
    };
  });

  const mustReadIds = new Set(digest_plan.must_read.map(entry => entry.id));

  const worthWatchItems: DigestItem[] = [];

  Object.entries(digest_plan.topics).forEach(([topicName, topicContent]) => {
    topicContent.priority_items.forEach(entry => {
      if (!mustReadIds.has(entry.id)) {
        const item = findItem(entry.id, items_metadata);
        worthWatchItems.push({
          title: item.title,
          link: item.link,
          publisher: item.publisher,
          summary: item.summary,
          publishedAt: item.publishedAt,
          editorial_reason: entry.why,
          signals: entry.signals,
        });
      }
    });
  });

  const niceToKnowItems: DigestItem[] = [];
  if (digest_plan.nice_to_have && digest_plan.nice_to_have.length > 0) {
    digest_plan.nice_to_have.forEach(id => {
      const item = findItem(id, items_metadata);
      niceToKnowItems.push({
        title: item.title,
        link: item.link,
        publisher: item.publisher,
        summary: item.summary,
        publishedAt: item.publishedAt,
      });
    });
  }

  const header = renderHeader(date, generated_at);
  const mustReadSection = renderMustReadSection(mustReadData, translations);
  const worthWatchSection = renderWorthWatchSection(worthWatchItems, translations);
  const niceToKnowSection = renderNiceToKnowSection(niceToKnowItems, translations);
  const editorialNote = renderEditorialNote(
    digest_plan.editorial_note,
    digest_plan.metadata.adjustment_notes,
    translations
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>今日RSS简报</title>
  <style>
    body {
      margin: 0;
      padding: 32px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
      background: #f5f7fb;
      color: #1f2937;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      padding: 36px;
    }
    header {
      margin-bottom: 24px;
    }
    header h1 {
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 6px 0;
    }
    header .meta {
      font-size: 13px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .section {
      margin-bottom: 28px;
    }
    .section h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 14px;
      color: #1f2937;
    }
    .section ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .section li {
      font-size: 14px;
      line-height: 1.5;
      color: #1f2937;
    }
    .section a {
      color: #2196f3;
      text-decoration: none;
      font-weight: 600;
    }
    .section a:hover {
      text-decoration: underline;
      color: #1976d2;
    }
    .summary-inline {
      color: #334155;
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 8px 0;
    }
    .must-read li h3 {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 8px 0;
    }
    .must-read li h3 a {
      color: #2196f3;
      text-decoration: none;
    }
    .must-read li h3 a:hover {
      text-decoration: underline;
      color: #1976d2;
    }
    .must-read .summary {
      margin: 8px 0;
      font-size: 14px;
      color: #334155;
      line-height: 1.6;
    }
    .summary-inline a,
    .summary-inline strong a {
      color: #2196f3;
      text-decoration: none;
    }
    .summary-inline a:hover,
    .summary-inline strong a:hover {
      text-decoration: underline;
      color: #1976d2;
    }
    .editorial-note-section {
      margin: 24px 0;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 8px;
      border-top: 1px solid #e2e8f0;
    }
    .editorial-note-section h2 {
      font-size: 18px;
      font-weight: 700;
      margin: 0 0 12px 0;
      color: #1f2937;
    }
    .editorial-note-content p {
      margin: 0 0 12px 0;
      font-size: 13px;
      color: #334155;
      line-height: 1.6;
    }
    .editorial-note-content p:last-child {
      margin-bottom: 0;
    }
    .adjustment-notes {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #d1d5db;
      font-size: 12px;
      color: #64748b;
    }
    footer {
      margin-top: 40px;
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
    }
    a:hover {
      color: #1976d2 !important;
      text-decoration: underline !important;
    }
  </style>
</head>
<body>
  <div class="container">
    ${header}
    ${editorialNote}
    ${mustReadSection}
    ${worthWatchSection}
    ${niceToKnowSection}
    <footer>
      本期共选择 ${digest_plan.metadata.total_selected} 篇文章 ·
      Must Read ${digest_plan.must_read.length} ·
      包含 ${digest_plan.metadata.trust_authors_in_must_read} 篇信任作者的重要更新
    </footer>
  </div>
</body>
</html>
`;
}

// ==================== 主函数 ====================

export interface Phase5Input {
  digestStructure: DigestStructure;
  config: PipelineConfig;
}

export interface Phase5Output {
  html: string;
  stats: {
    mustReadCount: number;
    worthWatchCount: number;
    niceToKnowCount: number;
    translatedTextsCount: number;
  };
}

export async function runPhase5(input: Phase5Input): Promise<Phase5Output> {
  console.log('📧 Phase 5: HTML 生成');

  const { digestStructure, config } = input;
  const { digest_plan, items_metadata } = digestStructure;

  console.log(`  必读: ${digest_plan.must_read.length} 条`);
  console.log(`  话题: ${digest_plan.metadata.topics_count} 个`);

  const textsToTranslate: string[] = [];

  // 收集需要翻译的文本
  digest_plan.must_read.forEach(entry => {
    const item = findItem(entry.id, items_metadata);
    textsToTranslate.push(item.title, item.summary, entry.why);
  });

  Object.values(digest_plan.topics).forEach(topic => {
    topic.priority_items.forEach(entry => {
      const item = findItem(entry.id, items_metadata);
      textsToTranslate.push(item.title, entry.why);
    });
  });

  if (digest_plan.nice_to_have && digest_plan.nice_to_have.length > 0) {
    digest_plan.nice_to_have.forEach(id => {
      const item = findItem(id, items_metadata);
      textsToTranslate.push(item.title);
    });
  }

  textsToTranslate.push(digest_plan.editorial_note);
  if (digest_plan.metadata.adjustment_notes) {
    textsToTranslate.push(digest_plan.metadata.adjustment_notes);
  }

  console.log(`  开始翻译 ${textsToTranslate.length} 条文本...`);
  const translations = await translateTexts(textsToTranslate, config.openrouterApiKey);
  console.log('  翻译完成');

  const html = generateHTML(digestStructure, translations);

  // 计算统计信息
  const mustReadIds = new Set(digest_plan.must_read.map(entry => entry.id));
  let worthWatchCount = 0;
  Object.values(digest_plan.topics).forEach(topic => {
    topic.priority_items.forEach(entry => {
      if (!mustReadIds.has(entry.id)) {
        worthWatchCount++;
      }
    });
  });

  console.log('✅ Phase 5 完成');

  return {
    html,
    stats: {
      mustReadCount: digest_plan.must_read.length,
      worthWatchCount,
      niceToKnowCount: digest_plan.nice_to_have?.length ?? 0,
      translatedTextsCount: translations.size,
    },
  };
}
