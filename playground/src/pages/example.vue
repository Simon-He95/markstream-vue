<script setup lang="ts">
import { ref } from 'vue'
import CodeBlockNode from '../../../src/components/CodeBlockNode'
import MarkdownRender from '../../../src/components/NodeRenderer'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import 'katex/dist/katex.min.css'

// Workers
setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
import('../../../src/components/CodeBlockNode/streamDiffs').then(({ getStreamDiffsRuntime }) => getStreamDiffsRuntime()).catch(() => {})

const isDark = ref(
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
)
// Sync initial state to DOM
if (isDark.value)
  document.documentElement.classList.add('dark')

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}

const activeTheme = ref('')
const themeList = [
  '',
  'airbnb',
  'airtable',
  'apple',
  'bmw',
  'cal',
  'claude',
  'clay',
  'clickhouse',
  'cohere',
  'coinbase',
  'composio',
  'cursor',
  'elevenlabs',
  'expo',
  'figma',
  'framer',
  'hashicorp',
  'ibm',
  'intercom',
  'kraken',
  'linear',
  'lovable',
  'minimax',
  'mintlify',
  'miro',
  'mistral',
  'mongodb',
  'notion',
  'nvidia',
  'ollama',
  'opencode-ai',
  'pinterest',
  'posthog',
  'raycast',
  'replicate',
  'resend',
  'revolut',
  'runwayml',
  'sanity',
  'sentry',
  'spacex',
  'spotify',
  'stripe',
  'supabase',
  'superhuman',
  'together-ai',
  'uber',
  'vercel',
  'voltagent',
  'warp',
  'webflow',
  'wise',
  'x-ai',
  'zapier',
]

// ── Color palette data ──
const palette = [
  {
    title: 'Neutral',
    tokens: [
      { name: 'background', bg: '--ms-background', fg: '--ms-foreground' },
      { name: 'muted', bg: '--ms-muted', fg: '--ms-muted-foreground' },
      { name: 'secondary', bg: '--ms-secondary', fg: '--ms-secondary-foreground' },
      { name: 'accent', bg: '--ms-accent', fg: '--ms-accent-foreground' },
      { name: 'border', bg: '--ms-border', fg: '--ms-foreground' },
      { name: 'muted-fg', bg: '--ms-muted-foreground', fg: '--ms-background' },
      { name: 'foreground', bg: '--ms-foreground', fg: '--ms-background' },
    ],
  },
  {
    title: 'Signal',
    tokens: [
      { name: 'info', bg: '--ms-info', fg: '--ms-info-foreground' },
      { name: 'success', bg: '--ms-success', fg: '--ms-success-foreground' },
      { name: 'warning', bg: '--ms-warning', fg: '--ms-warning-foreground' },
      { name: 'destructive', bg: '--ms-destructive', fg: '--ms-destructive-foreground' },
    ],
  },
  {
    title: 'Content',
    tokens: [
      { name: 'highlight', bg: '--ms-highlight', fg: '--ms-highlight-foreground' },
      { name: 'diff-added', bg: '--ms-diff-added', fg: '--ms-background' },
      { name: 'diff-removed', bg: '--ms-diff-removed', fg: '--ms-background' },
    ],
  },
]

// stream-diffs code block node
const shikiNode = {
  type: 'code_block' as const,
  language: 'typescript',
  code: `import { createApp } from 'vue'
import { setIconTheme } from 'markstream-vue'

setIconTheme('material')

createApp(App)
  .mount('#app')`,
  raw: '',
}

const presets = [
  { id: 'default', label: 'Default', desc: 'Polished Editorial — 16px, 1.75 line-height, warm reading rhythm' },
  { id: 'compact', label: 'Compact', desc: 'AI chat / dashboard — 14px, 1.5 line-height, tight spacing' },
] as const

const activePreset = ref<string>('default')

