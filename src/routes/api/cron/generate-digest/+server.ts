/**
 * 定时生成简报 API
 *
 * 由 Cloudflare Worker 每小时调用一次
 * GET /api/cron/generate-digest?hour=07
 *
 * 可选参数:
 * - hour: 指定时段 (如 "07" 表示 07:00)，不传则使用当前北京时间
 * - secret: 安全密钥，防止未授权调用
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase, type Subscription, type Feed } from '$lib/server/db';
import { sendDigestEmail } from '$lib/server/email';
import { runPipeline } from '$lib/server/pipeline';

// 简单的安全密钥，生产环境应使用环境变量
const CRON_SECRET = 'rss-digest-cron-2024';

export const GET: RequestHandler = async ({ url }) => {
  // 验证密钥
  const secret = url.searchParams.get('secret');
  if (secret !== CRON_SECRET) {
    throw error(401, '未授权访问');
  }

  // 获取目标时段
  let targetHour = url.searchParams.get('hour');
  if (!targetHour) {
    // 获取当前北京时间的小时
    const now = new Date();
    const beijingHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })).getHours();
    targetHour = beijingHour.toString().padStart(2, '0');
  }

  const pushTime = `${targetHour}:00`;
  console.log(`[Cron] 开始处理 ${pushTime} 时段的订阅...`);

  try {
    // 1. 查询该时段的活跃订阅
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('push_time', pushTime)
      .eq('is_active', true);

    if (subError) {
      console.error('查询订阅失败:', subError);
      throw error(500, '数据库查询失败');
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`[Cron] ${pushTime} 时段没有订阅`);
      return json({
        success: true,
        message: `${pushTime} 时段没有待处理的订阅`,
        processed: 0
      });
    }

    console.log(`[Cron] 找到 ${subscriptions.length} 个订阅`);

    // 2. 处理每个订阅
    const results = [];
    for (const subscription of subscriptions as Subscription[]) {
      try {
        const result = await processSubscription(subscription);
        results.push({
          email: subscription.email,
          status: 'success',
          ...result
        });
      } catch (err: any) {
        console.error(`处理订阅失败 [${subscription.email}]:`, err);
        results.push({
          email: subscription.email,
          status: 'failed',
          error: err.message
        });

        // 记录失败日志
        await supabase.from('push_logs').insert({
          subscription_id: subscription.id,
          channel: 'email',
          status: 'failed',
          error_message: err.message
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    console.log(`[Cron] 处理完成: ${successCount}/${subscriptions.length} 成功`);

    return json({
      success: true,
      message: `处理完成`,
      pushTime,
      total: subscriptions.length,
      success: successCount,
      failed: subscriptions.length - successCount,
      results
    });
  } catch (err: any) {
    console.error('[Cron] 执行失败:', err);
    throw error(500, err.message || '执行失败');
  }
};

/**
 * 处理单个订阅
 */
async function processSubscription(subscription: Subscription) {
  const { id: subscriptionId, email, interests } = subscription;

  // 1. 获取该订阅的 feeds
  const { data: feeds, error: feedsError } = await supabase
    .from('feeds')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .eq('is_enabled', true)
    .eq('status', 'valid');

  if (feedsError) throw feedsError;
  if (!feeds || feeds.length === 0) {
    throw new Error('没有有效的 RSS 源');
  }

  console.log(`[${email}] 处理 ${feeds.length} 个 feeds`);

  // 2. 运行 Pipeline 生成简报
  const today = new Date().toISOString().split('T')[0];
  const pipelineResult = await runPipeline({
    subscriptionId,
    feeds: feeds as Feed[],
    interests,
    date: today
  });

  if (!pipelineResult.success || !pipelineResult.html) {
    throw new Error(pipelineResult.error || '简报生成失败');
  }

  console.log(`[${email}] Pipeline 完成: ${pipelineResult.stats?.totalItems || 0} 条内容`);

  // 3. 发送邮件
  await sendDigestEmail({
    to: email,
    subject: `📰 今日简报 - ${today}`,
    html: pipelineResult.html
  });

  // 4. 记录成功日志
  const { data: digest } = await supabase
    .from('digests')
    .upsert({
      subscription_id: subscriptionId,
      date: today,
      status: 'completed',
      stats: pipelineResult.stats,
      sent_at: new Date().toISOString()
    }, {
      onConflict: 'subscription_id,date'
    })
    .select()
    .single();

  await supabase.from('push_logs').insert({
    subscription_id: subscriptionId,
    digest_id: digest?.id,
    channel: 'email',
    status: 'sent'
  });

  return {
    feedCount: feeds.length,
    digestId: digest?.id,
    itemCount: pipelineResult.stats?.totalItems || 0
  };
}

