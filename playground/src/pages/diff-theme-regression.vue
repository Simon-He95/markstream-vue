<script setup lang="ts">
import { ref } from 'vue'
import MarkdownRender from '../../../src/components/NodeRenderer'

type Appearance = 'light' | 'dark'

const isDark = ref(true)

const themes = ['vitesse-dark', 'vitesse-light']

function buildDiffMarkdown() {
  const original = [
    '{',
    '  "name": "markstream-vue",',
    '  "type": "module",',
    '  "version": "0.0.49",',
    '  "packageManager": "pnpm@10.16.1",',
    '  "description": "A Vue 3 component that renders Markdown string content as HTML, supporting custom components and advanced markdown features.",',
    '  "keywords": [',
    '    "vue",',
    '    "markdown",',
    '    "streaming",',
    '    "diff",',
    '    "preview"',
    '  ],',
    '  "exports": {',
    '    ".": "./dist/index.js"',
    '  },',
    '  "peerDependencies": {',
    '    "vue": ">=3.0.0"',
    '  },',
    '  "license": "MIT"',
    '}',
  ]

  const modified = [...original]
  modified[3] = '  "version": "0.0.54-beta.1",'
  modified[5] = '  "description": "A Vue 3 component that renders Markdown string content as HTML, supporting custom components, streaming diffs, and advanced markdown features.",'

  const max = Math.max(original.length, modified.length)
  const diffLines: string[] = []
  for (let i = 0; i < max; i++) {
    const left = original[i]
    const right = modified[i]
    if (left === right) {
      diffLines.push(left ?? '')
      continue
    }
    if (left != null)
      diffLines.push(`-${left}`)
    if (right != null)
      diffLines.push(`+${right}`)
  }

  return [
    '# Diff Theme Regression',
    '',
    '```diff json:package.json',
    ...diffLines,
    '```',
  ].join('\n')
}

const markdown = buildDiffMarkdown()

function setAppearance(next: Appearance) {
  isDark.value = next === 'dark'
}
</script>

<template>
  <div
    class="theme-regression-page"
    :class="isDark ? 'theme-regression-page--dark' : 'theme-regression-page--light'"
  >
    <div class="theme-regression-shell">
      <header class="theme-regression-toolbar">
        <div>
          <h1>Diff Theme Regression</h1>
          <p>Validates CodeBlockNode light/dark switching with metadata collapsed regions.</p>
        </div>

        <div class="theme-regression-actions">
          <button
            type="button"
            data-theme-toggle="light"
            :data-active="String(!isDark)"
            @click="setAppearance('light')"
          >
            Light
          </button>
          <button
            type="button"
            data-theme-toggle="dark"
            :data-active="String(isDark)"
            @click="setAppearance('dark')"
          >
            Dark
          </button>
        </div>
      </header>

      <section class="theme-regression-preview" data-testid="diff-theme-preview">
        <MarkdownRender
          :content="markdown"
          :is-dark="isDark"
          :themes="themes"
          code-block-dark-theme="vitesse-dark"
          code-block-light-theme="vitesse-light"
          :code-block-stream="false"
          :viewport-priority="false"
          :batch-rendering="false"
          :typewriter="false"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.theme-regression-page {
  min-height: 100vh;
  padding: 32px 20px 48px;
  transition: background-color 160ms ease, color 160ms ease;
}

.theme-regression-page--light {
  background: #f5f7fb;
  color: #0f172a;
}

.theme-regression-page--dark {
  background: #0b1220;
  color: #e2e8f0;
}

.theme-regression-shell {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  gap: 20px;
}

.theme-regression-toolbar,
.theme-regression-preview {
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  padding: 20px;
  backdrop-filter: blur(14px);
}

.theme-regression-page--light .theme-regression-toolbar,
.theme-regression-page--light .theme-regression-preview {
  background: rgba(255, 255, 255, 0.88);
}

.theme-regression-page--dark .theme-regression-toolbar,
.theme-regression-page--dark .theme-regression-preview {
  background: rgba(15, 23, 42, 0.82);
}

.theme-regression-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.theme-regression-toolbar h1 {
  margin: 0 0 8px;
  font-size: 28px;
  line-height: 1.1;
}

.theme-regression-toolbar p {
  margin: 0;
  opacity: 0.72;
}

.theme-regression-actions {
  display: inline-flex;
  gap: 10px;
}

.theme-regression-actions button {
  appearance: none;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: transparent;
  color: inherit;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.theme-regression-actions button[data-active="true"] {
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.28);
}

.theme-regression-preview {
  padding: 18px;
}
</style>
