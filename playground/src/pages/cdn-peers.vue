<script setup lang="ts">
import { Icon } from '@iconify/vue'
import MarkdownRender, {
  clearKaTeXWorker,
  clearMermaidWorker,
  createKaTeXWorkerFromCDN,
  createMermaidWorkerFromCDN,
  enableKatex,
  enableMermaid,
  setKatexLoader,
  setKaTeXWorker,
  setMermaidLoader,
  setMermaidWorker,
} from '../../../src/exports'

type Mode = 'cdn' | 'local'

const router = useRouter()
const mode = useLocalStorage<Mode>('vmr-playground-peers-mode', 'cdn')
const isDark = useDark()
const toggleTheme = useToggle(isDark)

const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const statusDetail = ref<string>('')
const renderKey = ref(0)

const hasWindowKatex = computed(() => !!(globalThis as any)?.katex)
const hasWindowMermaid = computed(() => !!(globalThis as any)?.mermaid)

const content = ref<string>(`# CDN peers demo

This page demonstrates running **KaTeX + Mermaid** with CDN-loaded peers, including worker injection.

## Math

Inline: $E=mc^2$, $a^2+b^2=c^2$.

Block:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$

## Mermaid

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant W as Worker
  participant M as Mermaid
  U->>W: offthread parse
  W-->>U: ok + prefix
  U->>M: render
\`\`\`
`)

let katexDispose: (() => void) | null = null
let mermaidDispose: (() => void) | null = null

function loadCssOnce(href: string) {
  if (typeof document === 'undefined')
    return Promise.resolve()
  const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`) as HTMLLinkElement | null
  if (existing)
    return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = () => resolve()
    link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`))
    document.head.appendChild(link)
  })
}

const scriptPromises = new Map<string, Promise<void>>()
function loadScriptOnce(src: string) {
  if (typeof document === 'undefined')
    return Promise.resolve()
  const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
  if (existing)
    return Promise.resolve()
  const cached = scriptPromises.get(src)
  if (cached)
    return cached
  const p = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(script)
  })
  scriptPromises.set(src, p)
  return p
}

async function setupLocal() {
  // Workers (bundled by Vite)
  const [{ default: KatexWorker }, { default: MermaidWorker }] = await Promise.all([
    import('../../../src/workers/katexRenderer.worker?worker&inline'),
    import('../../../src/workers/mermaidParser.worker?worker&inline'),
  ])
  setKaTeXWorker(new (KatexWorker as any)())
  setMermaidWorker(new (MermaidWorker as any)())

  // Default loaders (package-installed peers)
  enableKatex()
  enableMermaid()

  // Use CDN CSS to keep this page independent from local node_modules imports.
  await loadCssOnce('https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css')
}

async function setupCdn() {
  // Always reset workers & loaders on mode switch (important if imports already failed once)
  setKatexLoader(() => (globalThis as any)?.katex)
  setMermaidLoader(() => (globalThis as any)?.mermaid)

  // Load main-thread peers via CDN globals
  await Promise.all([
    loadCssOnce('https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css'),
    loadScriptOnce('https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js')
      .then(() => loadScriptOnce('https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/mhchem.min.js')),
    loadScriptOnce('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'),
  ])

  // Ensure UMD globals are actually available (script load can succeed but global may be missing due to CSP/misconfigured CDN).
  if (!(globalThis as any)?.katex)
    throw new Error('KaTeX CDN loaded but window.katex is missing')
  if (!(globalThis as any)?.mermaid)
    throw new Error('Mermaid CDN loaded but window.mermaid is missing')

  // Re-enable after scripts are available to guarantee caches are reset.
  enableKatex(() => (globalThis as any)?.katex)
  enableMermaid(() => (globalThis as any)?.mermaid)

  // Inject CDN workers (no bundler required)
  const katex = createKaTeXWorkerFromCDN({
    mode: 'classic',
    katexUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js',
    mhchemUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/mhchem.min.js',
  })
  katexDispose = katex.dispose
  if (katex.worker)
    setKaTeXWorker(katex.worker)

  const mermaid = createMermaidWorkerFromCDN({
    mode: 'module',
    mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
  })
  mermaidDispose = mermaid.dispose
  if (mermaid.worker)
    setMermaidWorker(mermaid.worker)
}

async function applyMode(next: Mode) {
  status.value = 'loading'
  statusDetail.value = ''

  try {
    // Clean old workers
    clearKaTeXWorker()
    clearMermaidWorker()
    try {
      katexDispose?.()
    }
    catch {}
    try {
      mermaidDispose?.()
    }
    catch {}
    katexDispose = null
    mermaidDispose = null

    if (next === 'cdn')
      await setupCdn()
    else
      await setupLocal()

    status.value = 'ready'
    statusDetail.value = next === 'cdn'
      ? 'CDN scripts + CDN workers injected.'
      : 'Local Vite workers injected.'
    renderKey.value++
  }
  catch (e: any) {
    status.value = 'error'
    statusDetail.value = e?.message ?? String(e)
  }
}

