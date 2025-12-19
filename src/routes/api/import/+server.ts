/**
 * OPML 导入 API
 * POST /api/import
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseOPML, isValidOPML } from '$lib/server/opml-parser';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw error(400, '请上传文件');
    }

    // 验证文件类型
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.opml') && !fileName.endsWith('.xml')) {
      throw error(400, '仅支持 OPML/XML 格式文件');
    }

    // 验证文件大小 (最大 2MB)
    if (file.size > 2 * 1024 * 1024) {
      throw error(400, '文件大小不能超过 2MB');
    }

    // 读取文件内容
    const content = await file.text();

    // 验证OPML格式
    if (!isValidOPML(content)) {
      throw error(400, '无效的 OPML 格式');
    }

    // 解析OPML - 不限制数量，全部导入
    let feeds = parseOPML(content);

    if (feeds.length === 0) {
      throw error(400, '未找到有效的 RSS 订阅源');
    }

    // 去重（按URL）
    const seen = new Set<string>();
    feeds = feeds.filter(feed => {
      if (seen.has(feed.url)) return false;
      seen.add(feed.url);
      return true;
    });

    return json({
      success: true,
      feeds,
      total: feeds.length,
      message: `成功导入 ${feeds.length} 个订阅源`
    });
  } catch (err: any) {
    console.error('OPML导入失败:', err);

    if (err.status) {
      throw err;
    }

    throw error(500, '文件解析失败');
  }
};
