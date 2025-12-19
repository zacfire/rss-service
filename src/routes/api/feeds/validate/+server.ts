/**
 * RSS 验证 API
 * POST /api/feeds/validate
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateRSSFeed } from '$lib/server/rss-validator';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      throw error(400, '请提供有效的 URL');
    }

    // 验证URL格式
    try {
      new URL(url);
    } catch {
      throw error(400, '无效的 URL 格式');
    }

    // 验证RSS源
    const result = await validateRSSFeed(url);

    return json(result);
  } catch (err: any) {
    console.error('RSS验证失败:', err);

    if (err.status) {
      throw err;
    }

    return json({
      valid: false,
      error: '验证服务暂时不可用'
    });
  }
};
