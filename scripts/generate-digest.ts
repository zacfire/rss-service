#!/usr/bin/env npx tsx

/**
 * 生成并发送每日简报
 *
 * 流程：
 * 1. 根据当前时间确定推送时间段
 * 2. 查询该时间段的订阅者
 * 3. 对每个订阅者：获取 RSS 源 → 运行 Pipeline → 发送邮件
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

// 初始化客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);
const parser = new Parser();

// 推送时间段（北京时间）
const PUSH_TIMES = ['07:00', '08:00', '09:00'];

function getCurrentPushTime(): string {
  // 获取北京时间的小时
  const now = new Date();
  const beijingHour = (now.getUTCHours() + 8) % 24;

  // 找到对应的推送时间
  for (const time of PUSH_TIMES) {
    const hour = parseInt(time.split(':')[0]);
    if (beijingHour === hour) {
      return time;
    }
  }

  // 如果是手动触发，默认用 07:00
  return '07:00';
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
    from: 'RSS Digest <digest@resend.dev>', // 使用 Resend 默认域名
    to,
    subject,
    html,
  });

  return result;
}

async function processSubscriber(subscriber: any, date: string) {
  console.log(`\n👤 处理订阅者: ${subscriber.email}`);

  // 1. 获取该用户的 RSS 源
  const feeds = await getFeedsBySubscription(subscriber.id);
  if (feeds.length === 0) {
    console.log('  ⚠️ 没有 RSS 源，跳过');
    return { success: false, reason: 'no_feeds' };
  }

  const feedUrls = feeds.map(f => f.url);
  console.log(`  📋 ${feeds.length} 个 RSS 源`);

  // 2. 获取 RSS 内容
  const items = await fetchRSSFeeds(feedUrls);
  if (items.length === 0) {
    console.log('  ⚠️ 没有新内容，跳过');
    return { success: false, reason: 'no_content' };
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
    return { success: false, reason: 'pipeline_failed', error: result.error };
  }

  console.log(`  ✅ Pipeline 完成，耗时 ${result.stats?.duration}ms`);

  // 4. 发送邮件
  const subject = `📰 今日RSS简报 · ${date}`;
  try {
    await sendEmail(subscriber.email, subject, result.html);
    console.log('  📧 邮件已发送');
    return { success: true };
  } catch (error: any) {
    console.error('  ❌ 发送失败:', error.message);
    return { success: false, reason: 'email_failed', error: error.message };
  }
}

async function main() {
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  const pushTime = getCurrentPushTime();

  console.log(`🗓️  日期: ${date}`);
  console.log(`⏰ 推送时段: ${pushTime}\n`);

  // 1. 获取该时段的订阅者
  console.log('👥 获取订阅者...');
  const subscribers = await getSubscriptionsForPush(pushTime);
  console.log(`  共 ${subscribers.length} 位订阅者\n`);

  if (subscribers.length === 0) {
    console.log('✅ 没有需要推送的订阅者，退出');
    return;
  }

  // 2. 依次处理每个订阅者
  let successCount = 0;
  let failCount = 0;

  for (const subscriber of subscribers) {
    try {
      const result = await processSubscriber(subscriber, date);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error: any) {
      console.error(`\n❌ 处理 ${subscriber.email} 时出错:`, error.message);
      failCount++;
    }
  }

  console.log(`\n🎉 完成！成功: ${successCount}, 失败: ${failCount}`);
}

main().catch((error) => {
  console.error('❌ 运行失败:', error);
  process.exit(1);
});