watch(
  () => mode.value,
  (m) => {
    applyMode(m)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  try {
    katexDispose?.()
  }
  catch {}
  try {
    mermaidDispose?.()
  }
  catch {}
})

function goHome() {
  router.push('/').catch(() => {
    window.location.href = '/'
  })
}
</script>

<template>
  <div class="cdn-peers-page min-h-screen" :class="{ dark: isDark }">
    <div class="cdn-peers-bg absolute inset-0 -z-10" />

    <div class="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8 space-y-4 sm:space-y-5">
      <header class="cdn-peers-header sticky top-3 z-10">
        <div class="cdn-peers-header-inner flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button class="cdn-btn" @click="goHome">
              <Icon icon="carbon:arrow-left" class="h-4 w-4" />
              Back
            </button>
            <div class="flex flex-col leading-tight">
              <h2 class="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-50">
                CDN peers demo
              </h2>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                KaTeX + Mermaid, CDN scripts + CDN workers
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button class="cdn-btn" @click="toggleTheme()">
              <Icon :icon="isDark ? 'carbon:moon' : 'carbon:sun'" class="h-4 w-4" />
              Theme
            </button>
          </div>
        </div>
      </header>

      <section class="cdn-card">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Mode</span>
            <div class="cdn-segment">
              <label class="cdn-segment-item">
                <input v-model="mode" type="radio" value="cdn">
                <span>CDN</span>
              </label>
              <label class="cdn-segment-item">
                <input v-model="mode" type="radio" value="local">
                <span>Local</span>
              </label>
            </div>
          </div>

          <div class="flex-1" />

          <button
            class="cdn-btn-primary"
            :disabled="status === 'loading'"
            @click="applyMode(mode)"
          >
            <Icon icon="carbon:reset" class="h-4 w-4" />
            Re-apply
          </button>
        </div>

        <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="cdn-mini">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Status
            </div>
            <div class="mt-1 flex items-center gap-2">
              <span
                class="cdn-badge"
                :class="status === 'ready'
                  ? 'cdn-badge--ok'
                  : status === 'loading'
                    ? 'cdn-badge--loading'
                    : status === 'error'
                      ? 'cdn-badge--err'
                      : 'cdn-badge--idle'"
              >
                {{ status === 'loading' ? 'loading' : status }}
              </span>
              <span class="text-sm text-slate-600 dark:text-slate-300 truncate">{{ statusDetail }}</span>
            </div>
          </div>

          <div class="cdn-mini">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Globals
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <span class="inline-flex items-center gap-1">
                <span class="text-slate-500 dark:text-slate-400">window.katex</span>
                <span class="cdn-dot" :class="hasWindowKatex ? 'cdn-dot--ok' : 'cdn-dot--off'" />
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="text-slate-500 dark:text-slate-400">window.mermaid</span>
                <span class="cdn-dot" :class="hasWindowMermaid ? 'cdn-dot--ok' : 'cdn-dot--off'" />
              </span>
            </div>
          </div>

          <div class="cdn-mini">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Notes
            </div>
            <div class="mt-1 text-sm text-slate-600 dark:text-slate-300">
              CDN mode uses UMD globals for main-thread rendering and injects CDN-backed workers for KaTeX render + Mermaid parse.
            </div>
          </div>
        </div>
      </section>

      <section class="cdn-card">
        <div v-if="status !== 'ready'" class="p-3 text-sm text-slate-600 dark:text-slate-300">
          Waiting for optional peers to be ready…
        </div>
        <MarkdownRender
          v-else
          :key="renderKey"
          :content="content"
          :is-dark="isDark"
          class="cdn-render p-1 sm:p-2"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.cdn-peers-page {
  color: rgb(15 23 42);
  color-scheme: light;
}
.cdn-peers-bg {
  background:
    radial-gradient(800px 400px at 15% 0%, rgba(79, 70, 229, 0.18), transparent 55%),
    radial-gradient(700px 380px at 85% 10%, rgba(56, 189, 248, 0.16), transparent 55%),
    radial-gradient(700px 420px at 60% 85%, rgba(16, 185, 129, 0.12), transparent 55%),
    linear-gradient(180deg, rgba(248, 250, 252, 1), rgba(241, 245, 249, 1));
}
.cdn-peers-page.dark {
  color: rgb(241 245 249);
  color-scheme: dark;
}
.cdn-peers-page.dark .cdn-peers-bg {
  background:
    radial-gradient(900px 520px at 12% 0%, rgba(124, 58, 237, 0.22), transparent 60%),
    radial-gradient(820px 520px at 88% 10%, rgba(14, 165, 233, 0.14), transparent 60%),
    radial-gradient(760px 560px at 60% 86%, rgba(16, 185, 129, 0.10), transparent 60%),
    radial-gradient(1200px 600px at 50% 40%, rgba(255, 255, 255, 0.04), transparent 62%),
    linear-gradient(180deg, rgba(2, 6, 23, 1), rgba(3, 7, 18, 1));
}

