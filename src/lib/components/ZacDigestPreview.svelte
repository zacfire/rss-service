<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Props {
    onsubscribe?: () => void;
  }

  let { onsubscribe }: Props = $props();

  const dispatch = createEventDispatcher<{
    subscribe: void;
  }>();

  let showPreview = $state(false);

  function handleSubscribe() {
    dispatch('subscribe');
    onsubscribe?.();
  }

  // 示例简报内容（基于真实数据）
  const sampleDigest = {
    date: '2025/12/26',
    editorialNote: '今天的内容主要围绕AI在不同领域的应用展开，从娱乐、沟通到内容创作，AI的影响力日益增强。同时，一些创业者也在积极探索AI在产品设计和开发中的潜力。',
    mustRead: [
      {
        source: '阮一峰的网络日志',
        title: '科技爱好者周刊（第 379 期）：《硅谷钢铁侠》摘录',
        summary: '本期周刊摘录了《硅谷钢铁侠》中马斯克的创业理念与行事风格，并分享了科技动态、工具、AI相关内容。'
      },
      {
        source: '爱范儿',
        title: '笑拥了，现在打王者都在用腾讯会议，AI 这波操作是在大气层',
        summary: '玩家利用腾讯会议的AI纪要功能记录游戏对话，展示了AI在娱乐和沟通方面的创新应用。'
      },
      {
        source: 'Paul Graham',
        title: '超线性回报',
        summary: '探讨了"超线性回报"的概念，即增加努力或投资会产生不成比例的更大成果。'
      }
    ],
    topics: [
      {
        name: '值得关注',
        count: 5,
        highlights: ['AI对出版业的影响', 'Z世代新闻消费趋势', '播客内容分发创新']
      },
      {
        name: '随便看看',
        count: 6,
        highlights: ['职业倦怠与心理健康', '社交应用创新', 'AI换装应用']
      }
    ],
    stats: {
      totalArticles: 10,
      mustReadCount: 3,
      sources: ['阮一峰', 'Paul Graham', '爱范儿', 'V2EX', 'Digiday', 'The Verge']
    }
  };
</script>

<div class="border-t border-gray-200 pt-6 mt-6">
  <div class="text-center mb-4">
    <span class="bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full">没有 RSS 订阅源？</span>
  </div>
  
  <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-6 border border-blue-100">
    <div class="flex items-start space-x-3 mb-4">
      <div class="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
        Z
      </div>
      <div>
        <h3 class="font-semibold text-gray-900">直接订阅 Zac 的精选源</h3>
        <p class="text-sm text-gray-600 mt-1">
          涵盖 AI 前沿、创业思考、产品设计、科技资讯等 200+ 优质信息源
        </p>
      </div>
    </div>

    <!-- 展开/收起预览 -->
    <button
      onclick={() => showPreview = !showPreview}
      class="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1 mb-4"
    >
      <span>{showPreview ? '收起预览' : '查看示例简报'}</span>
      <svg 
        class="w-4 h-4 transition-transform {showPreview ? 'rotate-180' : ''}" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    {#if showPreview}
      <div class="bg-white rounded-lg p-4 mb-4 text-sm border border-gray-100">
        <div class="text-xs text-gray-400 mb-2">📅 {sampleDigest.date} 简报示例</div>
        
        <!-- 编辑手记 -->
        <div class="bg-gray-50 rounded p-3 mb-4 text-gray-600 text-xs leading-relaxed">
          💡 <span class="font-medium">编辑手记</span>：{sampleDigest.editorialNote.slice(0, 100)}...
        </div>

        <!-- 必读 -->
        <div class="mb-4">
          <div class="text-red-500 font-medium mb-2 text-xs">🔴 必读</div>
          <div class="space-y-2">
            {#each sampleDigest.mustRead as item}
              <div class="pl-3 border-l-2 border-red-200">
                <div class="text-xs text-gray-400">{item.source}</div>
                <div class="font-medium text-gray-800 text-sm">{item.title}</div>
              </div>
            {/each}
          </div>
        </div>

        <!-- 话题 -->
        <div class="flex flex-wrap gap-2 text-xs">
          {#each sampleDigest.topics as topic}
            <span class="bg-gray-100 text-gray-600 px-2 py-1 rounded">
              {topic.name} ({topic.count}篇)
            </span>
          {/each}
        </div>

        <!-- 信息源 -->
        <div class="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
          信息源：{sampleDigest.stats.sources.slice(0, 4).join('、')} 等
        </div>
      </div>
    {/if}

    <button
      onclick={handleSubscribe}
      class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
    >
      订阅 Zac 精选 →
    </button>
  </div>
</div>
