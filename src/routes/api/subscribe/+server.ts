/**
 * 订阅提交 API
 * POST /api/subscribe
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { upsertSubscription } from '$lib/server/db';
import { sendTestEmail } from '$lib/server/email';
import { env } from '$env/dynamic/private';

const MAX_FEEDS = 30;
// 通过环境变量控制是否启用限制，默认启用
const ENABLE_FEED_LIMIT = env.ENABLE_FEED_LIMIT !== 'false';

interface SubscribeRequest {
  email: string;
  pushTime: string;
  interests?: string;
  feeds: Array<{
    url: string;
    title: string;
    publisher: string;
  }>;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body: SubscribeRequest = await request.json();
    const { email, pushTime, interests, feeds } = body;

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

    // 验证feeds
    if (!Array.isArray(feeds) || feeds.length === 0) {
      throw error(400, '请至少选择一个 RSS 源');
    }

    if (ENABLE_FEED_LIMIT && feeds.length > MAX_FEEDS) {
      throw error(400, `免费版最多支持 ${MAX_FEEDS} 个 RSS 源`);
    }

    // 存储到数据库
    const subscription = await upsertSubscription(email, pushTime, feeds, interests);

    console.log('新订阅成功:', {
      id: subscription.id,
      email,
      pushTime,
      interests: interests ? '已设置' : '未设置',
      feedCount: feeds.length
    });

    // 发送确认邮件 (异步，不阻塞响应)
    sendTestEmail(email).catch(err => {
      console.error('确认邮件发送失败:', err);
    });

    return json({
      success: true,
      message: '订阅成功！确认邮件已发送，我们会在设定的时间向您发送 AI 简报。',
      data: {
        email,
        pushTime,
        feedCount: feeds.length
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
