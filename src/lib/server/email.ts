/**
 * 邮件发送服务 (Resend)
 */

import { Resend } from 'resend';
import { RESEND_API_KEY } from '$env/static/private';

const resend = new Resend(RESEND_API_KEY);

// 发送者邮箱 - 使用 Resend 提供的测试域名，正式环境需要验证自己的域名
const FROM_EMAIL = 'RSS AI Digest <digest@emmmme.com>';

export interface SendDigestOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * 发送简报邮件
 */
export async function sendDigestEmail(options: SendDigestOptions) {
  const { to, subject, html } = options;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html
    });

    if (error) {
      console.error('Resend 发送失败:', error);
      throw new Error(`邮件发送失败: ${error.message}`);
    }

    console.log('邮件发送成功:', { id: data?.id, to });
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('发送邮件异常:', err);
    throw err;
  }
}

/**
 * 发送测试邮件
 */
export async function sendTestEmail(to: string) {
  return sendDigestEmail({
    to,
    subject: '🎉 RSS AI Digest 订阅确认',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a1a; font-size: 24px;">订阅成功！</h1>
        <p style="color: #666; font-size: 16px; line-height: 1.6;">
          感谢订阅 RSS AI Digest！从明天开始，你将在设定的时间收到 AI 精选的每日简报。
        </p>
        <p style="color: #666; font-size: 16px; line-height: 1.6;">
          简报会根据你订阅的 RSS 源和关注重点，智能筛选和排序当天最值得阅读的内容。
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          如需取消订阅，请回复此邮件。
        </p>
      </div>
    `
  });
}
