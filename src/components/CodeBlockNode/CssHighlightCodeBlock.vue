<!--
  Licensed to the Apache Software Foundation (ASF) under one
  or more contributor license agreements.  See the NOTICE file
  distributed with this work for additional information
  regarding copyright ownership.  The ASF licenses this file
  to you under the Apache License, Version 2.0 (the
  "License"); you may not use this file except in compliance
  with the License.  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an
  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, either express or implied.  See the License for the
  specific language governing permissions and limitations
  under the License.
-->

<script setup lang="ts">
import type { CodeBlockNodeProps } from '../../types/component-props'
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { applyCssHighlights, cssHighlightStyleText, getCssHighlightBenchmarkMetrics, isCssHighlightLanguageSupported } from './cssHighlightAdapter'

defineOptions({ name: 'CssHighlightCodeBlock', inheritAttrs: false })

const props = withDefaults(defineProps<CodeBlockNodeProps>(), {
  loading: true,
  stream: true,
  isDark: false,
})

const codeElement = ref<HTMLElement | null>(null)
const enhanced = ref(false)
const unsupported = ref(false)
const instanceId = `poc-${getCurrentInstance()?.uid ?? Math.random().toString(36).slice(2)}`
let disposeHighlights: (() => void) | null = null
let styleElement: HTMLStyleElement | null = null
let generation = 0

const code = computed(() => String(props.node?.code ?? ''))
const language = computed(() => String(props.node?.language ?? 'plaintext').trim().toLowerCase())
const loading = computed(() => typeof props.node?.loading === 'boolean' ? props.node.loading : props.loading === true)

function clearHighlights() {
  disposeHighlights?.()
  disposeHighlights = null
  styleElement?.remove()
  styleElement = null
  enhanced.value = false
}

function updateThemeStyle() {
  if (styleElement)
    styleElement.textContent = cssHighlightStyleText(instanceId, props.isDark)
}

async function enhance() {
  const currentGeneration = ++generation
  clearHighlights()
  unsupported.value = false
  const metrics = getCssHighlightBenchmarkMetrics()
  metrics.enhanceCalls++
  if (loading.value) {
    metrics.streamingSkips++
    return
  }
  if (!code.value || typeof window === 'undefined')
    return
  if (!isCssHighlightLanguageSupported(language.value)) {
    unsupported.value = !['', 'plain', 'text', 'plaintext'].includes(language.value)
    return
  }

  await nextTick()
  if (currentGeneration !== generation || !codeElement.value)
    return

  const dispose = applyCssHighlights(codeElement.value, code.value, language.value, instanceId)
  if (!dispose) {
    unsupported.value = true
    return
  }
  if (currentGeneration !== generation) {
    dispose()
    return
  }
  disposeHighlights = dispose
  styleElement = document.createElement('style')
  styleElement.dataset.markstreamCssHighlight = instanceId
  styleElement.textContent = cssHighlightStyleText(instanceId, props.isDark)
  document.head.appendChild(styleElement)
  enhanced.value = true
}

watch([code, language, loading], () => void enhance(), { flush: 'post' })
watch(() => props.isDark, updateThemeStyle, { flush: 'post' })
onMounted(() => void enhance())
onBeforeUnmount(() => {
  generation++
  clearHighlights()
})
</script>

<template>
  <pre
    class="markstream-css-highlight-code"
    :data-markstream-css-highlight="enhanced ? 'true' : 'false'"
    :data-markstream-css-highlight-fallback="unsupported ? 'true' : undefined"
    :data-markstream-code-block-state="loading ? 'streaming' : 'settled'"
    :data-language="language"
  ><code ref="codeElement" v-text="code" /></pre>
</template>

<style scoped>
.markstream-css-highlight-code {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  overflow: auto;
  padding: 0.75rem 1rem;
  background: var(--markstream-code-fallback-bg, transparent);
  color: var(--markstream-code-fallback-fg, currentColor);
  font-family: var(--markstream-code-font-family, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: var(--markstream-code-font-size, 0.875rem);
  line-height: 1.5;
  tab-size: var(--markstream-code-tab-size, 4);
  white-space: pre;
}
</style>
