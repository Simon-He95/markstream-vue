<script setup lang="ts">
/* eslint-disable vue/one-component-per-file */
import type { PropType } from 'vue'
import katex from 'katex'
import MarkdownRender, { enableKatex, setCustomComponents, setKaTeXWorker, setMermaidWorker } from 'markstream-vue'
import KatexWorker from 'markstream-vue/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-vue/workers/mermaidParser.worker?worker&inline'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue'

interface NodeLike {
  content?: string
  raw?: string
  code?: string
}

function createDiagramFallback(kind: string, label: string) {
  return defineComponent({
    name: `${label}SsrFallback`,
    props: {
      node: {
        type: Object as PropType<NodeLike>,
        required: true,
      },
    },
    setup(props) {
      return () => h('div', {
        'class': 'my-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-900',
        'data-ssr-fallback': kind,
        'data-markstream-mode': 'fallback',
      }, [
        h('div', {
          class: 'border-b border-slate-200 px-4 py-2 text-sm font-mono text-slate-600',
        }, `${label} fallback`),
        h('pre', {
          class: 'm-0 overflow-x-auto px-4 py-4 text-sm whitespace-pre-wrap',
        }, [
          h('code', String(props.node.code ?? props.node.raw ?? '')),
        ]),
      ])
    },
  })
}

const SsrBadgeNode = defineComponent({
  name: 'SsrBadgeNode',
  props: {
    node: {
      type: Object as PropType<NodeLike>,
      required: true,
    },
  },
  setup(props) {
    return () => h('span', {
      'class': 'inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700',
      'data-ssr-custom': 'badge',
    }, String(props.node.content ?? ''))
  },
})

const SsrMathInlineFallback = defineComponent({
  name: 'SsrMathInlineFallback',
  props: {
    node: {
      type: Object as PropType<NodeLike>,
      required: true,
    },
  },
  setup(props) {
    return () => h('span', {
      'class': 'font-mono text-sm text-slate-700',
      'data-ssr-fallback': 'math-inline',
      'data-markstream-mode': 'fallback',
    }, String(props.node.raw ?? props.node.content ?? ''))
  },
})

const SsrMathBlockFallback = defineComponent({
  name: 'SsrMathBlockFallback',
  props: {
    node: {
      type: Object as PropType<NodeLike>,
      required: true,
    },
  },
  setup(props) {
    return () => h('pre', {
      'class': 'm-0 overflow-x-auto rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-left text-sm whitespace-pre-wrap text-slate-900',
      'data-ssr-fallback': 'math-block',
      'data-markstream-mode': 'fallback',
    }, String(props.node.raw ?? props.node.content ?? ''))
  },
})

const SsrMermaidFallback = createDiagramFallback('mermaid', 'Mermaid')
const SsrD2Fallback = createDiagramFallback('d2', 'D2')
const SsrInfographicFallback = createDiagramFallback('infographic', 'Infographic')

const BASIC_SCOPE = 'ssr-lab-basic'
const FALLBACK_SCOPE = 'ssr-lab-disabled'

setCustomComponents(BASIC_SCOPE, {
  'ssr-badge': SsrBadgeNode,
})

setCustomComponents(FALLBACK_SCOPE, {
  math_inline: SsrMathInlineFallback,
  math_block: SsrMathBlockFallback,
  mermaid: SsrMermaidFallback,
  d2: SsrD2Fallback,
  infographic: SsrInfographicFallback,
})

enableKatex(() => katex)

if (process.client) {
  import('markstream-vue').then(({ getStreamDiffsRuntime }) => getStreamDiffsRuntime()).catch(() => {})
  setKaTeXWorker(new KatexWorker())
  setMermaidWorker(new MermaidWorker())
}

const basicMarkdown = `
# SSR Basic Coverage

Inline HTML stays visible: <mark data-ssr-inline-html="1">inline html</mark>.

Trusted custom tag: <ssr-badge>Custom HTML tag rendered on the server</ssr-badge>

> Blockquote content should be present in the first HTML response.

- [x] Checklist survives SSR
- [ ] Pending item stays visible

| Name | Role |
| --- | --- |
| Simon | Maintainer |
| Markstream | Renderer |

Footnotes also render on the server.[^1]

![Markstream icon](/vue-markdown-icon.svg "Markstream icon")

<div class="rounded border border-slate-200 bg-slate-50 px-3 py-2" data-ssr-html-block="1">
  <strong>HTML block</strong> content is already present in SSR output.
</div>

[^1]: Footnote content is part of the server HTML.
`.trim()

const enhancedMarkdown = `
# SSR Enhanced Coverage

Inline math renders to KaTeX: $E = mc^2$.

Block math should already be HTML:

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

\`\`\`diff
--- a/file.txt
+++ b/file.txt
@@
- old line
+ new line
\`\`\`

\`\`\`ts
export const greet = (name: string) => \`hello \${name}\`
\`\`\`

\`\`\`mermaid
graph TD
  Start --> Render
  Render --> Hydrate
\`\`\`

\`\`\`d2
client: Browser
server: SSR
client -> server: request
server -> client: html
\`\`\`

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label SSR
      desc First paint
    - label Hydration
      desc Attach interactivity
    - label Enhanced
      desc Rich preview
\`\`\`
`.trim()

