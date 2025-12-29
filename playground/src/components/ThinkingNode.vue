<script setup lang="ts">
import { MarkdownRender } from 'markstream-vue'

defineProps<{ node: {
  type: 'thinking'
  content: string
  children: any[]
  loading?: boolean
} }>()
</script>

<template>
  <div class="thinking-node p-4 my-4 bg-blue-50 dark:bg-blue-900/40 rounded-md border-l-4 border-blue-400 flex items-start gap-3">
    <div class="flex-shrink-0 mt-1">
      <!-- decorative thinking SVG icon -->
      <div class="w-9 h-9 rounded-full bg-blue-200 dark:bg-blue-700 flex items-center justify-center text-blue-700 dark:text-blue-100">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 3C7.03 3 3 6.58 3 11c0 1.86.66 3.57 1.77 4.98L4 21l5.2-1.9C10.06 19.35 11 19.5 12 19.5c4.97 0 9-3.58 9-8.5S16.97 3 12 3z" stroke="currentColor" stroke-width="0.8" fill="currentColor" opacity="0.9" />
        </svg>
      </div>
    </div>
    <div class="flex-1">
      <div class="flex items-baseline gap-3">
        <strong class="text-sm">Thinking</strong>
        <span class="text-xs text-slate-500 dark:text-slate-300">(assistant)</span>
        <!-- keep dots in DOM to avoid layout shift; toggle visibility with classes -->
        <span class="ml-2" aria-hidden="true">
          <span class="thinking-dots" :class="[node.loading ? 'visible' : 'hidden']" aria-hidden="true">
            <span class="dot dot-1" />
            <span class="dot dot-2" />
            <span class="dot dot-3" />
          </span>
        </span>
      </div>
      <div class="mt-1 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
        <!-- sr-only live region only present when loading to announce change -->
        <span v-if="node.loading" class="sr-only" aria-live="polite">Thinking…</span>
        <transition name="fade" mode="out-in">
          <div key="{{ node.loading ? 'loading' : 'ready' }}" class="content-area">
            <MarkdownRender :content="node.content" />
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-node {
  color: #0f172a;
}
.dark .thinking-node {
  color: #e6f0ff;
}

/* Animated dots for thinking state */
.thinking-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 36px;
  justify-content: flex-start;
  height: 12px; /* reserve vertical space so toggling doesn't collapse layout */
  transition: opacity 160ms linear, transform 160ms linear;
  opacity: 0;
}
.thinking-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #1e3a8a; /* blue-800 */
  opacity: 0.25;
  transform: translateY(0);
}
.thinking-dots.visible { opacity: 1; }
.thinking-dots.hidden { opacity: 0; transform: translateY(0); }
.thinking-dots.visible .dot-1 { animation: think-bounce 1s infinite ease-in-out; animation-delay: 0s }
.thinking-dots.visible .dot-2 { animation: think-bounce 1s infinite ease-in-out; animation-delay: 0.12s }
.thinking-dots.visible .dot-3 { animation: think-bounce 1s infinite ease-in-out; animation-delay: 0.24s }
.dark .thinking-dots .dot { background: #bfdbfe; opacity: 0.28 }

@keyframes think-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.25 }
  40% { transform: translateY(-6px); opacity: 1 }
}

/* ensure content area doesn't shift when dots appear */
.content-area { min-height: 1.25rem; }
.partial-content, .full-content { transition: opacity 140ms ease; }
.partial-content { opacity: 0.9 }
.full-content { opacity: 1 }

/* Vue transition classes for fade */
.fade-enter-from, .fade-leave-to { opacity: 0 }
.fade-enter-active, .fade-leave-active { transition: opacity 160ms ease }
.fade-enter-to, .fade-leave-from { opacity: 1 }
</style>