// Static markdown covering all component types
const content = `# Heading Level 1

## Heading Level 2

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

---

## Paragraphs & Inline Elements

This is a regular paragraph with **bold text**, *italic text*, ~~strikethrough~~, ==highlighted text==, \`inline code\`, and a [link to GitHub](https://github.com). Here is a footnote reference[^1].

Text with <sub>subscript</sub> and <sup>superscript</sup> and <ins>inserted text</ins>.

Another paragraph to show the vertical rhythm between blocks. Good typography creates a sense of order and hierarchy. The spacing between paragraphs should feel intentional — neither too tight nor too loose. Line height matters just as much as font size.

---

## Inline Code

Use \`npm install\` to install dependencies. The \`--save-dev\` flag marks it as a dev dependency.

In TypeScript, use \`Record<string, unknown>\` for generic object types. The \`Partial<T>\` utility makes all properties optional. You can combine them: \`Partial<Record<string, unknown>>\`.

The config file exports a \`defineConfig()\` function. Set \`mode: 'production'\` for optimized builds. Environment variables are accessed via \`import.meta.env.VITE_API_URL\`.

---

## Blockquote

> This is a blockquote. It can contain **bold**, *italic*, and \`code\`.
>
> > Nested blockquotes are also supported.

---

## Lists

### Unordered List

- First item
- Second item with **bold**
  - Nested item A
  - Nested item B
    - Deep nested
- Third item

### Ordered List

1. First step
2. Second step
   1. Sub-step 2.1
   2. Sub-step 2.2
3. Third step

### Task List

- [x] Completed task
- [ ] Incomplete task
- [x] Another done task

---

## Code Blocks

### JavaScript

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

console.log(fibonacci(10)); // 55
\`\`\`

### TypeScript with Title

\`\`\`typescript title="utils/theme.ts"
interface ThemeConfig {
  primary: string;
  secondary: string;
  background: string;
  foreground: string;
}

export function createTheme(config: Partial<ThemeConfig>): ThemeConfig {
  return {
    primary: '#0366d6',
    secondary: '#586069',
    background: '#ffffff',
    foreground: '#24292e',
    ...config,
  };
}
\`\`\`

### Shell

\`\`\`bash
npm install markstream-vue
pnpm dev
\`\`\`

---

## Table

### Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Color tokens | Done | 25 components migrated |
| Dark mode | Done | Bridge tokens + \`.dark\` class |
| Spacing tokens | Done | Flow, inset, gap, size tokens |
| Shell extraction | Done | \`CodeBlockShell.vue\` |
| Visual redesign | Not started | Core **#343** deliverable |

### Performance Benchmarks

| Metric | v1.0 | v2.0 | Change |
|--------|-----:|-----:|-------:|
| Bundle size (gzip) | 48.2 KB | 32.7 KB | −32% |
| First render | 120 ms | 45 ms | −62% |
| Re-render | 18 ms | 6 ms | −67% |
| Memory usage | 12.4 MB | 8.1 MB | −35% |
| Lighthouse score | 72 | 94 | +31% |
| Test coverage | 68% | 91% | +34% |
| Components | 18 | 25 | +39% |
| CSS tokens | 0 | 82 | — |

### Compact Table

| Key | Value |
|-----|-------|
| License | MIT |
| Runtime | Vue 3 |

---

## Admonitions

::: note
This is a note admonition. Useful for additional information.
:::

::: tip
This is a tip. Helpful advice for the reader.
:::

::: warning
This is a warning. Pay attention to this.
:::

::: danger
This is a danger notice. Something could go wrong.
:::

---

## Math

### Inline Math

The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ and Euler's identity: $e^{i\\pi} + 1 = 0$.

### Block Math

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

---

## Images

![Vue Logo](https://vuejs.org/images/logo.png)

---

## Mermaid Diagram

\`\`\`mermaid
graph LR
  A[Token System] --> B[Bridge Tokens]
  A --> C[Semantic Tokens]
  B --> D[shadcn compat]
  B --> E[Fallback defaults]
  C --> F[Component styles]
  F --> G[Light/Dark auto]
\`\`\`

---

## Infographic

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label Components
      desc 25 migrated to tokens
    - label Tokens
      desc 82 semantic variables
    - label Icon Theme
      desc Material default
    - label Test Pass
      desc 1029 passing
\`\`\`

---

## Definition List

Term 1
: Definition for term 1. This explains what term 1 means.

Term 2
: Definition for term 2. Can contain **formatting**.

---

## Footnotes

[^1]: This is the footnote content. It appears at the bottom.

---

*End of static example — compare typography presets using the buttons above.*
`
</script>

