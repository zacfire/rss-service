/**
 * V7 Pipeline 适配器
 *
 * 将现有的 CLI Pipeline 适配为可被 web service 调用的模块
 *
 * MVP 方案：
 * 1. 为每个订阅创建临时目录
 * 2. 生成用户的 feeds 配置
 * 3. 调用 fetch + pipeline
 * 4. 读取最终 HTML
 */

import { spawn } from 'child_process';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { Feed } from './db';

// Pipeline 根目录 (相对于项目根目录)
const PIPELINE_ROOT = path.resolve(process.cwd(), '..');
const DATA_DIR = path.join(PIPELINE_ROOT, 'data');

export interface PipelineInput {
  subscriptionId: string;
  feeds: Feed[];
  interests?: string | null;
  date: string; // YYYY-MM-DD
}

export interface PipelineResult {
  success: boolean;
  html?: string;
  error?: string;
  stats?: {
    totalItems: number;
    processedItems: number;
    duration: number;
  };
}

/**
 * 运行完整的 V7 Pipeline
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { subscriptionId, feeds, interests, date } = input;
  const startTime = Date.now();

  console.log(`[Pipeline] 开始处理订阅 ${subscriptionId}`);
  console.log(`[Pipeline] Feeds: ${feeds.length} 个, 日期: ${date}`);

  try {
    // 1. 创建临时工作目录
    const workDir = path.join(DATA_DIR, `web-${subscriptionId}-${date}`);
    if (!existsSync(workDir)) {
      await mkdir(workDir, { recursive: true });
    }

    // 2. 生成 feeds 配置文件 (模拟 feed-classification-final.json 格式)
    const feedsConfig = feeds.map(f => ({
      url: f.url,
      title: f.title || 'Unknown',
      publisher: {
        name: f.publisher || 'Unknown',
        type: 'individual' as const,
        authority: 0.5
      },
      topics: {
        primary: 'general'
      },
      weight: 1.0
    }));

    const configPath = path.join(workDir, 'feeds-config.json');
    await writeFile(configPath, JSON.stringify(feedsConfig, null, 2));

    // 3. 抓取 RSS 内容
    console.log(`[Pipeline] 抓取 RSS 内容...`);
    const fetchResult = await fetchRssContent(feedsConfig, date, workDir);

    if (!fetchResult.success) {
      return {
        success: false,
        error: `RSS 抓取失败: ${fetchResult.error}`
      };
    }

    // 4. 检查是否有内容
    const rawDataPath = path.join(workDir, `rss-raw-${date}.json`);
    if (!existsSync(rawDataPath)) {
      return {
        success: false,
        error: '没有获取到任何 RSS 内容'
      };
    }

    const rawData = JSON.parse(await readFile(rawDataPath, 'utf-8'));
    const itemCount = rawData.items?.length || 0;

    if (itemCount === 0) {
      // 没有新内容，生成空简报
      return {
        success: true,
        html: generateEmptyDigest(date, feeds.length, interests),
        stats: {
          totalItems: 0,
          processedItems: 0,
          duration: Date.now() - startTime
        }
      };
    }

    console.log(`[Pipeline] 获取到 ${itemCount} 条内容`);

    // 5. 运行 Pipeline (Phase 0-5)
    // MVP: 暂时跳过完整 Pipeline，使用简化版本
    // TODO: 后续接入完整 V7 Pipeline
    const digestHtml = await generateSimplifiedDigest(rawData, interests, date);

    // 6. 清理临时目录 (可选，保留用于调试)
    // await rm(workDir, { recursive: true, force: true });

    return {
      success: true,
      html: digestHtml,
      stats: {
        totalItems: itemCount,
        processedItems: itemCount,
        duration: Date.now() - startTime
      }
    };

  } catch (error: any) {
    console.error(`[Pipeline] 处理失败:`, error);
    return {
      success: false,
      error: error.message || '未知错误'
    };
  }
}

/**
 * 抓取 RSS 内容
 */
