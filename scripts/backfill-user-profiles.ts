#!/usr/bin/env npx tsx

/**
 * 一次性脚本：为所有现有订阅者生成 user_profile
 * 
 * 运行方式：
 * cd web-service && npx tsx scripts/backfill-user-profiles.ts
 */

import { createClient } from '@supabase/supabase-js';
import { analyzeFeeds } from '../src/lib/server/feed-analyzer.js';

// 环境变量
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ 缺少环境变量: SUPABASE_URL 或 SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log('🔍 开始为现有用户生成 user_profile 和 interests...\n');

    // 1. 获取所有活跃订阅者（包括那些可能需要更新 interests 的）
    const { data: subscribers, error: subError } = await supabase
        .from('subscriptions')
        .select('id, email, user_profile, interests')
        .eq('is_active', true);

    if (subError) {
        console.error('❌ 获取订阅者失败:', subError);
        process.exit(1);
    }

    if (!subscribers || subscribers.length === 0) {
        console.log('✅ 没有活跃用户');
        process.exit(0);
    }

    // 筛选需要处理的用户（没有 user_profile 或没有 interests）
    const needsUpdate = subscribers.filter(s => !s.user_profile || !s.interests);

    if (needsUpdate.length === 0) {
        console.log('✅ 所有用户都已有 user_profile 和 interests，无需处理');
        process.exit(0);
    }

    console.log(`📋 找到 ${needsUpdate.length} 个需要处理的用户\n`);

    let successCount = 0;
    let failCount = 0;

    for (const subscriber of needsUpdate) {
        console.log(`\n👤 处理: ${subscriber.email}`);

        try {
            // 获取该用户的 feeds
            const { data: feeds, error: feedError } = await supabase
                .from('feeds')
                .select('url, title, publisher')
                .eq('subscription_id', subscriber.id)
                .eq('is_enabled', true);

            if (feedError) {
                console.error(`  ❌ 获取 feeds 失败:`, feedError);
                failCount++;
                continue;
            }

            if (!feeds || feeds.length === 0) {
                console.log('  ⚠️ 没有 feeds，跳过');
                continue;
            }

            console.log(`  📋 ${feeds.length} 个 feeds`);

            // 分析 feeds 生成 profile 和 interests
            const { profile, generatedInterests } = await analyzeFeeds(feeds);

            // 存储到数据库
            const { error: updateError } = await supabase
                .from('subscriptions')
                .update({
                    user_profile: profile,
                    interests: generatedInterests,  // 同时保存自动生成的 interests
                    updated_at: new Date().toISOString()
                })
                .eq('id', subscriber.id);

            if (updateError) {
                console.error(`  ❌ 更新失败:`, updateError);
                failCount++;
                continue;
            }

            console.log(`  ✅ 成功: ${profile.keyPublishers.length} 个关键发布者`);
            successCount++;

        } catch (err) {
            console.error(`  ❌ 处理失败:`, err);
            failCount++;
        }

        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎉 完成！成功: ${successCount}, 失败: ${failCount}`);
    process.exit(0);
}

main().catch(err => {
    console.error('❌ 脚本执行失败:', err);
    process.exit(1);
});
