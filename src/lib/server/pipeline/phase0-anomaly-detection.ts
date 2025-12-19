/**
 * V7-Rethink Phase 0: 异常标注（不过滤）
 *
 * 标记潜在噪声，但不删除内容
 * - 广告检测
 * - 重复检测（基于fingerprint）
 * - 低频源检测
 */

import { createHash } from 'crypto';
import type { RSSItem, ValidItem, AnomalyFlags } from './types.js';

// ==================== 配置 ====================

const AD_PATTERNS = [
  /优惠|促销|限时|特价|立减|折扣/,
  /点击领取|马上购买|立即购买/,
  /赞助|广告|推广/,
];

// ==================== 工具函数 ====================

function generateFingerprint(item: RSSItem): string {
  const raw = `${item.title}::${item.link}`;
  return createHash('md5').update(raw).digest('hex');
}

function detectAd(item: RSSItem): boolean {
  const text = item.title + ' ' + item.description;
  return AD_PATTERNS.some((pattern) => pattern.test(text));
}

function detectDuplicates(items: ValidItem[]): Map<string, string> {
  const seen = new Map<string, string>();
  const duplicates = new Map<string, string>();

  for (const item of items) {
    if (seen.has(item.fingerprint)) {
      duplicates.set(item.fingerprint, seen.get(item.fingerprint)!);
    } else {
      seen.set(item.fingerprint, item.fingerprint);
    }
  }

  return duplicates;
}

function detectLowFrequency(
  item: RSSItem,
  publisherCounts: Map<string, number>
): boolean {
  const count = publisherCounts.get(item.source.publisher) || 0;
  return count === 1;
}

// ==================== 主函数 ====================

export interface Phase0Input {
  items: RSSItem[];
}

export interface Phase0Output {
  validItems: ValidItem[];
  anomalyFlags: AnomalyFlags[];
  stats: {
    total: number;
    adCount: number;
    duplicateCount: number;
    lowFrequencyCount: number;
  };
}

export async function runPhase0(input: Phase0Input): Promise<Phase0Output> {
  console.log('🔍 Phase 0: 异常标注');

  const { items } = input;
  console.log(`  载入 ${items.length} 篇文章`);

  // 1. 生成fingerprint
  const validItems: ValidItem[] = items.map((item) => ({
    ...item,
    fingerprint: generateFingerprint(item),
  }));

  // 2. 统计publisher频次
  const publisherCounts = new Map<string, number>();
  for (const item of validItems) {
    const count = publisherCounts.get(item.source.publisher) || 0;
    publisherCounts.set(item.source.publisher, count + 1);
  }

  // 3. 检测重复
  const duplicates = detectDuplicates(validItems);
  console.log(`  发现 ${duplicates.size} 篇重复文章`);

  // 4. 生成异常标记
  const anomalyFlags: AnomalyFlags[] = validItems.map((item) => {
    const isDuplicate = duplicates.has(item.fingerprint);

    return {
      fingerprint: item.fingerprint,
      is_ad: detectAd(item),
      is_duplicate: isDuplicate,
      is_low_frequency: detectLowFrequency(item, publisherCounts),
      duplicate_of: isDuplicate ? duplicates.get(item.fingerprint) : undefined,
    };
  });

  const adCount = anomalyFlags.filter((f) => f.is_ad).length;
  const duplicateCount = anomalyFlags.filter((f) => f.is_duplicate).length;
  const lowFreqCount = anomalyFlags.filter((f) => f.is_low_frequency).length;

  console.log(`  广告标记: ${adCount}篇`);
  console.log(`  重复标记: ${duplicateCount}篇`);
  console.log(`  低频源: ${lowFreqCount}篇`);
  console.log('✅ Phase 0 完成');

  return {
    validItems,
    anomalyFlags,
    stats: {
      total: items.length,
      adCount,
      duplicateCount,
      lowFrequencyCount: lowFreqCount,
    },
  };
}
