<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Props {
    isLoading?: boolean;
    onfileupload?: (event: CustomEvent<{ file: File }>) => void;
    onaddurl?: (event: CustomEvent<{ url: string }>) => void;
  }

  let { isLoading = false, onfileupload, onaddurl }: Props = $props();

  const dispatch = createEventDispatcher<{
    fileupload: { file: File };
    addurl: { url: string };
  }>();

  let urlInput = $state('');
  let dragOver = $state(false);

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      dispatch('fileupload', { file });
      onfileupload?.({ detail: { file } } as CustomEvent<{ file: File }>);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;

    const file = event.dataTransfer?.files[0];
    if (file && (file.name.endsWith('.opml') || file.name.endsWith('.xml'))) {
      dispatch('fileupload', { file });
      onfileupload?.({ detail: { file } } as CustomEvent<{ file: File }>);
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleAddUrl() {
    const url = urlInput.trim();
    if (!url) return;

    // 简单的URL验证
    try {
      new URL(url);
    } catch {
      alert('请输入有效的URL');
      return;
    }

    dispatch('addurl', { url });
    onaddurl?.({ detail: { url } } as CustomEvent<{ url: string }>);
    urlInput = '';
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleAddUrl();
    }
  }
</script>

<div class="space-y-5 sm:space-y-6">
  <!-- OPML Upload -->
  <div>
    <h3 class="text-base sm:text-lg font-medium text-gray-900 mb-2 sm:mb-3">上传OPML文件</h3>
    <div
      class="border-2 border-dashed rounded-lg p-6 sm:p-8 text-center transition-colors {dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}"
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      role="button"
      tabindex="0"
    >
      {#if isLoading}
        <div class="flex items-center justify-center space-x-2">
          <svg class="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-gray-600">解析中...</span>
        </div>
      {:else}
        <svg class="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="mt-3 sm:mt-4">
          <label for="file-upload" class="cursor-pointer">
            <span class="text-blue-600 hover:text-blue-700 font-medium">选择文件</span>
            <span class="text-gray-500 hidden sm:inline"> 或拖拽到此处</span>
            <input
              id="file-upload"
              type="file"
              accept=".opml,.xml"
              class="sr-only"
              onchange={handleFileSelect}
            />
          </label>
        </div>
        <p class="mt-2 text-xs sm:text-sm text-gray-500">支持 OPML / XML 格式</p>
      {/if}
    </div>
  </div>

  <!-- Divider -->
  <div class="relative">
    <div class="absolute inset-0 flex items-center">
      <div class="w-full border-t border-gray-300"></div>
    </div>
    <div class="relative flex justify-center text-sm">
      <span class="bg-white px-2 text-gray-500">或者</span>
    </div>
  </div>

  <!-- Add Single URL -->
  <div>
    <h3 class="text-base sm:text-lg font-medium text-gray-900 mb-2 sm:mb-3">添加单个RSS链接</h3>
    <div class="flex flex-col sm:flex-row gap-2 sm:space-x-2">
      <input
        type="url"
        placeholder="https://example.com/feed.xml"
        bind:value={urlInput}
        onkeydown={handleKeydown}
        class="flex-1 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
      />
      <button
        onclick={handleAddUrl}
        disabled={!urlInput.trim()}
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm sm:text-base"
      >
        添加
      </button>
    </div>
  </div>
</div>
