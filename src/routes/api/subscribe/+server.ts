/**
 * 订阅提交 API
 * POST /api/subscribe
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { upsertSubscription, getZacFeeds, updateUserProfile, updateUserInterests } from '$lib/server/db';
import { sendTestEmail } from '$lib/server/email';
import { analyzeFeeds } from '$lib/server/feed-analyzer';
import { env } from '$env/dynamic/private';

const MAX_FEEDS = 30;
// 通过环境变量控制是否启用限制，默认启用
const ENABLE_FEED_LIMIT = env.ENABLE_FEED_LIMIT !== 'false';

interface SubscribeRequest {
  email: string;
  pushTime: string;
  interests?: string;
  feeds?: Array<{
    url: string;
    title: string;
    publisher: string;
  }>;
  useZacFeeds?: boolean;  // 使用 Zac 精选源
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body: SubscribeRequest = await request.json();
    const { email, pushTime, interests, useZacFeeds } = body;
    let { feeds } = body;

    // 验证邮箱
    if (!email || typeof email !== 'string') {
      throw error(400, '请提供有效的邮箱地址');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw error(400, '邮箱格式不正确');
    }

    // 验证推送时间
    const validTimes = ['06:00', '07:00', '08:00', '09:00', '12:00', '18:00', '21:00'];
    if (!validTimes.includes(pushTime)) {
      throw error(400, '无效的推送时间');
    }

    // 如果使用 Zac 精选，获取 Zac 的订阅源
    if (useZacFeeds) {
      console.log('使用 Zac 精选源...');
      feeds = await getZacFeeds();
      if (feeds.length === 0) {
        throw error(500, '获取精选订阅源失败，请稍后重试');
      }
      console.log(`获取到 ${feeds.length} 个 Zac 精选源`);
    }

    // 验证feeds
    if (!Array.isArray(feeds) || feeds.length === 0) {
      throw error(400, '请至少选择一个 RSS 源');
    }

    if (ENABLE_FEED_LIMIT && feeds.length > MAX_FEEDS) {
      throw error(400, `免费版最多支持 ${MAX_FEEDS} 个 RSS 源`);
    }

    // 存储到数据库（合并模式）
    const result = await upsertSubscription(email, pushTime, feeds, interests);

    console.log('订阅成功:', {
      id: result.id,
      email,
      pushTime,
      interests: interests ? '已设置' : '未设置',
      isExisting: result.isExisting,
      newFeedsCount: result.newFeedsCount,
      totalFeedsCount: result.totalFeedsCount,
      skippedCount: result.skippedCount,
      useZacFeeds: useZacFeeds || false
    });

    // 异步运行 feed 分析并更新用户画像
    // 不阻塞响应，在后台执行
    (async () => {
      try {
        console.log(`🔍 开始分析 ${feeds!.length} 个 feeds 的用户画像...`);
        const { profile, generatedInterests } = await analyzeFeeds(feeds!);
        await updateUserProfile(result.id, profile);
        console.log(`✅ 用户画像更新成功: ${profile.keyPublishers.length} 个关键发布者`);

        // 保存自动生成的 interests（仅在用户没有手动设置时）
        await updateUserInterests(result.id, generatedInterests, true);
        console.log(`✅ 用户兴趣描述已生成`);
      } catch (err) {
        console.error('❌ Feed 分析失败:', err);
        // 不抛出错误，不影响订阅流程
      }
    })();

    // 发送确认邮件 (异步，不阻塞响应)
    sendTestEmail(email).catch(err => {
      console.error('确认邮件发送失败:', err);
    });

    // 根据情况生成不同的提示消息
    let message: string;
    if (useZacFeeds) {
      message = `订阅成功！已为您添加 ${feeds.length} 个 Zac 精选源，每天 ${pushTime} 将收到 AI 简报。`;
    } else if (result.isExisting) {
      if (result.newFeedsCount > 0) {
        message = `配置已更新！新增 ${result.newFeedsCount} 个订阅源，共 ${result.totalFeedsCount} 个。`;
        if (result.skippedCount > 0) {
          message += ` (${result.skippedCount} 个重复源已跳过)`;
        }
      } else {
        message = `配置已更新！所有 ${feeds.length} 个源已存在，共 ${result.totalFeedsCount} 个订阅源。`;
      }
    } else {
      message = '订阅成功！确认邮件已发送，我们会在设定的时间向您发送 AI 简报。';
    }

    return json({
      success: true,
      message,
      data: {
        email,
        pushTime,
        isExisting: result.isExisting,
        newFeedsCount: result.newFeedsCount,
        totalFeedsCount: result.totalFeedsCount,
        skippedCount: result.skippedCount,
        useZacFeeds: useZacFeeds || false
      }
    });
  } catch (err: any) {
    console.error('订阅失败:', err);

    if (err.status) {
      throw err;
    }

    throw error(500, '订阅失败，请稍后重试');
  }
};
