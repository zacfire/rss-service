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
  created_at: string;
  updated_at: string;
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
 * 创建或更新订阅
 */
export async function upsertSubscription(
  email: string,
  pushTime: string,
  feeds: Array<{ url: string; title: string; publisher: string }>,
  interests?: string
) {
  // 先查找现有订阅
  let subscription = await getSubscriptionByEmail(email);

  if (subscription) {
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

  // 删除旧的feeds
  await supabase
    .from('feeds')
    .delete()
    .eq('subscription_id', subscription.id);

  // 插入新的feeds
  if (feeds.length > 0) {
    const feedsToInsert = feeds.map(f => ({
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

  return subscription;
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
