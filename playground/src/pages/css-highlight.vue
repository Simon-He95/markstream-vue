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
import { computed, onBeforeUnmount, ref } from 'vue'
import CssHighlightCodeBlock from '../../../src/components/CodeBlockNode/CssHighlightCodeBlock.vue'
import MarkdownRender from '../../../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../../../src/utils/nodeComponents'

const customId = 'playground-css-highlight'
const enabled = ref(true)
const isDark = ref(false)
const final = ref(true)
const content = ref('')
let timer: ReturnType<typeof setInterval> | undefined
let cursor = 0

const demoMarkdown = [
  '# CSS Custom Highlight playground',
  '',
  'The renderer keeps a plain `<pre>` while this answer streams, then enhances each supported code block after settle.',
  '',
  '```ts',
  'export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {',
  '  let timer: ReturnType<typeof setTimeout> | undefined',
  '  return (...args: Parameters<T>) => {',
  '    if (timer) clearTimeout(timer)',
  '    timer = setTimeout(() => fn(...args), wait)',
  '  }',
  '}',
  '```',
  '',
  '```python',
  'def fetch(url: str = "https://example.com#section"):',
  '    return requests.get(url, timeout=30)',
  '```',
  '',
  '```yaml',
  'endpoint: https://api.example.com/v1#users',
  'retries: 3',
  '```',
  '',
  '```brainfuck',
  '+++[>+++<-].',
  '```',
].join('\n')

const chunks = computed(() => demoMarkdown.match(/.{1,72}/gs) ?? [demoMarkdown])

function applyOverride() {
  if (enabled.value)
    setCustomComponents(customId, { code_block: CssHighlightCodeBlock })
  else
    removeCustomComponents(customId)
}

function toggleEnabled() {
  enabled.value = !enabled.value
  applyOverride()
}

function toggleStreaming() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
  cursor = 0
  content.value = ''
  final.value = false
  timer = setInterval(() => {
    content.value += chunks.value[cursor++] ?? ''
    if (cursor >= chunks.value.length) {
      clearInterval(timer)
      timer = undefined
      final.value = true
    }
  }, 70)
}

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}

applyOverride()
content.value = demoMarkdown
onBeforeUnmount(() => {
  if (timer)
    clearInterval(timer)
  removeCustomComponents(customId)
})
</script>

<template>
  <main class="css-highlight-demo" :class="{ dark: isDark }">
    <header class="hero">
      <p class="eyebrow">
        Experimental renderer
      </p>
      <h1>CSS Custom Highlight code blocks</h1>
      <p class="lede">
        Streaming stays plain, settle adds color through <code>::highlight()</code>, and theme changes only update the stylesheet.
      </p>
      <div class="controls">
        <button type="button" @click="toggleEnabled">
          {{ enabled ? 'CSS highlight: on' : 'CSS highlight: off' }}
        </button>
        <button type="button" @click="toggleStreaming">
          Replay streaming
        </button>
        <button type="button" @click="toggleDark">
          {{ isDark ? 'Light theme' : 'Dark theme' }}
        </button>
      </div>
      <p class="status">
        state: <strong>{{ final ? 'settled' : 'streaming' }}</strong> · blocks: 4 · unsupported-language fallback included
      </p>
    </header>

    <section class="preview" :class="{ dark: isDark }">
      <MarkdownRender
        :content="content"
        :final="final"
        :is-dark="isDark"
        :custom-id="customId"
        :smooth-streaming="true"
        :render-code-blocks-as-pre="true"
        :batch-rendering="false"
      />
    </section>
  </main>
</template>

<style scoped>
.css-highlight-demo { min-height: 100vh; padding: 40px clamp(20px, 5vw, 72px); color: #1f2937; background: #f8fafc; font-family: system-ui, sans-serif; }
.css-highlight-demo.dark { color: #e5e7eb; background: #0f172a; }
.hero { max-width: 860px; margin: 0 auto 24px; }
.eyebrow { margin: 0 0 8px; color: #6366f1; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(28px, 5vw, 48px); line-height: 1.1; }
.lede { max-width: 700px; color: #64748b; line-height: 1.6; }
.dark .lede, .dark .status { color: #94a3b8; }
.controls { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0 12px; }
button { border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 13px; color: inherit; background: white; cursor: pointer; }
.dark button { border-color: #475569; background: #1e293b; }
.status { color: #64748b; font-size: 13px; }
.preview { max-width: 860px; min-height: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 14px; background: white; }
.preview.dark { border-color: #334155; background: #111827; }
</style>
