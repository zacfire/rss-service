/**
 * RSS 订阅源验证器
 */

import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'RSS-AI-Digest/1.0'
  }
});

interface ValidationResult {
  valid: boolean;
  title?: string;
  publisher?: string;
  itemCount?: number;
  error?: string;
}

/**
 * 验证RSS订阅源是否有效
 */
export async function validateRSSFeed(url: string): Promise<ValidationResult> {
  try {
    // 验证URL格式
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: '仅支持HTTP/HTTPS协议' };
    }

    // 尝试解析RSS
    const feed = await parser.parseURL(url);

    if (!feed) {
      return { valid: false, error: '无法解析RSS内容' };
    }

    return {
      valid: true,
      title: feed.title || '未知标题',
      publisher: extractPublisher(feed),
      itemCount: feed.items?.length || 0
    };
  } catch (error: any) {
    // 根据错误类型返回友好的错误信息
    const errorMessage = getErrorMessage(error);
    return { valid: false, error: errorMessage };
  }
}

/**
 * 批量验证RSS订阅源
 */
export async function validateMultipleFeeds(
  urls: string[],
  concurrency: number = 5
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>();

  // 分批处理，避免并发过高
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const result = await validateRSSFeed(url);
        return { url, result };
      })
    );

    for (const { url, result } of batchResults) {
      results.set(url, result);
    }
  }

  return results;
}

/**
 * 从Feed中提取发布者名称
 */
function extractPublisher(feed: any): string {
  // 尝试多种来源
  if (feed.itunes?.author) return feed.itunes.author;
  if (feed.creator) return feed.creator;
  if (feed.author) return feed.author;
  if (feed.managingEditor) return feed.managingEditor;

  // 从网站URL提取域名
  if (feed.link) {
    try {
      const domain = new URL(feed.link).hostname;
      return domain.replace('www.', '');
    } catch {
      // ignore
    }
  }

  return feed.title || '未知来源';
}

/**
 * 获取友好的错误信息
 */
function getErrorMessage(error: any): string {
  const message = error.message?.toLowerCase() || '';

  if (message.includes('timeout') || message.includes('timedout')) {
    return '请求超时，服务器响应过慢';
  }
  if (message.includes('enotfound') || message.includes('dns')) {
    return '无法解析域名';
  }
  if (message.includes('econnrefused')) {
    return '服务器拒绝连接';
  }
  if (message.includes('certificate') || message.includes('ssl')) {
    return 'SSL证书错误';
  }
  if (message.includes('404')) {
    return 'RSS源不存在(404)';
  }
  if (message.includes('403')) {
    return '访问被拒绝(403)';
  }
  if (message.includes('parse') || message.includes('xml')) {
    return '无效的RSS格式';
  }

  return '验证失败: ' + (error.message || '未知错误');
}