.cdn-peers-header-inner {
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow:
    0 10px 30px rgba(15, 23, 42, 0.08),
    0 2px 10px rgba(15, 23, 42, 0.05);
  backdrop-filter: blur(12px);
}
.cdn-peers-page.dark .cdn-peers-header-inner {
  background: rgba(3, 7, 18, 0.60);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow:
    0 14px 46px rgba(0, 0, 0, 0.42),
    0 2px 16px rgba(0, 0, 0, 0.28);
}

.cdn-card {
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.28);
  box-shadow:
    0 10px 30px rgba(15, 23, 42, 0.07),
    0 2px 10px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(10px);
}
.cdn-peers-page.dark .cdn-card {
  background: rgba(3, 7, 18, 0.62);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow:
    0 18px 54px rgba(0, 0, 0, 0.45),
    0 2px 18px rgba(0, 0, 0, 0.25);
}

.cdn-mini {
  border-radius: 14px;
  padding: 12px;
  background: rgba(248, 250, 252, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.22);
}
.cdn-peers-page.dark .cdn-mini {
  background: rgba(15, 23, 42, 0.62);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.cdn-btn,
.cdn-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  transition: transform 120ms ease, background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
  user-select: none;
}
.cdn-btn {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.28);
  color: rgb(15 23 42);
}
.cdn-btn:hover {
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.cdn-peers-page.dark .cdn-btn {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.14);
  color: rgb(226 232 240);
}
.cdn-peers-page.dark .cdn-btn:hover {
  background: rgba(30, 41, 59, 0.66);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.34);
}

.cdn-btn-primary {
  background: linear-gradient(135deg, rgba(79, 70, 229, 1), rgba(59, 130, 246, 1));
  color: white;
  border: 1px solid rgba(59, 130, 246, 0.25);
  box-shadow: 0 12px 22px rgba(79, 70, 229, 0.22);
}
.cdn-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 18px 28px rgba(79, 70, 229, 0.28);
}
.cdn-btn-primary:disabled {
  opacity: 0.65;
  transform: none;
  cursor: not-allowed;
}

.cdn-segment {
  display: inline-flex;
  border-radius: 999px;
  padding: 4px;
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.22);
}
.cdn-peers-page.dark .cdn-segment {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.12);
}
.cdn-segment-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  color: rgb(51 65 85);
  cursor: pointer;
}
.cdn-segment-item input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.cdn-segment-item span {
  opacity: 0.75;
}
.cdn-segment-item:has(input:checked) {
  background: rgba(255, 255, 255, 0.9);
  color: rgb(15 23 42);
  box-shadow: 0 10px 16px rgba(15, 23, 42, 0.08);
}
.cdn-peers-page.dark .cdn-segment-item {
  color: rgb(226 232 240);
}
.cdn-peers-page.dark .cdn-segment-item:has(input:checked) {
  background: rgba(30, 41, 59, 0.78);
  color: rgb(241 245 249);
  box-shadow: 0 18px 26px rgba(0, 0, 0, 0.34);
}
.cdn-segment-item:has(input:checked) span {
  opacity: 1;
}

.cdn-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}
.cdn-badge--ok {
  background: rgba(16, 185, 129, 0.14);
  color: rgb(5 150 105);
  border-color: rgba(16, 185, 129, 0.25);
}
.cdn-peers-page.dark .cdn-badge--ok {
  background: rgba(16, 185, 129, 0.18);
  color: rgb(110 231 183);
  border-color: rgba(16, 185, 129, 0.25);
}
.cdn-badge--loading {
  background: rgba(59, 130, 246, 0.14);
  color: rgb(37 99 235);
  border-color: rgba(59, 130, 246, 0.24);
}
.cdn-peers-page.dark .cdn-badge--loading {
  background: rgba(59, 130, 246, 0.18);
  color: rgb(147 197 253);
  border-color: rgba(59, 130, 246, 0.24);
}
.cdn-badge--err {
  background: rgba(239, 68, 68, 0.14);
  color: rgb(220 38 38);
  border-color: rgba(239, 68, 68, 0.24);
}
.cdn-peers-page.dark .cdn-badge--err {
  background: rgba(239, 68, 68, 0.18);
  color: rgb(252 165 165);
  border-color: rgba(239, 68, 68, 0.24);
}
.cdn-badge--idle {
  background: rgba(148, 163, 184, 0.18);
  color: rgb(71 85 105);
  border-color: rgba(148, 163, 184, 0.24);
}
.cdn-peers-page.dark .cdn-badge--idle {
  background: rgba(148, 163, 184, 0.16);
  color: rgb(226 232 240);
  border-color: rgba(148, 163, 184, 0.20);
}

.cdn-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: rgba(148, 163, 184, 0.25);
}
.cdn-dot--ok {
  border-color: rgba(16, 185, 129, 0.6);
  background: rgba(16, 185, 129, 0.65);
}
.cdn-dot--off {
  border-color: rgba(148, 163, 184, 0.45);
  background: rgba(148, 163, 184, 0.22);
}

.cdn-render { color: inherit; }
</style>