async function fetchRssContent(
  feeds: any[],
  date: string,
  workDir: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise(async (resolve) => {
    try {
      // 直接使用 rss-parser 在这里抓取，而不是调用外部脚本
      const Parser = (await import('rss-parser')).default;
      const parser = new Parser({
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSS-AI-Digest/1.0)',
          Accept: 'application/rss+xml, application/xml, text/xml, */*'
        }
      });

      const dateRange = getDateRange(date);
      const allItems: any[] = [];
      const feedStats: any[] = [];

      // 并发抓取 (最多 10 个同时)
      const concurrency = 10;
      const chunks = [];
      for (let i = 0; i < feeds.length; i += concurrency) {
        chunks.push(feeds.slice(i, i + concurrency));
      }

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(async (feed: any) => {
            try {
              const result = await parser.parseURL(feed.url);
              const items = (result.items || [])
                .filter((item: any) => {
                  if (!item.title || !item.link) return false;
                  const pubDate = item.isoDate || item.pubDate;
                  if (!pubDate) return true; // 保留无日期的
                  const itemTime = new Date(pubDate).getTime();
                  return itemTime >= dateRange.start.getTime() &&
                         itemTime <= dateRange.end.getTime();
                })
                .map((item: any) => ({
                  title: item.title?.trim() || '',
                  link: item.link,
                  description: item.contentSnippet || item.description || '',
                  content: item.content || '',
                  publishedAt: item.isoDate || item.pubDate || null,
                  source: {
                    url: feed.url,
                    title: feed.title,
                    publisher: feed.publisher?.name || 'Unknown',
                    publisherType: feed.publisher?.type || 'individual',
                    authority: feed.publisher?.authority || 0.5,
                    weight: feed.weight || 1.0,
                    topics: [feed.topics?.primary || 'general']
                  }
                }));

              return { feed, items, error: null };
            } catch (err: any) {
              return { feed, items: [], error: err.message };
            }
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { feed, items, error } = result.value;
            allItems.push(...items);
            feedStats.push({
              url: feed.url,
              publisher: feed.publisher?.name || 'Unknown',
              itemCount: items.length,
              error
            });
          }
        }
      }

      // 按时间排序
      allItems.sort((a, b) => {
        const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return bTime - aTime;
      });

      // 保存结果
      const output = {
        fetchedAt: new Date().toISOString(),
        requestedDate: date,
        stats: {
          totalSources: feeds.length,
          successfulSources: feedStats.filter(f => !f.error).length,
          failedSources: feedStats.filter(f => f.error).length,
          totalItemsKept: allItems.length
        },
        feeds: feedStats,
        items: allItems
      };

      const outputPath = path.join(workDir, `rss-raw-${date}.json`);
      await writeFile(outputPath, JSON.stringify(output, null, 2));

      console.log(`[Pipeline] RSS 抓取完成: ${allItems.length} 条内容`);
      resolve({ success: true });

    } catch (error: any) {
      resolve({ success: false, error: error.message });
    }
  });
}

function getDateRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return { start, end };
}

/**
 * 生成简化版简报 (MVP)
 * TODO: 后续替换为完整 V7 Pipeline
 */
async function generateSimplifiedDigest(
  rawData: any,
  interests: string | null,
  date: string
): Promise<string> {
  const items = rawData.items || [];

  // 按来源分组
  const bySource: Record<string, any[]> = {};
  for (const item of items) {
    const source = item.source?.publisher || 'Unknown';
    if (!bySource[source]) bySource[source] = [];
    bySource[source].push(item);
  }

  // 生成内容
  let contentHtml = '';
  for (const [source, sourceItems] of Object.entries(bySource)) {
    contentHtml += `
      <div style="margin-bottom: 24px;">
        <h3 style="color: #1a1a1a; font-size: 16px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
          ${source} (${sourceItems.length})
        </h3>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${sourceItems.slice(0, 5).map((item: any) => `
            <li style="margin-bottom: 12px;">
              <a href="${item.link}" style="color: #2563eb; text-decoration: none; font-weight: 500;">
                ${item.title}
              </a>
              ${item.description ? `
                <p style="color: #666; font-size: 14px; margin: 4px 0 0 0; line-height: 1.5;">
                  ${item.description.substring(0, 150)}${item.description.length > 150 ? '...' : ''}
                </p>
              ` : ''}
            </li>
          `).join('')}
          ${sourceItems.length > 5 ? `
            <li style="color: #999; font-size: 14px;">
              还有 ${sourceItems.length - 5} 篇...
            </li>
          ` : ''}
        </ul>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>每日简报 - ${date}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">📰 每日简报</h1>
        <p style="color: #666; margin-bottom: 24px;">${date} · ${items.length} 篇更新</p>

        ${interests ? `
          <div style="background: #f0f9ff; border-radius: 6px; padding: 12px; margin-bottom: 24px;">
            <strong style="color: #0369a1;">你的关注重点:</strong>
            <p style="color: #666; margin: 8px 0 0 0; font-size: 14px;">${interests}</p>
          </div>
        ` : ''}

        <div style="background: #fef3c7; border-radius: 6px; padding: 12px; margin-bottom: 24px;">
          <p style="color: #92400e; margin: 0; font-size: 14px;">
            ⚡ 这是简化版简报，完整 AI 分析功能即将上线！
          </p>
        </div>

        ${contentHtml}

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          RSS AI Digest - AI 驱动的每日简报<br/>
          回复此邮件可取消订阅
        </p>
      </div>
    </body>
    </html>
  `;
}

/**
 * 生成空简报
 */
function generateEmptyDigest(date: string, feedCount: number, interests: string | null): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">📰 每日简报</h1>
        <p style="color: #666; margin-bottom: 24px;">${date}</p>

        <div style="text-align: center; padding: 40px 20px;">
          <p style="color: #666; font-size: 16px;">
            今日你订阅的 ${feedCount} 个 RSS 源暂无更新
          </p>
          <p style="color: #999; font-size: 14px; margin-top: 12px;">
            明天见！
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          RSS AI Digest - AI 驱动的每日简报
        </p>
      </div>
    </body>
    </html>
  `;
}
