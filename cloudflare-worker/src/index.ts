/**
 * RSS AI Digest - Cloudflare Worker Cron
 *
 * 定时触发简报生成和推送
 * 提前30分钟执行，确保在用户设定的时间推送
 */

export interface Env {
  DIGEST_API_URL: string;
  CRON_SECRET: string;
}

// Cron 触发时间到推送时间的映射
// Key: UTC 小时:分钟, Value: 北京时间推送小时
const CRON_TO_PUSH_HOUR: Record<string, string> = {
  '21:30': '06', // UTC 21:30 → 北京 05:30 → 推送 06:00
  '22:30': '07', // UTC 22:30 → 北京 06:30 → 推送 07:00
  '23:30': '08', // UTC 23:30 → 北京 07:30 → 推送 08:00
  '0:30': '09',  // UTC 00:30 → 北京 08:30 → 推送 09:00
  '3:30': '12',  // UTC 03:30 → 北京 11:30 → 推送 12:00
  '9:30': '18',  // UTC 09:30 → 北京 17:30 → 推送 18:00
  '12:30': '21', // UTC 12:30 → 北京 20:30 → 推送 21:00
};

export default {
  /**
   * Cron 触发器
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const triggerTime = new Date(controller.scheduledTime);
    const utcHour = triggerTime.getUTCHours();
    const utcMinute = triggerTime.getUTCMinutes();
    const cronKey = `${utcHour}:${utcMinute}`;

    const pushHour = CRON_TO_PUSH_HOUR[cronKey];

    if (!pushHour) {
      console.log(`[Cron] 未知触发时间: ${cronKey}, 跳过`);
      return;
    }

    console.log(`[Cron] 触发: UTC ${cronKey} → 处理北京时间 ${pushHour}:00 推送`);

    try {
      const url = `${env.DIGEST_API_URL}?hour=${pushHour}&secret=${env.CRON_SECRET}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'RSS-Digest-Cron/1.0'
        }
      });

      const result = await response.json() as any;

      if (response.ok) {
        console.log(`[Cron] 成功: ${result.message || 'OK'}`);
        console.log(`[Cron] 处理: ${result.total || 0} 个订阅, 成功 ${result.success || 0}`);
      } else {
        console.error(`[Cron] API 错误: ${response.status} - ${result.message || 'Unknown error'}`);
      }

    } catch (error) {
      console.error(`[Cron] 请求失败:`, error);
    }
  },

  /**
   * HTTP 请求处理 (用于手动测试)
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // 健康检查
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'rss-digest-cron',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 手动触发 (需要 secret)
    if (url.pathname === '/trigger') {
      const secret = url.searchParams.get('secret');
      const hour = url.searchParams.get('hour');

      if (secret !== env.CRON_SECRET) {
        return new Response(JSON.stringify({ error: '未授权' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (!hour) {
        return new Response(JSON.stringify({ error: '缺少 hour 参数' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const apiUrl = `${env.DIGEST_API_URL}?hour=${hour}&secret=${env.CRON_SECRET}`;
        const response = await fetch(apiUrl);
        const result = await response.json();

        return new Response(JSON.stringify(result), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({
      message: 'RSS AI Digest Cron Worker',
      endpoints: {
        '/health': '健康检查',
        '/trigger?hour=07&secret=xxx': '手动触发指定时段'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
