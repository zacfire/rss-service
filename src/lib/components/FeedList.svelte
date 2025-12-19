<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Feed {
    id: string;
    url: string;
    title: string;
    publisher: string;
    status: 'pending' | 'valid' | 'invalid';
    errorMessage?: string;
    isEnabled: boolean;
  }

  interface Props {
    feeds: Feed[];
    canEnableMore?: boolean;
    ontoggle?: (event: CustomEvent<{ id: string }>) => void;
    ondelete?: (event: CustomEvent<{ id: string }>) => void;
    onretry?: (event: CustomEvent<{ id: string }>) => void;
  }

  let { feeds, canEnableMore = true, ontoggle, ondelete, onretry }: Props = $props();

  const dispatch = createEventDispatcher<{
    toggle: { id: string };
    delete: { id: string };
    retry: { id: string };
  }>();

  function handleToggle(id: string) {
    dispatch('toggle', { id });
    ontoggle?.({ detail: { id } } as CustomEvent<{ id: string }>);
  }

  function handleDelete(id: string) {
    dispatch('delete', { id });
    ondelete?.({ detail: { id } } as CustomEvent<{ id: string }>);
  }

  function handleRetry(id: string) {
    dispatch('retry', { id });
    onretry?.({ detail: { id } } as CustomEvent<{ id: string }>);
  }

  function getStatusIcon(status: Feed['status']) {
    switch (status) {
      case 'valid':
        return '✓';
      case 'invalid':
        return '✗';
      case 'pending':
        return '...';
    }
  }

  function getStatusColor(status: Feed['status']) {
    switch (status) {
      case 'valid':
        return 'text-green-600';
      case 'invalid':
        return 'text-red-600';
      case 'pending':
        return 'text-yellow-600';
    }
  }
</script>

<div class="space-y-2 max-h-96 overflow-y-auto">
  {#if feeds.length === 0}
    <div class="text-center py-8 text-gray-500">
      暂无RSS源
    </div>
  {:else}
    {#each feeds as feed (feed.id)}
      <div
        class="flex items-center justify-between p-3 rounded-lg border {feed.isEnabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}"
      >
        <div class="flex items-center space-x-3 flex-1 min-w-0">
          <!-- Checkbox -->
          <input
            type="checkbox"
            checked={feed.isEnabled}
            onchange={() => handleToggle(feed.id)}
            disabled={feed.status === 'invalid'}
            class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
          />

          <!-- Status Icon -->
          <span class="w-6 text-center {getStatusColor(feed.status)}">
            {#if feed.status === 'pending'}
              <svg class="animate-spin h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
            {:else}
              {getStatusIcon(feed.status)}
            {/if}
          </span>

          <!-- Feed Info -->
          <div class="flex-1 min-w-0">
            <div class="font-medium text-gray-900 truncate">
              {feed.title || '未知标题'}
            </div>
            <div class="text-sm text-gray-500 truncate">
              {feed.publisher || feed.url}
            </div>
            {#if feed.status === 'invalid' && feed.errorMessage}
              <div class="text-xs text-red-500 mt-1">
                {feed.errorMessage}
              </div>
            {/if}
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center space-x-2 ml-2">
          {#if feed.status === 'invalid'}
            <button
              onclick={() => handleRetry(feed.id)}
              class="p-1 text-gray-400 hover:text-blue-600"
              title="重试验证"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          {/if}
          <button
            onclick={() => handleDelete(feed.id)}
            class="p-1 text-gray-400 hover:text-red-600"
            title="删除"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    {/each}
  {/if}
</div>