<template>
  <div
    class="markstream-vue min-h-screen bg-[hsl(var(--ms-background))] text-[hsl(var(--ms-foreground))] transition-colors"
    :class="[activePreset, { dark: isDark }]"
    :data-theme="activeTheme || undefined"
  >
    <header class="sticky top-0 z-50 flex flex-wrap items-center gap-3 px-6 py-2.5 border-b border-[hsl(var(--ms-border))] bg-[hsl(var(--ms-background))] backdrop-blur-sm">
      <span class="text-sm font-semibold mr-2">Typography</span>
      <button
        v-for="preset in presets"
        :key="preset.id"
        class="px-2.5 py-1 text-xs rounded-md border cursor-pointer transition-colors"
        :class="activePreset === preset.id
          ? 'bg-[hsl(var(--ms-primary))] text-[hsl(var(--ms-primary-foreground))] border-transparent'
          : 'bg-transparent text-inherit border-[hsl(var(--ms-border))] hover:bg-[hsl(var(--ms-accent))]'"
        :title="preset.desc"
        @click="activePreset = preset.id"
      >
        {{ preset.label }}
      </button>
      <div class="ml-auto flex items-center gap-3">
        <select
          v-model="activeTheme"
          class="px-2 py-1 text-xs border border-[hsl(var(--ms-border))] rounded-md bg-[hsl(var(--ms-background))] text-inherit cursor-pointer"
        >
          <option value="">
            Default
          </option>
          <option v-for="t in themeList.filter(Boolean)" :key="t" :value="t">
            {{ t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ') }}
          </option>
        </select>
        <button
          class="px-2.5 py-1 text-xs border border-[hsl(var(--ms-border))] rounded-md bg-transparent text-inherit cursor-pointer hover:bg-[hsl(var(--ms-accent))] transition-colors"
          @click="toggleDark"
        >
          {{ isDark ? 'Light' : 'Dark' }}
        </button>
        <router-link to="/" class="text-xs text-[var(--link-color)] no-underline hover:underline">
          &larr; Playground
        </router-link>
      </div>
    </header>

    <main class="example-content mx-auto px-6 py-8">
      <div class="mb-4 text-xs text-[hsl(var(--ms-muted-foreground))]">
        <strong>{{ presets.find(p => p.id === activePreset)?.label }}</strong> — {{ presets.find(p => p.id === activePreset)?.desc }}
      </div>

      <!-- Color Palette -->
      <section class="palette-section">
        <h2 class="palette-title">
          Color Palette
        </h2>
        <div v-for="group in palette" :key="group.title" class="palette-group">
          <h3 class="palette-group-title">
            {{ group.title }}
          </h3>
          <div class="palette-row">
            <div v-for="token in group.tokens" :key="token.name" class="palette-item">
              <div
                class="palette-swatch"
                :style="{
                  backgroundColor: `hsl(var(${token.bg}))`,
                  color: `hsl(var(${token.fg}))`,
                }"
              >
                Aa
              </div>
              <span class="palette-label">{{ token.name }}</span>
              <span class="palette-var">{{ token.bg.replace('--ms-', '') }}</span>
            </div>
          </div>
        </div>
      </section>

      <hr class="palette-divider">

      <MarkdownRender
        :content="content"
        :is-dark="isDark"
        :loading="false"
        :stream="false"
        :data-theme="activeTheme || undefined"
        :code-block-props="{
          showHeader: true,
          showCopyButton: true,
          showCollapseButton: true,
          showExpandButton: true,
        }"
      />

      <!-- stream-diffs code block -->
      <h2 class="text-xl font-semibold mt-8 mb-4">
        Code Block
      </h2>
      <CodeBlockNode
        :node="shikiNode"
        :is-dark="isDark"
        :loading="false"
        :stream="false"
        index-key="shiki-demo"
        :show-header="true"
        :show-copy-button="true"
        :show-collapse-button="true"
      />
    </main>
  </div>
</template>

<style>
/*
 * "default" uses the library's built-in token defaults (Polished Editorial).
 * "compact" overrides tokens for high-density AI chat / dashboard use.
 */

/* ================================================================
   COMPACT — AI chat / dashboard / sidebar
   ~60% of default spacing. Tighter typography and rhythm.
   ================================================================ */
