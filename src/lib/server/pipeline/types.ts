/**
 * V7 Pipeline 共享类型定义
 */

export type Language = 'zh' | 'en' | 'mixed';
export type PriorityBucket = 'P0' | 'P1' | 'P2' | 'P3';
export type ClusterKind = 'hot_topic' | 'single_source';

// ==================== RSS Item 类型 ====================

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  content?: string;
  publishedAt: string;
  source: {
    url: string;
    title: string;
    publisher: string;
    publisherType: string;
    authority: number;
    weight: number;
    topics: string[];
  };
}

export interface ValidItem extends RSSItem {
  fingerprint: string;
}

export interface ItemWithEmbedding extends ValidItem {
  aiSummary: string;
  summaryEmbedding: number[];
  language: Language;
}

// ==================== Anomaly 类型 ====================

export interface AnomalyFlags {
  fingerprint: string;
  is_ad: boolean;
  is_duplicate: boolean;
  is_low_frequency: boolean;
  duplicate_of?: string;
}

// ==================== Cluster 类型 ====================

export interface HdbscanCluster {
  cluster_id: number;
  items: ItemWithEmbedding[];
}

export interface HdbscanResult {
  date: string;
  stats: {
    sampled_items: number;
    clusters: number;
    noise_items: number;
  };
  clusters: HdbscanCluster[];
  noise_items: ItemWithEmbedding[];
}

export interface Cluster {
  id: number;
  theme: string;
  category: string;
  reasoning: string;
  confidence: number;
  semantic_consistency: number;
  topic_entropy: number;
  items: ItemWithEmbedding[];
  metadata: {
    size: number;
    avg_authority: number;
    publishers: string[];
  };
}

// ==================== Priority Memo 类型 ====================

export interface ItemSnapshot {
  fingerprint: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string;
  hours_since_published: number;
  language: Language;
  topics: string[];
  publisher: string;
  publisher_type: string;
  authority: number;
  trust_score: number;
  is_followed_creator: boolean;
  priority_buckets: PriorityBucket[];
  cluster_id: number | null;
  cluster_kind: ClusterKind | null;
  cluster_theme: string | null;
  cluster_category: string | null;
  cluster_confidence: number | null;
  annotations: {
    trust_level: 'high' | 'medium' | 'low';
    multi_source_signal: {
      topic: string;
      publisher_count: number;
      confidence: number;
    } | null;
    urgency: 'urgent' | 'timely' | 'evergreen';
  };
}

export interface ClusterSnapshot {
  cluster_id: number;
  cluster_kind: ClusterKind;
  theme: string;
  category: string;
  reasoning: string;
  confidence: number;
  metrics: {
    semantic_consistency: number;
    topic_entropy: number;
    size: number;
    unique_publishers: number;
    avg_authority: number;
  };
  publishers: string[];
  item_fingerprints: string[];
}

export interface PriorityMemo {
  date: string;
  generated_at: string;
  guidance: {
    bucket_description: Record<PriorityBucket, string>;
    sorting_hint: string[];
    editorial_style: string;
  };
  stats: {
    total_items: number;
    clusters_total: number;
    hot_topic_clusters: number;
    single_source_clusters: number;
    creator_pool_size: number;
    hot_topic_pool_size: number;
    single_source_pool_size: number;
    noise_pool_size: number;
    unique_publishers: number;
  };
  clusters: ClusterSnapshot[];
  items: ItemSnapshot[];
  pools: {
    P0_creator_pool: string[];
    P1_hot_topic_clusters: number[];
    P2_single_source_clusters: number[];
    P3_noise_items: string[];
  };
}

// ==================== Digest Plan 类型 ====================

export interface NewDigestPlan {
  must_read: Array<{
    id: string;
    why: string;
    signals: string[];
  }>;
  topics: Record<string, {
    priority_items: Array<{
      id: string;
      why: string;
      signals: string[];
    }>;
    other_items: string[];
  }>;
  nice_to_have?: string[];
  editorial_note: string;
  metadata: {
    total_selected: number;
    trust_authors_in_must_read: number;
    multi_source_in_must_read: number;
    topics_count: number;
    nice_to_have_count?: number;
    adjustment_notes?: string;
  };
}

export interface ItemMetadata {
  fingerprint: string;
  title: string;
  link: string;
  publisher: string;
  summary: string;
  publishedAt: string;
  annotations: {
    trust_level: 'high' | 'medium' | 'low';
    multi_source_signal: {
      topic: string;
      publisher_count: number;
      confidence: number;
    } | null;
    urgency: 'urgent' | 'timely' | 'evergreen';
  };
  priority_buckets: PriorityBucket[];
  cluster_theme: string | null;
  cluster_category: string | null;
}

export interface DigestStructure {
  date: string;
  generated_at: string;
  digest_plan: NewDigestPlan;
  items_metadata: ItemMetadata[];
  llm_trace: {
    prompt_id: string;
    model: string;
    request_id?: string;
  };
}

// ==================== Pipeline 配置 ====================

export interface PipelineConfig {
  workDir: string;
  date: string;
  openrouterApiKey: string;
  replicateApiKey?: string;
}

export interface PipelineResult {
  success: boolean;
  html?: string;
  digestStructure?: DigestStructure;  // 结构化数据，用于存储和预览
  error?: string;
  stats?: {
    totalItems: number;
    processedItems: number;
    duration: number;
  };
}
