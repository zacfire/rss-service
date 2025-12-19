/**
 * V7-Rethink Phase 2: 语义聚类 + Topic理解
 *
 * 1. 采样均匀化（max 3/publisher）
 * 2. 使用 HDBSCAN 聚类（Python 脚本）
 * 3. 计算信息熵（topic diversity）
 * 4. 生成主题标题 + 分类
 */

import { spawnSync } from 'child_process';
import { writeFile, readFile } from 'fs/promises';
import path from 'path';
import { OpenAI } from 'openai';
import type { ItemWithEmbedding, Cluster, HdbscanResult, PipelineConfig } from './types.js';

// ==================== 配置 ====================

const TOPIC_CATEGORIES = [
  'AI',
  'Tech Innovation',
  'Investment',
  'Creator Economy',
  'Business Strategy',
  'Policy & Regulation',
  'Research',
  'Society & Culture',
  'Productivity Tools',
  'Other',
] as const;

// ==================== 工具函数 ====================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function calculateSemanticConsistency(cluster: ItemWithEmbedding[]): number {
  if (cluster.length < 2) return 0;

  let totalSim = 0;
  let count = 0;

  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      totalSim += cosineSimilarity(cluster[i].summaryEmbedding, cluster[j].summaryEmbedding);
      count++;
    }
  }

  return count > 0 ? totalSim / count : 0;
}

function calculateTopicEntropy(cluster: ItemWithEmbedding[]): number {
  const publisherCounts = new Map<string, number>();

  for (const item of cluster) {
    const count = publisherCounts.get(item.source.publisher) || 0;
    publisherCounts.set(item.source.publisher, count + 1);
  }

  const total = cluster.length;
  let entropy = 0;

  for (const count of publisherCounts.values()) {
    const prob = count / total;
    entropy -= prob * Math.log2(prob);
  }

  const maxEntropy = Math.log2(publisherCounts.size);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

function normalizeCategory(raw: string | undefined): string {
  if (!raw) return 'Other';
  const cleaned = raw.trim();
  if (TOPIC_CATEGORIES.includes(cleaned as typeof TOPIC_CATEGORIES[number])) {
    return cleaned;
  }
  return 'Other';
}

function calculateConfidence(
  cluster: ItemWithEmbedding[],
  semanticConsistency: number,
  topicEntropy: number
): number {
  const consistencyScore = semanticConsistency * 0.25;
  const entropyScore = (1 - topicEntropy) * 0.1;

  let sizeScore = 0;
  if (cluster.length >= 2 && cluster.length <= 10) {
    sizeScore = 0.3;
  } else if (cluster.length > 10) {
    sizeScore = 0.3 * (10 / cluster.length);
  } else {
    sizeScore = 0.15;
  }

  const avgAuthority =
    cluster.reduce((sum, item) => sum + item.source.authority, 0) / cluster.length;
  const authorityScore = avgAuthority * 0.35;

  return consistencyScore + entropyScore + sizeScore + authorityScore;
}

// ==================== 主函数 ====================

export interface Phase2Input {
  items: ItemWithEmbedding[];
  config: PipelineConfig;
}

export interface Phase2Output {
  clusters: Cluster[];
  noiseItems: ItemWithEmbedding[];
  stats: {
    totalItems: number;
    sampledItems: number;
    clusters: number;
    coverage: number;
    avgClusterSize: number;
    categoryCounts: Record<string, number>;
    noiseItems: number;
  };
}

export async function runPhase2(input: Phase2Input): Promise<Phase2Output> {
  console.log('🔬 Phase 2: 语义聚类 + Topic理解');

  const { items, config } = input;
  const minClusterSize = 3;
  const metric = 'cosine';

  console.log(`  载入 ${items.length} 篇文章`);

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: config.openrouterApiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/rss-ai-digest',
      'X-Title': 'RSS AI Digest V7 Pipeline Phase 2',
    },
  });

  // 保存 embeddings 到临时文件供 Python 使用
  const tempInputPath = path.join(config.workDir, '03-items-with-embeddings.json');
  await writeFile(tempInputPath, JSON.stringify({ items }, null, 2));

  console.log(`  调用 HDBSCAN 聚类 (min_cluster_size=${minClusterSize}, metric=${metric})...`);

  // 调用 Python HDBSCAN 脚本
  const hdbscanResult = await invokeHdbscan(config.workDir, config.date, minClusterSize, metric);

  if (hdbscanResult.clusters.length === 0) {
    console.log('  ⚠️ HDBSCAN 未找到有效簇');
    return {
      clusters: [],
      noiseItems: hdbscanResult.noise_items,
      stats: {
        totalItems: items.length,
        sampledItems: hdbscanResult.stats.sampled_items,
        clusters: 0,
        coverage: 0,
        avgClusterSize: 0,
        categoryCounts: {},
        noiseItems: hdbscanResult.noise_items.length,
      },
    };
  }

  // 为每个 cluster 生成主题
  let clusterId = 1;
  const clusters: Cluster[] = [];

  for (const entry of hdbscanResult.clusters) {
    const clusterItems = entry.items;

    console.log(`  [${clusterId}/${hdbscanResult.clusters.length}] Cluster ${clusterId} (${clusterItems.length} 篇)`);

    const semanticConsistency = calculateSemanticConsistency(clusterItems);
    const topicEntropy = calculateTopicEntropy(clusterItems);
    const { theme, category, reasoning } = await generateTheme(clusterItems, openai);
    const confidence = calculateConfidence(clusterItems, semanticConsistency, topicEntropy);

    console.log(`    主题: ${theme}, 分类: ${category}, 置信度: ${(confidence * 100).toFixed(1)}%`);

    clusters.push({
      id: clusterId++,
      theme,
      category,
      reasoning,
      confidence,
      semantic_consistency: semanticConsistency,
      topic_entropy: topicEntropy,
      items: clusterItems,
      metadata: {
        size: clusterItems.length,
        avg_authority:
          clusterItems.reduce((sum, item) => sum + item.source.authority, 0) / clusterItems.length,
        publishers: [...new Set(clusterItems.map(item => item.source.publisher))],
      },
    });
  }

  clusters.sort((a, b) => b.confidence - a.confidence);

  const clusteredCount = clusters.reduce((sum, c) => sum + c.metadata.size, 0);
  const sampledCount = hdbscanResult.stats.sampled_items;
  const coverage = sampledCount > 0 ? clusteredCount / sampledCount : 0;
  const avgClusterSize = clusters.length > 0 ? clusteredCount / clusters.length : 0;

  const categoryCounts = clusters.reduce((map, cluster) => {
    map[cluster.category] = (map[cluster.category] || 0) + 1;
    return map;
  }, {} as Record<string, number>);

  console.log(`✅ Phase 2 完成`);
  console.log(`  有效簇: ${clusters.length} 个, 噪音: ${hdbscanResult.noise_items.length} 篇`);

  return {
    clusters,
    noiseItems: hdbscanResult.noise_items,
    stats: {
      totalItems: items.length,
      sampledItems: sampledCount,
      clusters: clusters.length,
      coverage,
      avgClusterSize,
      categoryCounts,
      noiseItems: hdbscanResult.noise_items.length,
    },
  };
}