.markstream-vue.compact,
.compact .markstream-vue {
  /* Typography — smaller, tighter */
  --ms-text-body: 0.875rem;
  --ms-leading-body: 1.5;
  --ms-text-h1: 1.375rem;
  --ms-text-h2: 1.125rem;
  --ms-text-h3: 1rem;
  --ms-text-h4: 0.875rem;
  --ms-text-h5: 0.8125rem;
  --ms-text-h6: 0.8125rem;
  --ms-text-label: 0.6875rem;
  --ms-action-btn-padding: 0.25rem;
  --ms-action-btn-icon: 0.75rem;

  /* Heading rhythm — compressed */
  --ms-flow-heading-1-mt: 0;
  --ms-flow-heading-1-mb: 0.3em;
  --ms-flow-heading-2-mt: 1.25em;
  --ms-flow-heading-2-mb: 0.25em;
  --ms-flow-heading-3-mt: 1em;
  --ms-flow-heading-3-mb: 0.2em;
  --ms-flow-heading-4-mt: 0.8em;
  --ms-flow-heading-4-mb: 0.15em;
  --ms-flow-heading-5-mt: 0.6em;
  --ms-flow-heading-5-mb: 0.1em;
  --ms-flow-heading-6-mt: 0.5em;
  --ms-flow-heading-6-mb: 0.1em;

  /* Flow spacing — tighter */
  --ms-flow-paragraph-y: 0.625em;
  --ms-flow-list-y: 0.5em;
  --ms-flow-list-item-y: 0.125em;
  --ms-flow-list-indent: 1.25em;
  --ms-flow-table-y: 0.625em;
  --ms-flow-table-cell: 0.2em 0.4em;
  --ms-flow-blockquote-y: 0.625em;
  --ms-flow-blockquote-indent: 0.75em;
  --ms-flow-admonition-y: 0.5em;
  --ms-flow-footnote-y: 0.25em;
  --ms-flow-hr-y: 1.25em;
  --ms-flow-diagram-y: 0.625em;
  --ms-flow-codeblock-y: 0.625em;
  --ms-flow-definition-term-mt: 0.25em;
  --ms-flow-definition-desc-ml: 0.75em;
  --ms-flow-definition-desc-mb: 0.25em;

  /* Panel insets — smaller */
  --ms-inset-panel-x: 0.5rem;
  --ms-inset-panel-y: 0.25rem;
  --ms-inset-panel-body-sm: 0.125rem;
  --ms-inset-panel-body: 0.5rem;
  --ms-inset-admonition-body-top: 0.25rem;
  --ms-inset-admonition-body-bottom: 0.375rem;

  /* Gaps — tighter */
  --ms-gap-header: 0.5rem;
  --ms-gap-header-main: 0.375rem;
  --ms-gap-header-actions: 0.25rem;

  /* Sizes — smaller */
  --ms-size-diagram-min-height: 280px;
  --ms-size-code-max-height: 420px;
  --ms-size-skeleton-min-height: 80px;

  /* Animation — faster */
  --ms-duration-standard: 140ms;
  --ms-duration-overlay: 160ms;
}

/* Compact content width: full width for demo */
.compact .example-content { max-width: 100%; padding: 1rem; }

/* ── Color Palette ── */
.palette-section {
  margin-bottom: 2rem;
}
.palette-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1.25rem;
  color: hsl(var(--ms-foreground));
}
.palette-group {
  margin-bottom: 1.25rem;
}
.palette-group-title {
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(var(--ms-muted-foreground));
  margin-bottom: 0.5rem;
}
.palette-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.palette-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 4.5rem;
}
.palette-swatch {
  width: 4.5rem;
  height: 3.25rem;
  border-radius: 0.5rem;
  border: 1px solid hsl(var(--ms-border));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: var(--ms-font-sans);
  transition: transform 0.15s ease;
}
.palette-swatch:hover {
  transform: scale(1.08);
}
.palette-label {
  font-size: 0.6875rem;
  font-weight: 500;
  margin-top: 0.375rem;
  color: hsl(var(--ms-foreground));
}
.palette-var {
  font-size: 0.5625rem;
  color: hsl(var(--ms-muted-foreground));
  font-family: var(--ms-font-mono);
}
.palette-divider {
  border: none;
  border-top: 1px solid hsl(var(--ms-border));
  margin: 2rem 0;
}
</style>
