#!/usr/bin/env npx tsx

/**
 * 生成并发送每日简报
 *
 * 流程：
 * 1. 获取所有订阅者
 * 2. 获取 RSS 内容
 * 3. 运行 V7 Pipeline 生成 HTML
 * 4. 发送邮件给所有订阅者
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import Parser from 'rss-parser';
import { runPipeline } from '../src/lib/server/pipeline/index.js';
import type { RSSItem } from '../src/lib/server/pipeline/types.js';

// 环境变量
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY!;

// 初始化客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const resend = new Resend(RESEND_API_KEY);
const parser = new Parser();

// 默认 RSS 源（后续可以从数据库读取）
const DEFAULT_FEEDS = [
  'https://stratechery.com/feed/',
  'https://www.ruanyifeng.com/blog/atom.xml',
  'https://paulgraham.com/rss.html',
  'https://blog.samaltman.com/feed',
];

async function fetchRSSFeeds(feedUrls: string[]): Promise<RSSItem[]> {
  console.log(`📡 获取 ${feedUrls.length} 个 RSS 源...`);

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

      console.log(`  ✓ ${feedTitle}: ${feed.items?.length || 0} 篇`);
    } catch (error: any) {
      console.error(`  ✗ ${url}: ${error.message}`);
    }
  }

  console.log(`📰 共获取 ${items.length} 篇文章\n`);
  return items;
}

async function getSubscribers() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('is_active', true);

  if (error) {
    throw new Error(`获取订阅者失败: ${error.message}`);
  }

  return data || [];
}

async function sendEmail(to: string, subject: string, html: string) {
  const result = await resend.emails.send({
    from: 'RSS Digest <digest@yourdomain.com>', // 需要配置你的域名
    to,
    subject,
    html,
  });

  return result;
}

async function main() {
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  console.log(`🗓️  日期: ${date}\n`);

  // 1. 获取订阅者
  console.log('👥 获取订阅者...');
  const subscribers = await getSubscribers();
  console.log(`  共 ${subscribers.length} 位订阅者\n`);

  if (subscribers.length === 0) {
    console.log('⚠️  没有订阅者，跳过生成');
    return;
  }

  // 2. 获取 RSS 内容
  const items = await fetchRSSFeeds(DEFAULT_FEEDS);

  if (items.length === 0) {
    console.log('⚠️  没有新内容，跳过生成');
    return;
  }

  // 3. 运行 V7 Pipeline
  console.log('🧠 运行 V7 Pipeline...\n');
  const result = await runPipeline({
    items,
    config: {
      workDir: '/tmp/pipeline',
      date,
      openrouterApiKey: OPENROUTER_API_KEY,
      replicateApiKey: REPLICATE_API_KEY,
    },
    onProgress: (phase, message) => {
      console.log(`  [Phase ${phase}] ${message}`);
    },
  });

  if (!result.success || !result.html) {
    console.error('❌ Pipeline 失败:', result.error);
    process.exit(1);
  }

  console.log(`\n✅ Pipeline 完成，耗时 ${result.stats?.duration}ms\n`);

  // 4. 发送邮件
  console.log('📧 发送邮件...');
  const subject = `📰 今日RSS简报 · ${date}`;

  let successCount = 0;
  for (const subscriber of subscribers) {
    try {
      await sendEmail(subscriber.email, subject, result.html);
      console.log(`  ✓ ${subscriber.email}`);
      successCount++;
    } catch (error: any) {
      console.error(`  ✗ ${subscriber.email}: ${error.message}`);
    }
  }

  console.log(`\n🎉 完成！成功发送 ${successCount}/${subscribers.length} 封邮件`);
}

main().catch((error) => {
  console.error('❌ 运行失败:', error);
  process.exit(1);
});
