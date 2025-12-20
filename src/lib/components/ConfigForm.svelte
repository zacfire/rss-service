<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Props {
    enabledCount: number;
    isLoading?: boolean;
    onsubmit?: (event: CustomEvent<{ email: string; pushTime: string; interests: string }>) => void;
    onback?: () => void;
  }

  let { enabledCount, isLoading = false, onsubmit, onback }: Props = $props();

  const dispatch = createEventDispatcher<{
    submit: { email: string; pushTime: string; interests: string };
    back: void;
  }>();

  let email = $state('');
  let pushTime = $state('07:00');
  let interests = $state('');

  const pushTimeOptions = [
    { value: '07:00', label: '早上 7:00' },
    { value: '08:00', label: '早上 8:00' },
    { value: '09:00', label: '早上 9:00' },
  ];

  function handleSubmit(event: Event) {
    event.preventDefault();

    if (!email.trim()) {
      alert('请输入邮箱地址');
      return;
    }

    // 简单的邮箱验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('请输入有效的邮箱地址');
      return;
    }

    dispatch('submit', { email: email.trim(), pushTime, interests: interests.trim() });
    onsubmit?.({ detail: { email: email.trim(), pushTime, interests: interests.trim() } } as CustomEvent<{ email: string; pushTime: string; interests: string }>);
  }

  function handleBack() {
    dispatch('back');
    onback?.();
  }
</script>

<form onsubmit={handleSubmit} class="space-y-5 sm:space-y-6">
  <div>
    <h3 class="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">配置推送设置</h3>

    <!-- Summary -->
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
      <p class="text-blue-800 text-sm sm:text-base">
        已选择 <strong>{enabledCount}</strong> 个有效的RSS源
      </p>
    </div>

    <!-- Email -->
    <div class="mb-4">
      <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
        接收邮箱 <span class="text-red-500">*</span>
      </label>
      <input
        type="email"
        id="email"
        bind:value={email}
        placeholder="your@email.com"
        required
        class="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
      />
      <p class="mt-1 text-xs sm:text-sm text-gray-500">
        每日简报将发送到此邮箱，也用于修改配置
      </p>
    </div>

    <!-- Push Time -->
    <div class="mb-4">
      <label for="pushTime" class="block text-sm font-medium text-gray-700 mb-1">
        推送时间
      </label>
      <select
        id="pushTime"
        bind:value={pushTime}
        class="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
      >
        {#each pushTimeOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
      <p class="mt-1 text-xs sm:text-sm text-gray-500">
        北京时间，每日定时发送
      </p>
    </div>

    <!-- Interests -->
    <div class="mb-4">
      <label for="interests" class="block text-sm font-medium text-gray-700 mb-1">
        关注重点（可选）
      </label>
      <textarea
        id="interests"
        bind:value={interests}
        placeholder="例如：&#10;- 关注的人：Elon Musk、张一鸣、李飞飞&#10;- 关注的产品/公司：特斯拉FSD、Claude、微信读书&#10;- 关注的具体事件：OpenAI发布、苹果WWDC、字节跳动出海"
        rows="4"
        class="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm sm:text-base"
      ></textarea>
      <p class="mt-1 text-xs sm:text-sm text-gray-500">
        填写具体的人名、产品名、公司名或事件，AI会优先推送相关内容
      </p>
    </div>
  </div>

  <!-- Actions -->
  <div class="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 sm:gap-0 pt-4 border-t border-gray-200">
    <button
      type="button"
      onclick={handleBack}
      class="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm sm:text-base"
    >
      ← 返回管理
    </button>
    <button
      type="submit"
      disabled={isLoading || !email.trim()}
      class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-sm sm:text-base"
    >
      {#if isLoading}
        <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <span>提交中...</span>
      {:else}
        <span>确认订阅</span>
      {/if}
    </button>
  </div>
</form>
