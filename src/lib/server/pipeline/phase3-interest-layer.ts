/**
 * V7-Rethink Phase 3: Priority Memo Builder
 *
 * 将全部文章整理成编辑备忘录：
 * - P0: 高信任创作者（必推）
 * - P1: 多源热点簇
 * - P2: 单源系列簇
 * - P3: 噪音/未分类
 */

import type {
  ItemWithEmbedding,
  Cluster,
  ItemSnapshot,
  ClusterSnapshot,
  PriorityMemo,
  PriorityBucket,
  ClusterKind,
} from './types.js';
import type { UserProfile } from '../db.js';

// ==================== 常量 ====================

const CREATOR_TRUST_THRESHOLD = 0.95;
const HOT_TOPIC_DIVERSITY_THRESHOLD = 2;
const HOURS_DECIMAL_DIGITS = 1;
const DEFAULT_CATEGORY = 'Other';

const BUCKET_DESCRIPTIONS: Record<PriorityBucket, string> = {
  P0: '高信任创作者（必须出现在"必读"区）。',
  P1: '多源热点簇（多个来源同时报道的主题，作为"值得关注"候选）。',
  P2: '单一来源的系列或专题（放在"仅供参考"或作为补充信息）。',
  P3: '噪音 / 无关内容（通常忽略，除非另有指示）。',
};

const EDITORIAL_STYLE_GUIDANCE = [
  '先确保 P0 创作者的更新被选入 Must Read。',
  '再从 P1 簇中挑选最重要的 2-3 个热点主题编入 Worth Watch。',
  '最后在有剩余槽位时，从 P2 中挑选少量"背景"或"趣味"内容。',
].join(' ');

const SORTING_HINTS = [
  'P0 内部可按发布时间或个人偏好排序。',
  'P1 可优先选择"unique_publishers"大于 3、且"semantic_consistency"较高的簇。',
  'P2 仅在需要补位或提供背景时引用，避免占满版面。',
];

// ==================== 工具函数 ====================

function ensureCategory(raw?: string): string {
  return raw?.trim() || DEFAULT_CATEGORY;
}

function hoursSince(publishedAt: string, now: Date): number {
  const publishedTime = new Date(publishedAt);
  const diffMs = now.getTime() - publishedTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return Number(diffHours.toFixed(HOURS_DECIMAL_DIGITS));
}

function classifyCluster(cluster: Cluster): ClusterKind {
  const publishers = cluster.metadata?.publishers ?? [];
  const uniquePublisherCount =
    publishers.length > 0
      ? new Set(publishers).size
      : new Set(cluster.items.map(item => item.source.publisher)).size;

  return uniquePublisherCount >= HOT_TOPIC_DIVERSITY_THRESHOLD ? 'hot_topic' : 'single_source';
}

// ==================== 主函数 ====================

export interface Phase3Input {
  items: ItemWithEmbedding[];
  clusters: Cluster[];
  date: string;
  userProfile?: UserProfile | null;  // 用户画像，用于动态计算信任度
}

export interface Phase3Output {
  memo: PriorityMemo;
}

// 动态计算信任度
function getDynamicTrust(
  publisher: string,
  feedUrl: string,
  userProfile?: UserProfile | null
): number {
  if (!userProfile) {
    // 没有用户画像，使用 RSS 源自带的 authority
    return 0.5;
  }

  // 1. 先查 URL 权重
  if (userProfile.sourceWeights[feedUrl]) {
    return userProfile.sourceWeights[feedUrl];
  }

  // 2. 再查发布者
  const keyPub = userProfile.keyPublishers.find(p => p.name === publisher);
  if (keyPub) {
    return keyPub.authority;
  }

  // 3. 默认信任度
  return 0.3;
}