const fallbackMarkdown = `
# Disabled Enhancements

Inline math fallback: $a^2 + b^2 = c^2$.

$$
\\sum_{n=1}^{3} n = 6
$$

\`\`\`mermaid
graph LR
  Raw --> Stable
\`\`\`

\`\`\`d2
stable -> fallback
\`\`\`

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label Disabled
      desc Static fallback
    - label Stable
      desc SSR-friendly
\`\`\`
`.trim()

const hydrated = ref(false)
const status = ref({
  code: false,
  math: false,
  mermaid: false,
  d2: false,
  infographic: false,
})

let statusTimer: ReturnType<typeof setInterval> | null = null

function updateStatus() {
  if (typeof document === 'undefined')
    return
  status.value = {
    code: !!document.querySelector('[data-ssr-case="enhanced"] [data-markstream-code-block="1"][data-markstream-enhanced="true"]'),
    math: !!document.querySelector('[data-ssr-case="enhanced"] [data-markstream-math][data-markstream-mode="katex"] .katex'),
    mermaid: !!document.querySelector('[data-ssr-case="enhanced"] [data-markstream-mermaid="1"][data-markstream-mode="preview"] ._mermaid svg'),
    d2: !!document.querySelector('[data-ssr-case="enhanced"] [data-markstream-d2="1"][data-markstream-mode="preview"] svg.markstream-d2-root-svg'),
    infographic: !!document.querySelector('[data-ssr-case="enhanced"] [data-markstream-infographic="1"][data-markstream-mode="preview"] svg'),
  }
}

const readyCount = computed(() => Object.values(status.value).filter(Boolean).length)

onMounted(() => {
  hydrated.value = true
  updateStatus()
  statusTimer = setInterval(updateStatus, 250)
})

onBeforeUnmount(() => {
  if (statusTimer)
    clearInterval(statusTimer)
})
</script>

<template>
  <main class="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc,white_55%)] px-4 py-10 text-slate-900 sm:px-6">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header class="rounded-3xl border border-slate-200 bg-white/90 px-6 py-6 shadow-sm backdrop-blur">
        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          markstream-vue / Nuxt SSR
        </p>
        <div class="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <h1 class="text-3xl font-semibold tracking-tight text-slate-950">
              SSR Lab
            </h1>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              This route exists to verify first-response HTML, hydration stability, and rich-node enhancement in one fixed Nuxt page.
            </p>
          </div>
          <div
            class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            data-ssr-case="hydration"
            :data-ssr-hydrated="hydrated ? 'true' : 'false'"
          >
            <div class="font-medium text-slate-700">
              Hydration status
            </div>
            <div class="mt-1 text-slate-600">
              Hydrated: <span data-ssr-status="hydrated">{{ hydrated ? 'yes' : 'no' }}</span>
            </div>
            <div class="text-slate-600">
              Enhanced widgets ready: <span data-ssr-status="ready-count">{{ readyCount }}</span>/5
            </div>
          </div>
        </div>
      </header>

      <section data-ssr-case="basic" class="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <div class="mb-4">
          <h2 class="text-xl font-semibold text-slate-950">
            Basic markdown and HTML
          </h2>
          <p class="mt-1 text-sm text-slate-600">
            Titles, lists, tables, footnotes, HTML inline/block, custom tags, and images must all be present in the raw SSR response.
          </p>
        </div>
        <MarkdownRender
          :content="basicMarkdown"
          :final="true"
          :custom-html-tags="['ssr-badge']"
          :custom-id="BASIC_SCOPE"
        />
      </section>

      <section data-ssr-case="enhanced" class="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <div class="mb-4">
          <h2 class="text-xl font-semibold text-slate-950">
            Rich nodes with client enhancement
          </h2>
          <p class="mt-1 text-sm text-slate-600">
            SSR should send readable HTML immediately, then upgrade math, code, Mermaid, D2, and Infographic after hydration.
          </p>
        </div>
        <MarkdownRender
          :content="enhancedMarkdown"
          :final="true"
        />
      </section>

      <section data-ssr-case="fallback" class="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <div class="mb-4">
          <h2 class="text-xl font-semibold text-slate-950">
            Disabled enhancement fallback
          </h2>
          <p class="mt-1 text-sm text-slate-600">
            This section simulates unavailable heavy peers through scoped custom overrides so SSR fallback stays stable on the same page.
          </p>
        </div>
        <MarkdownRender
          :content="fallbackMarkdown"
          :final="true"
          :custom-id="FALLBACK_SCOPE"
        />
      </section>

      <section class="rounded-3xl border border-slate-200 bg-slate-950 px-6 py-6 text-slate-100 shadow-sm">
        <h2 class="text-xl font-semibold">
          What the e2e checks
        </h2>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>The raw HTML for <code>/ssr-lab</code> already contains the basic content and SSR fallbacks.</li>
          <li>Hydration flips the status card to <code>yes</code> without Vue mismatch warnings.</li>
          <li>Enhanced widgets become ready in the rich-node section while the disabled section stays in fallback mode.</li>
        </ul>
      </section>
    </div>
  </main>
</template>
