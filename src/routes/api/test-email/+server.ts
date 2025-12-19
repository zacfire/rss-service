/**
 * 测试邮件发送
 * POST /api/test-email
 * Body: { email: "test@example.com" }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendTestEmail } from '$lib/server/email';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { email } = await request.json();

    if (!email) {
      throw error(400, '请提供邮箱地址');
    }

    const result = await sendTestEmail(email);

    return json({
      success: true,
      message: '测试邮件已发送',
      ...result
    });
  } catch (err: any) {
    console.error('测试邮件发送失败:', err);

    if (err.status) {
      throw err;
    }

    throw error(500, err.message || '发送失败');
  }
};