export async function runPhase3(input: Phase3Input): Promise<Phase3Output> {
  console.log('🎯 Phase 3: Priority Memo Builder');

  const { items, clusters, date, userProfile } = input;
  const now = new Date();

  console.log(`  载入 ${items.length} 篇文章`);
  console.log(`  载入 ${clusters.length} 个簇`);
  if (userProfile) {
    console.log(`  用户画像: ${userProfile.keyPublishers.length} 个关键发布者`);
  } else {
    console.log(`  用户画像: 未设置，使用默认权重`);
  }

  // 建立辅助索引
  const clusterById = new Map<number, Cluster>();
  const clusterByFingerprint = new Map<string, Cluster>();

  for (const cluster of clusters) {
    clusterById.set(cluster.id, cluster);
    for (const item of cluster.items) {
      clusterByFingerprint.set(item.fingerprint, cluster);
    }
  }

  // 构建 Cluster Snapshot
  const clusterSnapshots: ClusterSnapshot[] = clusters.map(cluster => {
    const clusterKind = classifyCluster(cluster);
    const publishersFromMetadata = cluster.metadata?.publishers ?? [];
    const uniquePublishers =
      publishersFromMetadata.length > 0
        ? new Set(publishersFromMetadata)
        : new Set(cluster.items.map(item => item.source.publisher));

    const publisherList = Array.from(uniquePublishers);
    const itemFingerprints = cluster.items.map(item => item.fingerprint);

    return {
      cluster_id: cluster.id,
      cluster_kind: clusterKind,
      theme: cluster.theme,
      category: ensureCategory(cluster.category),
      reasoning: cluster.reasoning,
      confidence: cluster.confidence,
      metrics: {
        semantic_consistency: cluster.semantic_consistency,
        topic_entropy: cluster.topic_entropy,
        size: cluster.items.length,
        unique_publishers: uniquePublishers.size,
        avg_authority: cluster.metadata?.avg_authority ?? 0,
      },
      publishers: publisherList,
      item_fingerprints: itemFingerprints,
    };
  });

  // 构建 Item Snapshot
  const itemSnapshots: ItemSnapshot[] = items.map(item => {
    // 使用动态信任度计算
    const trustScore = getDynamicTrust(
      item.source.publisher,
      item.source.feedUrl || '',
      userProfile
    );
    const isFollowedCreator = trustScore >= CREATOR_TRUST_THRESHOLD;

    const cluster = clusterByFingerprint.get(item.fingerprint) ?? null;
    const clusterKind = cluster ? classifyCluster(cluster) : null;

    const bucketSet = new Set<PriorityBucket>();
    if (isFollowedCreator) {
      bucketSet.add('P0');
    }
    if (cluster) {
      if (clusterKind === 'hot_topic') {
        bucketSet.add('P1');
      } else if (clusterKind === 'single_source') {
        bucketSet.add('P2');
      }
    }
    if (bucketSet.size === 0) {
      bucketSet.add('P3');
    }

    const priorityBuckets = Array.from(bucketSet).sort((a, b) => {
      const order: Record<PriorityBucket, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return order[a] - order[b];
    });

    const hoursSincePublished = hoursSince(item.publishedAt, now);

    const annotations = {
      trust_level: (
        trustScore === 1.0 ? 'high' :
          trustScore === 0.8 ? 'medium' : 'low'
      ) as 'high' | 'medium' | 'low',

      multi_source_signal: (() => {
        if (!cluster) return null;
        const publishersFromMetadata = cluster.metadata?.publishers ?? [];
        const uniquePublisherCount =
          publishersFromMetadata.length > 0
            ? new Set(publishersFromMetadata).size
            : new Set(cluster.items.map(clusterItem => clusterItem.source.publisher)).size;

        if (uniquePublisherCount >= 3) {
          return {
            topic: cluster.theme || 'Untitled Topic',
            publisher_count: uniquePublisherCount,
            confidence: cluster.confidence || 0,
          };
        }
        return null;
      })(),

      urgency: (
        hoursSincePublished <= 6 ? 'urgent' :
          hoursSincePublished <= 24 ? 'timely' : 'evergreen'
      ) as 'urgent' | 'timely' | 'evergreen',
    };

    return {
      fingerprint: item.fingerprint,
      title: item.title,
      link: item.link,
      summary: item.aiSummary,
      publishedAt: item.publishedAt,
      hours_since_published: hoursSincePublished,
      language: item.language,
      topics: item.source.topics ?? [],
      publisher: item.source.publisher,
      publisher_type: item.source.publisherType,
      authority: item.source.authority,
      trust_score: Number(trustScore.toFixed(2)),
      is_followed_creator: isFollowedCreator,
      priority_buckets: priorityBuckets,
      cluster_id: cluster?.id ?? null,
      cluster_kind: clusterKind,
      cluster_theme: cluster?.theme ?? null,
      cluster_category: cluster ? ensureCategory(cluster.category) : null,
      cluster_confidence: cluster?.confidence ?? null,
      annotations,
    };
  });

  // 统计信息
  const creatorPool = itemSnapshots
    .filter(item => item.priority_buckets.includes('P0'))
    .map(item => item.fingerprint);

  const hotTopicClusters = clusterSnapshots
    .filter(cluster => cluster.cluster_kind === 'hot_topic')
    .map(cluster => cluster.cluster_id);

  const singleSourceClusters = clusterSnapshots
    .filter(cluster => cluster.cluster_kind === 'single_source')
    .map(cluster => cluster.cluster_id);

  const noiseItems = itemSnapshots
    .filter(item => item.priority_buckets.length === 1 && item.priority_buckets[0] === 'P3')
    .map(item => item.fingerprint);

  const uniquePublishers = new Set(items.map(item => item.source.publisher));

  const memo: PriorityMemo = {
    date,
    generated_at: new Date().toISOString(),
    guidance: {
      bucket_description: BUCKET_DESCRIPTIONS,
      sorting_hint: SORTING_HINTS,
      editorial_style: EDITORIAL_STYLE_GUIDANCE,
    },
    stats: {
      total_items: items.length,
      clusters_total: clusterSnapshots.length,
      hot_topic_clusters: hotTopicClusters.length,
      single_source_clusters: singleSourceClusters.length,
      creator_pool_size: creatorPool.length,
      hot_topic_pool_size: itemSnapshots.filter(item => item.priority_buckets.includes('P1')).length,
      single_source_pool_size: itemSnapshots.filter(item => item.priority_buckets.includes('P2')).length,
      noise_pool_size: noiseItems.length,
      unique_publishers: uniquePublishers.size,
    },
    clusters: clusterSnapshots,
    items: itemSnapshots,
    pools: {
      P0_creator_pool: creatorPool,
      P1_hot_topic_clusters: hotTopicClusters,
      P2_single_source_clusters: singleSourceClusters,
      P3_noise_items: noiseItems,
    },
  };

  console.log('✅ Phase 3 完成');
  console.log(`  Creator Pool: ${memo.stats.creator_pool_size}`);
  console.log(`  Hot Topic Clusters: ${memo.stats.hot_topic_clusters}`);
  console.log(`  Single-source Clusters: ${memo.stats.single_source_clusters}`);
  console.log(`  Noise Items: ${memo.stats.noise_pool_size}`);

  return { memo };
}
