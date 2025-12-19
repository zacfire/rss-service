/**
 * V7 Pipeline 主入口
 *
 * 完整流程：
 * Phase 0: 异常标注（广告、重复、低频源）
 * Phase 1: AI处理（Summary + Embedding）
 * Phase 2: 语义聚类（HDBSCAN + Topic理解）
 * Phase 3: Priority Memo Builder（P0/P1/P2/P3 分层）
 * Phase 4: LLM-as-Editor Digest Builder
 * Phase 5: HTML生成
 */

import { runPhase0 } from './phase0-anomaly-detection.js';
import { runPhase1 } from './phase1-ai-processing.js';
import { runPhase2 } from './phase2-semantic-clustering.js';
import { runPhase3 } from './phase3-interest-layer.js';
import { runPhase4 } from './phase4-digest-builder.js';
import { runPhase5 } from './phase5-generate-html.js';
import type { RSSItem, PipelineConfig, PipelineResult } from './types.js';

export interface RunPipelineOptions {
  items: RSSItem[];
  config: PipelineConfig;
  onProgress?: (phase: number, message: string) => void;
}

export async function runPipeline(options: RunPipelineOptions): Promise<PipelineResult> {
  const { items, config, onProgress } = options;
  const startTime = Date.now();

  const progress = (phase: number, message: string) => {
    console.log(`[Phase ${phase}] ${message}`);
    onProgress?.(phase, message);
  };

  try {
    // ==================== Phase 0: 异常标注 ====================
    progress(0, '开始异常标注...');
    const phase0Result = await runPhase0({ items });
    progress(0, `完成: ${phase0Result.validItems.length} 篇有效文章`);

    if (phase0Result.validItems.length === 0) {
      return {
        success: false,
        error: '没有有效的文章可处理',
        stats: {
          totalItems: items.length,
          processedItems: 0,
          duration: Date.now() - startTime,
        },
      };
    }

    // ==================== Phase 1: AI处理 ====================
    progress(1, '开始AI处理...');
    const phase1Result = await runPhase1({
      items: phase0Result.validItems,
      config,
    });
    progress(1, `完成: ${phase1Result.items.length} 篇文章已处理`);

    // ==================== Phase 2: 语义聚类 ====================
    progress(2, '开始语义聚类...');
    const phase2Result = await runPhase2({
      items: phase1Result.items,
      config,
    });
    progress(2, `完成: ${phase2Result.clusters.length} 个话题簇`);

    // ==================== Phase 3: Priority Memo ====================
    progress(3, '构建 Priority Memo...');
    const phase3Result = await runPhase3({
      items: phase1Result.items,
      clusters: phase2Result.clusters,
      date: config.date,
    });
    progress(3, `完成: P0=${phase3Result.memo.stats.creator_pool_size}, P1=${phase3Result.memo.stats.hot_topic_clusters}`);

    // ==================== Phase 4: Digest Builder ====================
    progress(4, 'LLM 编辑决策...');
    const phase4Result = await runPhase4({
      memo: phase3Result.memo,
      config,
    });
    progress(4, `完成: 必读=${phase4Result.stats.mustReadCount}, 话题=${phase4Result.stats.topicsCount}`);

    // ==================== Phase 5: HTML生成 ====================
    progress(5, '生成HTML...');
    const phase5Result = await runPhase5({
      digestStructure: phase4Result.digestStructure,
      config,
    });
    progress(5, '完成: HTML 已生成');

    const duration = Date.now() - startTime;

    return {
      success: true,
      html: phase5Result.html,
      stats: {
        totalItems: items.length,
        processedItems: phase1Result.items.length,
        duration,
      },
    };
  } catch (error: any) {
    console.error('Pipeline 执行失败:', error);
    return {
      success: false,
      error: error.message || '未知错误',
      stats: {
        totalItems: items.length,
        processedItems: 0,
        duration: Date.now() - startTime,
      },
    };
  }
}

// 导出所有阶段函数供单独使用
export { runPhase0 } from './phase0-anomaly-detection.js';
export { runPhase1 } from './phase1-ai-processing.js';
export { runPhase2 } from './phase2-semantic-clustering.js';
export { runPhase3 } from './phase3-interest-layer.js';
export { runPhase4 } from './phase4-digest-builder.js';
export { runPhase5 } from './phase5-generate-html.js';

// 导出类型
export * from './types.js';
