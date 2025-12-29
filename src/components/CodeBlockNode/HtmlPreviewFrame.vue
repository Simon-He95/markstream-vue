<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'

const props = defineProps<{
  code: string
  isDark?: boolean
  onClose?: () => void
  title?: string
}>()

const { t } = useSafeI18n()

const srcdoc = computed(() => {
  const base = props.code || ''
  // 如果用户已经自己写了 <html>/<body>，直接原样输出，避免重复包裹
  const lowered = base.trim().toLowerCase()
  if (lowered.startsWith('<!doctype') || lowered.startsWith('<html') || lowered.startsWith('<body'))
    return base

  const bg = props.isDark ? '#020617' : '#ffffff'
  const fg = props.isDark ? '#e5e7eb' : '#020617'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        background-color: ${bg};
        color: ${fg};
      }
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', ui-sans-serif, sans-serif;
      }
    </style>
  </head>
  <body>
    ${base}
  </body>
</html>`
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' || e.key === 'Esc')
    props.onClose?.()
}

onMounted(() => {
  if (typeof window !== 'undefined')
    window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  if (typeof window !== 'undefined')
    window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <teleport to="body">
    <div class="markstream-vue">
      <div class="html-preview-frame__backdrop" :class="{ 'html-preview-frame__backdrop--dark': props.isDark }" @click="props.onClose?.()">
        <div class="html-preview-frame" :class="{ 'html-preview-frame--dark': props.isDark }" @click.stop>
          <div class="html-preview-frame__header">
            <div class="html-preview-frame__title">
              <span class="html-preview-frame__dot" />
              <span class="html-preview-frame__label">{{ props.title || t('common.preview') || 'Preview' }}</span>
            </div>
            <button
              type="button"
              class="html-preview-frame__close"
              :class="{ 'html-preview-frame__close--dark': props.isDark }"
              @click="props.onClose?.()"
            >
              ×
            </button>
          </div>
          <iframe
            class="html-preview-frame__iframe"
            sandbox="allow-scripts allow-same-origin"
            :srcdoc="srcdoc"
          />
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.html-preview-frame__backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.html-preview-frame__backdrop--dark {
  background-color: rgba(15, 23, 42, 0.8);
}

.html-preview-frame {
  width: 80vw;
  max-width: 960px;
  height: 70vh;
  background-color: #fff;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
}

.html-preview-frame--dark {
  background-color: #020617;
  color: #e5e7eb;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
}

.html-preview-frame__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.html-preview-frame--dark .html-preview-frame__header {
  border-bottom-color: rgba(148, 163, 184, 0.35);
}

.html-preview-frame__title {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  opacity: 0.85;
}

.html-preview-frame__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background-color: #22c55e;
}

.html-preview-frame--dark .html-preview-frame__dot {
  background-color: #4ade80;
}

.html-preview-frame__label {
  white-space: nowrap;
}

.html-preview-frame__close {
  border: none;
  background: transparent;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.html-preview-frame__close--dark {
  color: #e5e7eb;
}

.html-preview-frame__iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

@media (max-width: 640px) {
  .html-preview-frame {
    width: 100vw;
    height: 80vh;
    border-radius: 0;
  }
}
</style>
