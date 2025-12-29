<script setup lang="ts">
import { computed } from 'vue'

interface PreCodeNodeProps {
  node: any
}

const props = defineProps<PreCodeNodeProps>()

// Normalize language to a safe, lowercase token (fallback to 'plaintext')
const normalizedLanguage = computed(() => {
  const raw = String(props.node?.language ?? '')
  const head = String(String(raw).split(/\s+/g)[0] ?? '').toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
})

const languageClass = computed(() => `language-${normalizedLanguage.value}`)

const ariaLabel = computed(() => {
  const lang = normalizedLanguage.value
  return lang ? `Code block: ${lang}` : 'Code block'
})
</script>

<template>
  <pre
    :class="[languageClass]"
    :aria-busy="node.loading === true"
    :aria-label="ariaLabel"
    :data-language="normalizedLanguage"
    tabindex="0"
  ><code translate="no" v-text="node.code" /></pre>
</template>

<style>
/* Minimal, safe defaults to reduce flicker during frequent text updates */
.markstream-vue pre[class^='language-'],
.markstream-vue pre[class*=' language-'] {
  /* Ensure code layout is stable */
  white-space: pre;
  overflow: auto;
  tab-size: 2;
  font-variant-ligatures: none;
  /* Isolate painting/layout to this block to avoid ancestor reflow jank */
  contain: content;
  /* Hint GPU compositing on WebKit/Blink to reduce paint flashing */
  backface-visibility: hidden;
  transform: translateZ(0);
  -webkit-font-smoothing: antialiased;
}
.markstream-vue pre[class^='language-'] > code,
.markstream-vue pre[class*=' language-'] > code {
  display: block;
}

/* Keyboard accessibility: visible focus when scroll container is focused */
.markstream-vue pre[class^='language-']:focus,
.markstream-vue pre[class*=' language-']:focus {
  outline: 2px solid var(--vmdr-focus, #3b82f6);
  outline-offset: 2px;
}
</style>
