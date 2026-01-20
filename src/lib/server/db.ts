/**
 * Supabase 数据库客户端
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from '$env/static/private';

// 创建Supabase客户端（使用service_role key，绑定RLS）
export const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '');

// 数据库类型定义
export interface Subscription {
  id: string;
  email: string;
  push_time: string;
  timezone: string;
  interests: string | null;
  is_active: boolean;
  verify_token: string | null;
  token_expires_at: string | null;
  user_profile: UserProfile | null;
  created_at: string;
  updated_at: string;
}

// 用户画像类型
export interface UserProfile {
  keyPublishers: Array<{
    name: string;
    type: string;
    subtype?: string;
    authority: number;
    weight: number;
    topics: string[];
  }>;
  sourceWeights: Record<string, number>;
  topics: string[];
}

export interface Feed {
  id: string;
  subscription_id: string;
  url: string;
  title: string | null;
  publisher: string | null;
  status: 'pending' | 'valid' | 'invalid';
  error_message: string | null;
  is_enabled: boolean;
  last_validated_at: string | null;
  created_at: string;
}

export interface Digest {
  id: string;
  subscription_id: string;
  date: string;
  html_url: string | null;
  stats: Record<string, any> | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  sent_at: string | null;
  created_at: string;
}

// 辅助函数

/**
 * 根据邮箱获取订阅信息
 */
export async function getSubscriptionByEmail(email: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data as Subscription | null;
}

/**
 * 创建或更新订阅（合并模式）
 * - 同一邮箱再次提交时，新 feeds 与现有的合并（按 URL 去重）
 * - 推送时间和兴趣设置会更新为最新提交的值
 */
export async function upsertSubscription(
  email: string,
  pushTime: string,
  feeds: Array<{ url: string; title: string; publisher: string }>,
  interests?: string
) {
  // 先查找现有订阅
  let subscription = await getSubscriptionByEmail(email);
  let isExisting = false;

  if (subscription) {
    isExisting = true;
    // 更新现有订阅
    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        push_time: pushTime,
        interests: interests || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id)
      .select()
      .single();

    if (error) throw error;
    subscription = data;
  } else {
    // 创建新订阅
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        email,
        push_time: pushTime,
        interests: interests || null
      })
      .select()
      .single();

    if (error) throw error;
    subscription = data;
  }

  if (!subscription) {
    throw new Error('Failed to create or update subscription');
  }

  // 获取现有的 feeds URL 集合（用于去重）
  let existingUrls = new Set<string>();
  if (isExisting) {
    const { data: existingFeeds } = await supabase
      .from('feeds')
      .select('url')
      .eq('subscription_id', subscription.id);

    if (existingFeeds) {
      existingUrls = new Set(existingFeeds.map(f => f.url));
    }
  }

  // 只插入新的 feeds（不在现有列表中的）
  const newFeeds = feeds.filter(f => !existingUrls.has(f.url));

  if (newFeeds.length > 0) {
    const feedsToInsert = newFeeds.map(f => ({
      subscription_id: subscription.id,
      url: f.url,
      title: f.title,
      publisher: f.publisher,
      status: 'valid' as const,
      is_enabled: true
    }));

    const { error: feedsError } = await supabase
      .from('feeds')
      .insert(feedsToInsert);

    if (feedsError) throw feedsError;
  }

  // 返回订阅信息，包含统计
  const { count } = await supabase
    .from('feeds')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_id', subscription.id);

  return {
    ...subscription,
    isExisting,
    newFeedsCount: newFeeds.length,
    totalFeedsCount: count || 0,
    skippedCount: feeds.length - newFeeds.length
  };
}

/**
 * 更新用户画像
 */
export async function updateUserProfile(subscriptionId: string, profile: UserProfile) {
  const { error } = await supabase
    .from('subscriptions')
    .update({
      user_profile: profile,
      updated_at: new Date().toISOString()
    })
    .eq('id', subscriptionId);

  if (error) throw error;
}

/**
 * 获取用户画像
 */
export async function getUserProfile(subscriptionId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('user_profile')
    .eq('id', subscriptionId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data?.user_profile as UserProfile | null;
}

/**
 * 获取订阅的所有feeds
 */
export async function getFeedsBySubscription(subscriptionId: string) {
  const { data, error } = await supabase
    .from('feeds')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .eq('is_enabled', true);

  if (error) throw error;
  return data as Feed[];
}

/**
 * 获取需要推送的订阅列表
 */
export async function getSubscriptionsForPush(pushTime: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('push_time', pushTime)
    .eq('is_active', true);

  if (error) throw error;
  return data as Subscription[];
}

/**
 * 获取 Zac 的精选订阅源
 * 用于"订阅 Zac 精选"功能
 */
const ZAC_EMAIL = 'hellozacchen@gmail.com';

export async function getZacFeeds() {
  // 1. 获取 Zac 的订阅 ID
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('email', ZAC_EMAIL)
    .single();

  if (subError || !subscription) {
    console.error('找不到 Zac 的订阅:', subError);
    return [];
  }

  // 2. 获取他的所有有效 feeds
  const { data: feeds, error: feedsError } = await supabase
    .from('feeds')
    .select('url, title, publisher')
    .eq('subscription_id', subscription.id)
    .eq('status', 'valid')
    .eq('is_enabled', true);

  if (feedsError) {
    console.error('获取 Zac feeds 失败:', feedsError);
    return [];
  }

  return feeds || [];
}
