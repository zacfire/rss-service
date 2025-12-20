/**
 * 配置 API
 * GET /api/config
 * 
 * 返回前端需要的配置信息
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const MAX_FEEDS = 30;
// 通过环境变量控制是否启用限制，默认启用
const ENABLE_FEED_LIMIT = env.ENABLE_FEED_LIMIT !== 'false';

export const GET: RequestHandler = async () => {
    return json({
        maxFeeds: ENABLE_FEED_LIMIT ? MAX_FEEDS : null,  // null 表示无限制
        enableFeedLimit: ENABLE_FEED_LIMIT,
    });
};
