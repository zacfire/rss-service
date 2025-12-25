#!/usr/bin/env npx tsx

/**
 * 生成并发送每日简报
 *
 * 流程：
 * 1. 提前1小时执行，确定目标推送时间
 * 2. 查询该时间段的订阅者
 * 3. 对每个订阅者：获取 RSS 源 → 运行 Pipeline → 存储结果
 * 4. 等待到目标推送时间
 * 5. 统一发送邮件
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import Parser from 'rss-parser';
import { runPipeline } from '../src/lib/server/pipeline/index.js';
import type { RSSItem } from '../src/lib/server/pipeline/types.js';

// 环境变量
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY!;
const SKIP_WAIT = process.env.SKIP_WAIT === 'true';

// 初始化客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);
const parser = new Parser();

// 推送时间段（北京时间）
const PUSH_TIMES = ['07:00', '08:00', '09:00'];

// 获取目标推送时间（当前北京时间 +1 小时）
function getTargetPushTime(): string {
  const now = new Date();
  // 当前北京时间的小时 + 1
  const beijingHour = (now.getUTCHours() + 8) % 24;
  const targetHour = beijingHour + 1;

  console.log(`  [调试] UTC时间: ${now.getUTCHours()}:${now.getUTCMinutes()}, 北京时间: ${beijingHour}:xx, 目标时段: ${targetHour}:00`);

  // 找到对应的推送时间
  for (const time of PUSH_TIMES) {
    const hour = parseInt(time.split(':')[0]);
    if (targetHour === hour) {
      return time;
    }
  }

  // 没找到匹配的时间段，说明当前不是预期的执行时间
  // 返回空字符串表示不应该执行
  console.log(`  ⚠️ 当前时间不匹配任何预设时段 (06:00/07:00/08:00 北京时间)`);
  return '';
}

// 计算距离目标时间的毫秒数
function getWaitTimeMs(pushTime: string): number {
  const [targetHour, targetMinute] = pushTime.split(':').map(Number);

  const now = new Date();
  // 计算北京时间的目标时间点
  const targetDate = new Date(now);
  // 设置为 UTC 时间，北京时间 = UTC + 8
  targetDate.setUTCHours(targetHour - 8, targetMinute, 0, 0);

  // 如果目标时间已过，说明是第二天
  if (targetDate <= now) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const waitMs = targetDate.getTime() - now.getTime();

  // 安全上限：最多等待 1.5 小时（90 分钟）
  // 如果超过这个时间，说明调度时间有问题，直接发送
  const MAX_WAIT_MS = 90 * 60 * 1000; // 1.5 小时
  if (waitMs > MAX_WAIT_MS) {
    console.log(`  ⚠️ 等待时间 ${Math.floor(waitMs / 60000)} 分钟超过上限，立即发送`);
    return 0;
  }

  return waitMs;
}

// 格式化等待时间
function formatWaitTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}分${seconds}秒`;
}

async function fetchRSSFeeds(feedUrls: string[]): Promise<RSSItem[]> {
  console.log(`  📡 获取 ${feedUrls.length} 个 RSS 源...`);

  const items: RSSItem[] = [];
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const url of feedUrls) {
    try {
      const feed = await parser.parseURL(url);
      const feedTitle = feed.title || url;

      for (const item of feed.items || []) {
        const pubDate = item.pubDate ? new Date(item.pubDate) : now;

        // 只获取最近 24 小时的内容
        if (pubDate < oneDayAgo) continue;

        items.push({
          title: item.title || 'Untitled',
          link: item.link || '',
          description: item.contentSnippet || item.content || '',
          content: item.content || item.contentSnippet || '',
          publishedAt: pubDate.toISOString(),
          source: {
            url,
            title: feedTitle,
            publisher: feedTitle,
            publisherType: 'blog',
            authority: 0.5,
            weight: 1,
            topics: [],
          },
        });
      }
    } catch (error: any) {
      console.error(`    ✗ ${url}: ${error.message}`);
    }
  }

  console.log(`  📰 共获取 ${items.length} 篇文章`);
  return items;
}

async function getSubscriptionsForPush(pushTime: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('push_time', pushTime)
    .eq('is_active', true);

  if (error) throw error;
  return data || [];
}

async function getFeedsBySubscription(subscriptionId: string) {
  const { data, error } = await supabase
    .from('feeds')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .eq('is_enabled', true);

  if (error) throw error;
  return data || [];
}

async function sendEmail(to: string, subject: string, html: string) {
  const result = await resend.emails.send({
    from: 'RSS AI Digest <digest@emmmme.com>',
    reply_to: 'hellozacchen@gmail.com',
    to,
    subject,
    html,
  });

  return result;
}

interface DigestResult {
  subscriber: any;
  success: boolean;
  html?: string;
  error?: string;
  reason?: string;
}

async function generateDigest(subscriber: any, date: string): Promise<DigestResult> {
  console.log(`\n👤 生成简报: ${subscriber.email}`);

  // 1. 获取该用户的 RSS 源
  const feeds = await getFeedsBySubscription(subscriber.id);
  if (feeds.length === 0) {
    console.log('  ⚠️ 没有 RSS 源，跳过');
    return { subscriber, success: false, reason: 'no_feeds' };
  }

  const feedUrls = feeds.map(f => f.url);
  console.log(`  📋 ${feeds.length} 个 RSS 源`);

  // 2. 获取 RSS 内容
  const items = await fetchRSSFeeds(feedUrls);
  if (items.length === 0) {
    console.log('  ⚠️ 没有新内容，跳过');
    return { subscriber, success: false, reason: 'no_content' };
  }

  // 3. 运行 V7 Pipeline
  console.log('  🧠 运行 Pipeline...');
  const result = await runPipeline({
    items,
    config: {
      workDir: '/tmp/pipeline',
      date,
      openrouterApiKey: OPENROUTER_API_KEY,
      replicateApiKey: REPLICATE_API_KEY,
    },
  });

  if (!result.success || !result.html) {
    console.error('  ❌ Pipeline 失败:', result.error);
    return { subscriber, success: false, reason: 'pipeline_failed', error: result.error };
  }

  console.log(`  ✅ Pipeline 完成，耗时 ${result.stats?.duration}ms`);
  return { subscriber, success: true, html: result.html };
}

async function sendDigests(results: DigestResult[], date: string): Promise<{ success: number; failed: number }> {
  console.log('\n📧 开始发送邮件...');

  let successCount = 0;
  let failCount = 0;

  for (const result of results) {
    if (!result.success || !result.html) {
      failCount++;
      continue;
    }

    const subject = `📰 今日RSS简报 · ${date}`;
    try {
      await sendEmail(result.subscriber.email, subject, result.html);
      console.log(`  ✅ ${result.subscriber.email}`);
      successCount++;
    } catch (error: any) {
      console.error(`  ❌ ${result.subscriber.email}: ${error.message}`);
      failCount++;
    }
  }

  return { success: successCount, failed: failCount };
}

async function main() {
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  // 支持手动指定时间段，如: npm run generate-digest -- 2024-12-20 07:00
  const pushTime = process.argv[3] || getTargetPushTime();

  console.log(`🗓️  日期: ${date}`);
  console.log(`⏰ 推送时段: ${pushTime || '(未检测到)'}`);
  console.log(`⏭️  跳过等待: ${SKIP_WAIT}\n`);

  // 如果推送时间为空，说明当前不是预期的执行时间
  if (!pushTime) {
    console.log('⚠️ 当前时间不在预设执行时段内，退出');
    console.log('   预设执行时段: 北京时间 06:00/07:00/08:00');
    return;
  }

  // 1. 获取该时段的订阅者
  console.log('👥 获取订阅者...');
  const subscribers = await getSubscriptionsForPush(pushTime);
  console.log(`  共 ${subscribers.length} 位订阅者\n`);

  if (subscribers.length === 0) {
    console.log('✅ 没有需要推送的订阅者，退出');
    return;
  }

  // 2. 先生成所有简报（不发送）
  console.log('📝 开始生成简报...');
  const results: DigestResult[] = [];

  for (const subscriber of subscribers) {
    try {
      const result = await generateDigest(subscriber, date);
      results.push(result);
    } catch (error: any) {
      console.error(`\n❌ 生成 ${subscriber.email} 简报时出错:`, error.message);
      results.push({ subscriber, success: false, error: error.message });
    }
  }

  const generatedCount = results.filter(r => r.success).length;
  console.log(`\n📦 简报生成完成: ${generatedCount}/${subscribers.length}`);

  // 3. 等待到目标推送时间（除非设置了跳过等待）
  if (!SKIP_WAIT && generatedCount > 0) {
    const waitMs = getWaitTimeMs(pushTime);

    if (waitMs > 0) {
      console.log(`\n⏳ 等待到 ${pushTime} 再发送邮件...`);
      console.log(`   剩余等待时间: ${formatWaitTime(waitMs)}`);

      // 每分钟打印一次进度，避免 GitHub Actions 超时
      const startTime = Date.now();
      const endTime = startTime + waitMs;

      while (Date.now() < endTime) {
        const remaining = endTime - Date.now();
        if (remaining > 60000) {
          await new Promise(r => setTimeout(r, 60000));
          console.log(`   还需等待: ${formatWaitTime(remaining - 60000)}`);
        } else {
          await new Promise(r => setTimeout(r, remaining));
          break;
        }
      }

      console.log('   ⏰ 到达推送时间！');
    }
  } else if (SKIP_WAIT) {
    console.log('\n⏭️  跳过等待，立即发送');
  }

  // 4. 统一发送邮件
  const { success, failed } = await sendDigests(results, date);

  console.log(`\n🎉 完成！成功: ${success}, 失败: ${failed}`);
}

main().catch((error) => {
  console.error('❌ 运行失败:', error);
  process.exit(1);
});
