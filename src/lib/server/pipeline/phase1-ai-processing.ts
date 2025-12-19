/**
 * V7-Rethink Phase 1: AI处理
 *
 * 1. 为每篇文章生成AI Summary
 * 2. 生成Embedding（Qwen3-8B）
 * 3. 多语言处理
 */

import { OpenAI } from 'openai';
import Replicate from 'replicate';
import type { ValidItem, ItemWithEmbedding, Language, PipelineConfig } from './types.js';

// ==================== 工具函数 ====================

function detectLanguage(text: string): Language {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = text.length;
  const chineseRatio = chineseChars / totalChars;

  if (chineseRatio > 0.5) return 'zh';
  if (chineseRatio > 0.1) return 'mixed';
  return 'en';
}

function normalizeText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[^\w\s\u4e00-\u9fa5，。、：；！？]/g, ' ')
    .trim()
    .substring(0, 1000);
}

// ==================== 主函数 ====================

export interface Phase1Input {
  items: ValidItem[];
  config: PipelineConfig;
}

export interface Phase1Output {
  items: ItemWithEmbedding[];
  stats: {
    total: number;
    zhCount: number;
    enCount: number;
    mixedCount: number;
  };
}

export async function runPhase1(input: Phase1Input): Promise<Phase1Output> {
  console.log('🤖 Phase 1: AI处理');

  const { items, config } = input;
  console.log(`  载入 ${items.length} 篇文章`);

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: config.openrouterApiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/rss-ai-digest',
      'X-Title': 'RSS AI Digest V7 Pipeline',
    },
  });

  const replicate = new Replicate({ auth: config.replicateApiKey });

  const results: ItemWithEmbedding[] = [];
  const batchSize = 10;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));

    for (const item of batch) {
      try {
        // 1. 生成Summary
        const { summary, language } = await generateSummary(item, openai);

        // 2. 生成Embedding
        const embedding = await generateEmbedding(summary, replicate);

        results.push({
          ...item,
          aiSummary: summary,
          summaryEmbedding: embedding,
          language,
        });

        console.log(`  ✓ [${results.length}/${items.length}] ${item.title.substring(0, 50)}...`);

        // Rate limit
        await new Promise(r => setTimeout(r, 500));
      } catch (error: any) {
        console.error(`  ❌ 处理失败: ${item.title}`);
        console.error(`     ${error.message}`);

        // Fallback: 使用原始数据
        results.push({
          ...item,
          aiSummary: item.title,
          summaryEmbedding: [],
          language: detectLanguage(item.title + ' ' + item.description),
        });
      }
    }

    console.log(`  进度: ${Math.min(i + batchSize, items.length)}/${items.length}`);
  }

  const stats = {
    total: results.length,
    zhCount: results.filter(i => i.language === 'zh').length,
    enCount: results.filter(i => i.language === 'en').length,
    mixedCount: results.filter(i => i.language === 'mixed').length,
  };

  console.log(`✅ Phase 1 完成`);
  console.log(`  中文: ${stats.zhCount}篇, 英文: ${stats.enCount}篇, 混合: ${stats.mixedCount}篇`);

  return { items: results, stats };
}

async function generateSummary(
  item: ValidItem,
  openai: OpenAI,
  retries = 3
): Promise<{ summary: string; language: Language }> {
  const language = detectLanguage(item.title + ' ' + item.description);

  const prompt =
    language === 'zh'
      ? `用一句话（30-50字）总结这篇文章的核心内容。

标题: ${item.title}
描述: ${item.description}

要求:
- 聚焦主题 + 关键动作或更新
- 避免推测性或主观性语言
- 使用简洁的陈述句`
      : `Summarize this article into ONE concise sentence (30-50 words).

Title: ${item.title}
Description: ${item.description}

Requirements:
- Focus on: main topic + key action or update
- Avoid speculation or subjective tone
- Use clear, declarative statements`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 150,
      });

      const summary = response.choices[0].message.content?.trim() || '';

      if (summary.length > 0) {
        return { summary, language };
      }

      throw new Error('Empty summary generated');
    } catch (error: any) {
      if (attempt === retries) {
        return { summary: item.title, language };
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return { summary: item.title, language };
}

async function generateEmbedding(text: string, replicate: Replicate, retries = 3): Promise<number[]> {
  const normalizedText = normalizeText(text);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const output = (await replicate.run(
        'lucataco/qwen3-embedding-8b:42d968487820032a1535d81ea20df16f442ea308ec5abae6b5d6cf4675eb3e2f',
        { input: { text: normalizedText } }
      )) as { embedding_dim: number; embeddings: number[][] };

      if (output && output.embeddings && output.embeddings.length > 0) {
        return output.embeddings[0];
      }

      throw new Error('Invalid embedding output');
    } catch (error: any) {
      if (attempt === retries) {
        // Return empty array as fallback
        return [];
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return [];
}