async function invokeHdbscan(
  workDir: string,
  date: string,
  minClusterSize: number,
  metric: 'euclidean' | 'cosine'
): Promise<HdbscanResult> {
  const scriptPath = path.join(path.dirname(import.meta.url.replace('file://', '')), 'phase2-hdbscan.py');

  const result = spawnSync('python3', [scriptPath, workDir, date, String(minClusterSize), metric], {
    encoding: 'utf-8',
    cwd: workDir,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr || '';
    throw new Error(`HDBSCAN 脚本执行失败，退出码 ${result.status}\n${stderr}`);
  }

  let summary: { clusters: number; noise: number; sampled: number; output: string };
  try {
    summary = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`无法解析 HDBSCAN 输出: ${result.stdout}`);
  }

  console.log(`    HDBSCAN: clusters=${summary.clusters}, noise=${summary.noise}, sampled=${summary.sampled}`);

  const outputPath = path.isAbsolute(summary.output)
    ? summary.output
    : path.join(workDir, summary.output);

  const raw = await readFile(outputPath, 'utf-8');
  return JSON.parse(raw) as HdbscanResult;
}

async function generateTheme(
  cluster: ItemWithEmbedding[],
  openai: OpenAI
): Promise<{ theme: string; category: string; reasoning: string }> {
  const summaries = cluster.map((item, idx) => `${idx + 1}. ${item.aiSummary}`).join('\n');
  const categoryList = TOPIC_CATEGORIES.join(', ');

  const prompt = `You are an energetic newsletter editor. Analyze these article summaries and produce a short, reader-friendly theme.

${summaries}

Respond EXACTLY in this format (three lines):
HEADLINE: <3-6 word newsletter-style headline, no colons>
CATEGORY: <choose ONE explicit label from [${categoryList}]>
REASONING: <one sentence (15-25 words) explaining the common thread in plain language>

Guidelines:
- Prioritize concrete language over abstract jargon.
- Match the primary language of the summaries (prefer Chinese if the majority is Chinese).
- Do not add extra text or bullet points.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.35,
      max_tokens: 180,
    });

    const text = response.choices[0].message.content?.trim() || '';

    const headlineMatch = text.match(/HEADLINE:\s*(.+)/i);
    const categoryMatch = text.match(/CATEGORY:\s*(.+)/i);
    const reasoningMatch = text.match(/REASONING:\s*(.+)/i);

    const theme = headlineMatch ? headlineMatch[1].trim() : 'Daily Highlights';
    const category = normalizeCategory(categoryMatch ? categoryMatch[1] : undefined);
    const reasoning = reasoningMatch
      ? reasoningMatch[1].trim()
      : 'Articles share a related development worth noting.';

    return { theme, category, reasoning };
  } catch (error: any) {
    console.error(`    ❌ Theme generation failed: ${error.message}`);
    return {
      theme: 'Daily Highlights',
      category: 'Other',
      reasoning: 'Theme generation failed due to API error.',
    };
  }
}
