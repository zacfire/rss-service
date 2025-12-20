<script lang="ts">
  import { onMount } from 'svelte';
  import FileUpload from '$lib/components/FileUpload.svelte';
  import FeedList from '$lib/components/FeedList.svelte';
  import ConfigForm from '$lib/components/ConfigForm.svelte';

  // 配置（从 API 加载）
  let maxEnabledFeeds = $state<number | null>(30);  // null 表示无限制
  let enableFeedLimit = $state(true);

  // 应用状态
  let feeds = $state<Array<{
    id: string;
    url: string;
    title: string;
    publisher: string;
    status: 'pending' | 'valid' | 'invalid';
    errorMessage?: string;
    isEnabled: boolean;
  }>>([]);

  let currentStep = $state<'upload' | 'manage' | 'config'>('upload');
  let isLoading = $state(false);
  let searchQuery = $state('');
  let showAddPanel = $state(false);
  let addMode = $state<'url' | 'file'>('url');
  let newUrlInput = $state('');
  let fileInputRef: HTMLInputElement;

  // 加载配置
  onMount(async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        maxEnabledFeeds = config.maxFeeds;
        enableFeedLimit = config.enableFeedLimit;
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  });

  // 过滤后的feeds
  let filteredFeeds = $derived(
    feeds.filter(feed =>
      feed.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feed.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feed.publisher?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // 统计
  let stats = $derived({
    total: feeds.length,
    valid: feeds.filter(f => f.status === 'valid').length,
    invalid: feeds.filter(f => f.status === 'invalid').length,
    pending: feeds.filter(f => f.status === 'pending').length,
    enabled: feeds.filter(f => f.isEnabled).length,
    enabledValid: feeds.filter(f => f.isEnabled && f.status === 'valid').length
  });

  // 检查是否可以启用更多（无限制时始终为 true）
  let canEnableMore = $derived(
    !enableFeedLimit || maxEnabledFeeds === null || stats.enabled < maxEnabledFeeds
  );

  // 处理文件上传
  async function handleFileUpload(event: CustomEvent<{ file: File }>) {
    const { file } = event.detail;
    isLoading = true;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('导入失败');

      const result = await response.json();

      // 合并新导入的feeds（去重）
      const existingUrls = new Set(feeds.map(f => f.url));
      let enabledCount = stats.enabled;
      const newFeeds = result.feeds
        .filter((f: any) => !existingUrls.has(f.url))
        .map((f: any) => {
          // 只有在未超过限制时才自动启用（无限制时始终启用）
          const shouldEnable = !enableFeedLimit || maxEnabledFeeds === null || enabledCount < maxEnabledFeeds;
          if (shouldEnable) enabledCount++;
          return {
            ...f,
            id: crypto.randomUUID(),
            status: 'pending' as const,
            isEnabled: shouldEnable
          };
        });

      feeds = [...feeds, ...newFeeds];
      currentStep = 'manage';

      // 开始验证新导入的
      validateFeeds(newFeeds.map((f: any) => f.id));
    } catch (error) {
      console.error('上传失败:', error);
      alert('文件解析失败，请检查格式');
    } finally {
      isLoading = false;
    }
  }

  // 添加单个RSS链接
  async function handleAddUrl(event: CustomEvent<{ url: string }>) {
    const { url } = event.detail;
    addSingleUrl(url);
  }

  function addSingleUrl(url: string) {
    if (!url.trim()) return;

    // 检查是否已存在
    if (feeds.some(f => f.url === url)) {
      alert('该RSS源已存在');
      return;
    }

    // 检查是否超过限制（无限制时始终启用）
    const shouldEnable = !enableFeedLimit || maxEnabledFeeds === null || stats.enabled < maxEnabledFeeds;

    const newFeed = {
      id: crypto.randomUUID(),
      url,
      title: '',
      publisher: '',
      status: 'pending' as const,
      isEnabled: shouldEnable
    };

    feeds = [...feeds, newFeed];

    if (!shouldEnable && enableFeedLimit) {
      alert(`已添加但未启用（已达到 ${maxEnabledFeeds} 个限制）`);
    }
    newUrlInput = '';
    showAddPanel = false;

    if (currentStep === 'upload') {
      currentStep = 'manage';
    }

    // 验证这个新添加的
    validateSingleFeed(newFeed.id);
  }

  // 在manage步骤处理文件导入
  async function handleManageFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    isLoading = true;
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('导入失败');

      const result = await response.json();

      // 合并新导入的feeds（去重）
      const existingUrls = new Set(feeds.map(f => f.url));
      let enabledCount = stats.enabled;
      const newFeeds = result.feeds
        .filter((f: any) => !existingUrls.has(f.url))
        .map((f: any) => {
          // 只有在未超过限制时才自动启用（无限制时始终启用）
          const shouldEnable = !enableFeedLimit || maxEnabledFeeds === null || enabledCount < maxEnabledFeeds;
          if (shouldEnable) enabledCount++;
          return {
            ...f,
            id: crypto.randomUUID(),
            status: 'pending' as const,
            isEnabled: shouldEnable
          };
        });

      if (newFeeds.length === 0) {
        alert('没有新的RSS源（所有源已存在）');
      } else {
        feeds = [...feeds, ...newFeeds];
        // 开始验证新导入的
        validateFeeds(newFeeds.map((f: any) => f.id));
        // 提示部分源未启用
        const notEnabledCount = newFeeds.filter((f: any) => !f.isEnabled).length;
        if (notEnabledCount > 0) {
          alert(`已导入 ${newFeeds.length} 个源，其中 ${notEnabledCount} 个因超出限制未自动启用`);
        }
      }

      showAddPanel = false;
    } catch (error) {
      console.error('上传失败:', error);
      alert('文件解析失败，请检查格式');
    } finally {
      isLoading = false;
      // 清空input以便重复选择同一文件
      if (fileInputRef) fileInputRef.value = '';
    }
  }

  // 验证指定的feeds
  async function validateFeeds(feedIds: string[]) {
    for (const feedId of feedIds) {
      await validateSingleFeed(feedId);
    }
  }

  // 验证单个feed
  async function validateSingleFeed(feedId: string) {
    const feed = feeds.find(f => f.id === feedId);
    if (!feed) return;

    try {
      const response = await fetch('/api/feeds/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: feed.url })
      });

      const result = await response.json();

      feeds = feeds.map(f =>
        f.id === feedId
          ? {
              ...f,
              status: result.valid ? 'valid' : 'invalid',
              title: result.title || f.title,
              publisher: result.publisher || f.publisher,
              errorMessage: result.error,
              // 验证失败自动取消勾选
              isEnabled: result.valid ? f.isEnabled : false
            }
          : f
      );
    } catch (error) {
      feeds = feeds.map(f =>
        f.id === feedId
          ? { ...f, status: 'invalid', errorMessage: '验证请求失败', isEnabled: false }
          : f
      );
    }
  }

  // 切换feed启用状态
  function toggleFeed(feedId: string) {
    const feed = feeds.find(f => f.id === feedId);
    if (!feed) return;

    // 如果要启用，检查是否超过限制（无限制时跳过检查）
    if (enableFeedLimit && maxEnabledFeeds !== null && !feed.isEnabled && stats.enabled >= maxEnabledFeeds) {
      alert(`免费版最多启用 ${maxEnabledFeeds} 个订阅源，请先取消其他源`);
      return;
    }

    feeds = feeds.map(f =>
      f.id === feedId ? { ...f, isEnabled: !f.isEnabled } : f
    );
  }

  // 删除feed
  function deleteFeed(feedId: string) {
    feeds = feeds.filter(f => f.id !== feedId);
  }

  // 批量操作
  function enableAll() {
    let count = 0;
    const maxToEnable = enableFeedLimit && maxEnabledFeeds !== null ? maxEnabledFeeds - stats.enabled : Infinity;
    feeds = feeds.map(f => {
      if (f.status === 'valid' && !f.isEnabled && count < maxToEnable) {
        count++;
        return { ...f, isEnabled: true };
      }
      return f;
    });
  }

  function disableAll() {
    feeds = feeds.map(f => ({ ...f, isEnabled: false }));
  }

  function removeInvalid() {
    feeds = feeds.filter(f => f.status !== 'invalid');
  }

  // 提交订阅
  async function handleSubmit(event: CustomEvent<{ email: string; pushTime: string; interests: string }>) {
    const { email, pushTime, interests } = event.detail;
    console.log('提交订阅:', { email, pushTime, interests });
    isLoading = true;

    try {
      const enabledFeeds = feeds.filter(f => f.isEnabled && f.status === 'valid');

      if (enabledFeeds.length === 0) {
        alert('请至少启用一个有效的RSS源');
        return;
      }

      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          pushTime,
          interests: interests || undefined,
          feeds: enabledFeeds.map(f => ({
            url: f.url,
            title: f.title,
            publisher: f.publisher
          }))
        })
      });

      if (!response.ok) throw new Error('提交失败');

      alert('订阅成功！请查收确认邮件。');
      // 重置状态
      feeds = [];
      currentStep = 'upload';
    } catch (error) {
      console.error('提交失败:', error);
      alert('提交失败，请稍后重试');
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>RSS AI Digest - AI 驱动的 RSS 简报</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 py-8">
  <!-- Header -->
  <header class="text-center mb-12">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">RSS AI Digest</h1>
    <p class="text-gray-600">上传你的RSS订阅源，每天自动收到AI精选简报</p>
  </header>

  <!-- Progress Steps -->
  <div class="flex items-center justify-center mb-8">
    <div class="flex items-center space-x-4">
      <button
        class="flex items-center space-x-2 px-4 py-2 rounded-full transition-colors {currentStep === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}"
        onclick={() => currentStep = 'upload'}
      >
        <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">1</span>
        <span>上传</span>
      </button>
      <div class="w-8 h-0.5 bg-gray-300"></div>
      <button
        class="flex items-center space-x-2 px-4 py-2 rounded-full transition-colors {currentStep === 'manage' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}"
        onclick={() => feeds.length > 0 && (currentStep = 'manage')}
        disabled={feeds.length === 0}
      >
        <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">2</span>
        <span>管理</span>
      </button>
      <div class="w-8 h-0.5 bg-gray-300"></div>
      <button
        class="flex items-center space-x-2 px-4 py-2 rounded-full transition-colors {currentStep === 'config' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}"
        onclick={() => stats.enabledValid > 0 && (currentStep = 'config')}
        disabled={stats.enabledValid === 0}
      >
        <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">3</span>
        <span>配置</span>
      </button>
    </div>
  </div>

  <!-- Main Content -->
  <main class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    {#if currentStep === 'upload'}
      <FileUpload
        onfileupload={handleFileUpload}
        onaddurl={handleAddUrl}
        {isLoading}
      />
    {:else if currentStep === 'manage'}
      <div class="space-y-4">
        <!-- Stats & Limit Warning -->
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600">
            共 {stats.total} 个源，有效 {stats.valid}，失效 {stats.invalid}
            {#if stats.pending > 0}，验证中 {stats.pending}{/if}
          </span>
          <span class="{enableFeedLimit && maxEnabledFeeds !== null && stats.enabled > maxEnabledFeeds ? 'text-red-600 font-medium' : 'text-gray-600'}">
            已启用 {stats.enabled}{#if enableFeedLimit && maxEnabledFeeds !== null}/{maxEnabledFeeds}{/if}
          </span>
        </div>

        {#if enableFeedLimit && maxEnabledFeeds !== null && stats.enabled >= maxEnabledFeeds}
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            已达到免费版上限（{maxEnabledFeeds}个），如需启用更多请先取消其他源
          </div>
        {/if}

        <!-- Search & Add -->
        <div class="flex space-x-2">
          <input
            type="text"
            placeholder="搜索RSS源..."
            bind:value={searchQuery}
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onclick={() => { showAddPanel = !showAddPanel; addMode = 'url'; }}
            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            + 添加
          </button>
        </div>

        <!-- Add Panel (URL or File) -->
        {#if showAddPanel}
          <div class="p-4 bg-gray-50 rounded-lg space-y-3">
            <!-- Tab Buttons -->
            <div class="flex space-x-2 border-b border-gray-200 pb-2">
              <button
                onclick={() => addMode = 'url'}
                class="px-3 py-1 text-sm rounded-t {addMode === 'url' ? 'bg-white border border-b-white -mb-[1px] text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}"
              >
                添加链接
              </button>
              <button
                onclick={() => addMode = 'file'}
                class="px-3 py-1 text-sm rounded-t {addMode === 'file' ? 'bg-white border border-b-white -mb-[1px] text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}"
              >
                导入OPML
              </button>
            </div>

            {#if addMode === 'url'}
              <!-- Add URL -->
              <div class="flex space-x-2">
                <input
                  type="url"
                  placeholder="输入RSS链接..."
                  bind:value={newUrlInput}
                  onkeydown={(e) => e.key === 'Enter' && addSingleUrl(newUrlInput)}
                  class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
                <button
                  onclick={() => addSingleUrl(newUrlInput)}
                  disabled={!newUrlInput.trim()}
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                >
                  添加
                </button>
              </div>
            {:else}
              <!-- Import OPML -->
              <div class="flex items-center space-x-3">
                <label class="flex-1">
                  <div class="flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    {#if isLoading}
                      <svg class="animate-spin h-5 w-5 text-blue-600 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                      </svg>
                      <span class="text-gray-600">导入中...</span>
                    {:else}
                      <svg class="h-5 w-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span class="text-gray-600">选择 OPML/XML 文件</span>
                    {/if}
                  </div>
                  <input
                    type="file"
                    accept=".opml,.xml"
                    class="sr-only"
                    bind:this={fileInputRef}
                    onchange={handleManageFileUpload}
                    disabled={isLoading}
                  />
                </label>
              </div>
              <p class="text-xs text-gray-500">支持从其他阅读器导出的 OPML 文件，新增的源会自动去重</p>
            {/if}

            <div class="flex justify-end">
              <button
                onclick={() => { showAddPanel = false; newUrlInput = ''; }}
                class="px-3 py-1 text-sm text-gray-500 hover:text-gray-700"
              >
                关闭
              </button>
            </div>
          </div>
        {/if}

        <!-- Batch Actions -->
        <div class="flex space-x-2 text-sm">
          <button onclick={enableAll} class="text-blue-600 hover:underline" disabled={!canEnableMore}>
            全选有效
          </button>
          <span class="text-gray-300">|</span>
          <button onclick={disableAll} class="text-gray-600 hover:underline">
            取消全选
          </button>
          {#if stats.invalid > 0}
            <span class="text-gray-300">|</span>
            <button onclick={removeInvalid} class="text-red-600 hover:underline">
              移除失效({stats.invalid})
            </button>
          {/if}
        </div>

        <!-- Feed List -->
        <FeedList
          feeds={filteredFeeds}
          canEnableMore={canEnableMore}
          ontoggle={(e) => toggleFeed(e.detail.id)}
          ondelete={(e) => deleteFeed(e.detail.id)}
          onretry={(e) => validateSingleFeed(e.detail.id)}
        />

        <!-- Actions -->
        <div class="flex flex-col items-end gap-2 pt-4">
          {#if enableFeedLimit && maxEnabledFeeds !== null && stats.enabled > maxEnabledFeeds}
            <p class="text-sm text-red-600">
              已启用 {stats.enabled} 个，超出限制 {stats.enabled - maxEnabledFeeds} 个，请取消部分订阅源
            </p>
          {/if}
          <button
            onclick={() => currentStep = 'config'}
            disabled={stats.enabledValid === 0 || (enableFeedLimit && maxEnabledFeeds !== null && stats.enabled > maxEnabledFeeds)}
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            下一步：配置推送 →
          </button>
        </div>
      </div>
    {:else if currentStep === 'config'}
      <ConfigForm
        enabledCount={stats.enabledValid}
        onsubmit={handleSubmit}
        onback={() => currentStep = 'manage'}
        {isLoading}
      />
    {/if}
  </main>

  <!-- Footer -->
  <footer class="text-center mt-8 text-sm text-gray-500">
    {#if enableFeedLimit && maxEnabledFeeds !== null}
      <p>免费版限制：最多启用{maxEnabledFeeds}个RSS源，每日1次推送</p>
    {:else}
      <p>每日1次推送</p>
    {/if}
  </footer>
</div>
