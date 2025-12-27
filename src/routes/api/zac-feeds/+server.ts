/**
 * 获取 Zac 精选源 API
 * GET /api/zac-feeds
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getZacFeeds } from '$lib/server/db';

export const GET: RequestHandler = async () => {
    try {
        const feeds = await getZacFeeds();

        if (feeds.length === 0) {
            throw error(500, '获取精选订阅源失败');
        }

        console.log(`返回 ${feeds.length} 个 Zac 精选源`);

        return json({
            success: true,
            feeds: feeds.map((f, index) => ({
                id: `zac-${index}`,
                url: f.url,
                title: f.title || '未知标题',
                publisher: f.publisher || '未知来源',
                status: 'valid' as const,
                isEnabled: true
            }))
        });
    } catch (err: any) {
        console.error('获取 Zac feeds 失败:', err);

        if (err.status) {
            throw err;
        }

        throw error(500, '获取精选订阅源失败，请稍后重试');
    }
};
