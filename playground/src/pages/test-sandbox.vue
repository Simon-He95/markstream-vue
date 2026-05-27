<script setup lang="ts">
import type { SandboxSelection } from '../../../playground-shared/versionSandbox'
import { computed, createApp as createVue3RuntimeApp, onBeforeUnmount, onMounted, ref, h as vue3H } from 'vue'
import { decodeMarkdownHash } from '../../../playground-shared/testPageState'
import { parseSandboxSelection } from '../../../playground-shared/versionSandbox'
import {
  TEST_SANDBOX_KATEX_VERSION,
  TEST_SANDBOX_MERMAID_VERSION,
  testSandboxFrameworks,
} from '../testSandboxConfig'
import '../../../packages/markstream-angular/src/index.css'

type SandboxStatus = 'idle' | 'loading' | 'ready' | 'error'

const canvasRef = ref<HTMLElement | null>(null)
const status = ref<SandboxStatus>('idle')
const selection = ref<SandboxSelection>(parseSandboxSelection(window.location.search, testSandboxFrameworks))
const markdown = ref(decodeMarkdownHash(window.location.hash || '') ?? '')
const errorMessage = ref('')

const statusLabel = computed(() => {
  if (status.value === 'loading')
    return '加载中'
  if (status.value === 'error')
    return '加载失败'
  if (status.value === 'ready')
    return 'Ready'
  return '待命'
})

const selectionSummary = computed(() => {
  const current = selection.value
  return `${current.framework.label} / ${current.source === 'workspace' ? 'workspace' : 'npm'} / ${current.version}`
})

let cleanupMountedRuntime: (() => void) | null = null
let renderToken = 0

function setHeadLink(id: string, href: string | null) {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[data-sandbox-style="${id}"]`)

  if (!href) {
    existing?.remove()
    return
  }

  if (existing) {
    if (existing.href !== href)
      existing.href = href
    return
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.sandboxStyle = id
  document.head.appendChild(link)
}

function encodeNpmVersion(version: string) {
  return encodeURIComponent(version.trim() || 'latest')
}

function createEsmPackageUrl(packageName: string, version: string, deps: string[] = []) {
  const query = new URLSearchParams()
  if (deps.length)
    query.set('deps', deps.join(','))
  const suffix = query.toString()
  return `https://esm.sh/${packageName}@${encodeNpmVersion(version)}${suffix ? `?${suffix}` : ''}`
}

function createEsmPackageSubpathUrl(
  packageName: string,
  version: string,
  subpath: string,
  deps: string[] = [],
) {
  const base = createEsmPackageUrl(packageName, version, deps)
  const [prefix, query] = base.split('?')
  return `${prefix}/${subpath}${query ? `?${query}` : ''}`
}

function createJsDelivrCssUrl(packageName: string, version: string) {
  return `https://cdn.jsdelivr.net/npm/${packageName}@${encodeNpmVersion(version)}/dist/index.css`
}

function applySandboxStyles(current: SandboxSelection) {
  setHeadLink(
    'renderer',
    current.source === 'npm'
      ? createJsDelivrCssUrl(current.framework.packageName, current.version)
      : null,
  )
  setHeadLink(
    'katex',
    `https://cdn.jsdelivr.net/npm/katex@${TEST_SANDBOX_KATEX_VERSION}/dist/katex.min.css`,
  )
}

async function importRemote<T = any>(url: string): Promise<T> {
  return await import(/* @vite-ignore */ url) as T
}

function cleanupRuntime() {
  cleanupMountedRuntime?.()
  cleanupMountedRuntime = null
  if (canvasRef.value)
    canvasRef.value.innerHTML = ''
}

function setupCommonRendererRuntime(rendererModule: Record<string, any>) {
  rendererModule.enableKatex?.()
  rendererModule.enableMermaid?.()

  const katexHandle = rendererModule.createKaTeXWorkerFromCDN?.({
    mode: 'classic',
    katexUrl: `https://cdn.jsdelivr.net/npm/katex@${TEST_SANDBOX_KATEX_VERSION}/dist/katex.min.js`,
    mhchemUrl: `https://cdn.jsdelivr.net/npm/katex@${TEST_SANDBOX_KATEX_VERSION}/dist/contrib/mhchem.min.js`,
  })
  if (katexHandle?.worker)
    rendererModule.setKaTeXWorker?.(katexHandle.worker)

  const mermaidHandle = rendererModule.createMermaidWorkerFromCDN?.({
    mode: 'module',
    workerOptions: { type: 'module' },
    mermaidUrl: `https://cdn.jsdelivr.net/npm/mermaid@${TEST_SANDBOX_MERMAID_VERSION}/dist/mermaid.esm.min.mjs`,
  })
  if (mermaidHandle?.worker)
    rendererModule.setMermaidWorker?.(mermaidHandle.worker)

  return () => {
    rendererModule.clearKaTeXWorker?.()
    rendererModule.clearMermaidWorker?.()
    katexHandle?.dispose?.()
    mermaidHandle?.dispose?.()
  }
}

async function mountVue3Sandbox(current: SandboxSelection, content: string, mountPoint: HTMLElement) {
  const rendererModule = current.source === 'workspace'
    ? await import('markstream-vue')
    : await importRemote(createEsmPackageUrl(
        current.framework.packageName,
        current.version,
        [`vue@${current.framework.runtimeVersion}`],
      ))
  const vueModule = current.source === 'workspace'
    ? null
    : await importRemote<any>(createEsmPackageUrl('vue', current.framework.runtimeVersion))

  const teardownRuntime = setupCommonRendererRuntime(rendererModule)
  const MarkdownRender = rendererModule.default || rendererModule.MarkdownRender
  const createApp = current.source === 'workspace'
    ? createVue3RuntimeApp
    : (vueModule?.createApp || vueModule?.default?.createApp)
  const h = current.source === 'workspace'
    ? vue3H
    : (vueModule?.h || vueModule?.default?.h)

  if (!MarkdownRender || !createApp || !h)
    throw new Error('无法找到 Vue 3 渲染器入口。')

  const host = document.createElement('div')
  host.className = 'sandbox-canvas__host'
  mountPoint.replaceChildren(host)

  const app = createApp({
    render() {
      return h(MarkdownRender, {
        content,
        batchRendering: false,
        typewriter: false,
        viewportPriority: false,
      })
    },
  })

  app.mount(host)

  return () => {
    app.unmount()
    teardownRuntime()
  }
}

async function mountVue2Sandbox(current: SandboxSelection, content: string, mountPoint: HTMLElement) {
  const [vueModule, rendererModule] = await Promise.all([
    importRemote<any>(createEsmPackageUrl('vue', current.framework.runtimeVersion)),
    importRemote<any>(createEsmPackageUrl(
      current.framework.packageName,
      current.version,
      [
        `vue@${current.framework.runtimeVersion}`,
        '@vue/composition-api@1.7.2',
      ],
    )),
  ])

  const Vue2 = vueModule.default || vueModule
  const MarkdownRender = rendererModule.default || rendererModule.MarkdownRender
  const teardownRuntime = setupCommonRendererRuntime(rendererModule)

  if (!Vue2 || !MarkdownRender)
    throw new Error('无法找到 Vue 2 渲染器入口。')

  const host = document.createElement('div')
  host.className = 'sandbox-canvas__host'
  mountPoint.replaceChildren(host)

  const app = new Vue2({
    render(createElement: (component: any, data?: any) => any) {
      return createElement(MarkdownRender, {
        props: {
          content,
          batchRendering: false,
          typewriter: false,
          viewportPriority: false,
        },
      })
    },
  })

  app.$mount(host)

  return () => {
    app.$destroy()
    teardownRuntime()
  }
}

async function mountReactSandbox(current: SandboxSelection, content: string, mountPoint: HTMLElement) {
  const runtimeVersion = current.framework.runtimeVersion
  const [reactModule, reactDomModule, rendererModule] = await Promise.all([
    importRemote<any>(createEsmPackageUrl('react', runtimeVersion)),
    importRemote<any>(createEsmPackageSubpathUrl(
      'react-dom',
      runtimeVersion,
      'client',
      [`react@${runtimeVersion}`],
    )),
    importRemote<any>(createEsmPackageUrl(
      current.framework.packageName,
      current.version,
      [`react@${runtimeVersion}`, `react-dom@${runtimeVersion}`],
    )),
  ])

  const React = reactModule.default || reactModule
  const ReactDOMClient = reactDomModule.default || reactDomModule
  const MarkdownRender = rendererModule.default || rendererModule.NodeRenderer

  if (!React?.createElement || !ReactDOMClient?.createRoot || !MarkdownRender)
    throw new Error('无法找到 React 渲染器入口。')

  const host = document.createElement('div')
  host.className = 'sandbox-canvas__host'
  mountPoint.replaceChildren(host)

  const root = ReactDOMClient.createRoot(host)
  root.render(
    React.createElement(MarkdownRender, {
      content,
      batchRendering: false,
      typewriter: false,
      viewportPriority: false,
    }),
  )

  return () => {
    root.unmount()
  }
}

async function mountAngularSandbox(current: SandboxSelection, content: string, mountPoint: HTMLElement) {
  const runtimeVersion = current.framework.runtimeVersion
  const rendererModule = current.source === 'workspace'
    ? await import('markstream-angular')
    : await importRemote<any>(createEsmPackageUrl(
        current.framework.packageName,
        current.version,
        [`@angular/common@${runtimeVersion}`, `@angular/core@${runtimeVersion}`],
      ))

  const renderMarkdownToHtml = rendererModule.renderMarkdownToHtml
  const enhanceRenderedHtml = rendererModule.enhanceRenderedHtml
  if (typeof renderMarkdownToHtml !== 'function')
    throw new Error('无法找到 Angular 渲染器入口。')

  const host = document.createElement('div')
  host.className = 'sandbox-canvas__host'

  const shell = document.createElement('div')
  shell.className = 'markstream-angular markdown-renderer'
  shell.innerHTML = renderMarkdownToHtml({
    content,
    final: true,
    allowHtml: true,
  })
  const enhancementHandle = await enhanceRenderedHtml?.(shell, {
    final: true,
  })

  host.replaceChildren(shell)
  mountPoint.replaceChildren(host)

  return () => {
    enhancementHandle?.dispose?.()
    mountPoint.replaceChildren()
  }
}

async function mountSandbox(current: SandboxSelection, content: string, mountPoint: HTMLElement) {
  if (current.frameworkId === 'vue3')
    return await mountVue3Sandbox(current, content, mountPoint)

  if (current.frameworkId === 'vue2')
    return await mountVue2Sandbox(current, content, mountPoint)

  if (current.frameworkId === 'angular')
    return await mountAngularSandbox(current, content, mountPoint)

  return await mountReactSandbox(current, content, mountPoint)
}

async function renderSandbox() {
  const mountPoint = canvasRef.value
  if (!mountPoint)
    return

  renderToken += 1
  const activeToken = renderToken

  cleanupRuntime()
  selection.value = parseSandboxSelection(window.location.search, testSandboxFrameworks)
  markdown.value = decodeMarkdownHash(window.location.hash || '') ?? ''
  errorMessage.value = ''
  status.value = 'loading'
  applySandboxStyles(selection.value)

  try {
    const teardown = await mountSandbox(selection.value, markdown.value, mountPoint)
    if (activeToken !== renderToken) {
      teardown()
      return
    }
    cleanupMountedRuntime = teardown
    status.value = 'ready'
  }
  catch (error) {
    console.error('[test-sandbox] failed to render sandbox', error)
    cleanupRuntime()
    status.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

function handleHashChange() {
  void renderSandbox()
}

onMounted(() => {
  void renderSandbox()
  window.addEventListener('hashchange', handleHashChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', handleHashChange)
  cleanupRuntime()
})
</script>

<template>
  <div class="sandbox-page">
    <header class="sandbox-hero">
      <div>
        <span class="sandbox-eyebrow">Version sandbox</span>
        <h1>Isolated Renderer</h1>
        <p>当前 iframe 正在独立加载对应 framework 与包版本，用于和左侧 workspace 预览做对照。</p>
      </div>

      <div class="sandbox-summary">
        <div class="sandbox-summary__item">
          <span>选择</span>
          <strong>{{ selectionSummary }}</strong>
        </div>
        <div class="sandbox-summary__item">
          <span>状态</span>
          <strong>{{ statusLabel }}</strong>
        </div>
        <div class="sandbox-summary__item">
          <span>字符数</span>
          <strong>{{ markdown.length }}</strong>
        </div>
      </div>
    </header>

    <div v-if="status === 'error'" class="sandbox-banner sandbox-banner--error">
      <strong>沙箱加载失败。</strong>
      <span>{{ errorMessage || '请检查版本号是否存在，或稍后重试。' }}</span>
    </div>
    <div v-else-if="selection.source === 'workspace' && !selection.framework.supportsWorkspace" class="sandbox-banner sandbox-banner--warning">
      当前框架不支持在这个 iframe 中直接跑 workspace 源码，已自动回退到 npm 包模式。
    </div>
    <div v-else-if="status === 'loading'" class="sandbox-banner sandbox-banner--info">
      正在加载隔离渲染器与对应版本资源...
    </div>

    <section class="sandbox-canvas">
      <div ref="canvasRef" class="sandbox-canvas__mount" />
    </section>
  </div>
</template>

<style scoped>
.sandbox-page {
  min-height: 100vh;
  padding: 18px;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.12), transparent 28%),
    linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
  color: #10203a;
}

.sandbox-hero,
.sandbox-canvas,
.sandbox-banner {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
}

.sandbox-hero {
  display: grid;
  gap: 18px;
  padding: 20px 22px;
}

.sandbox-eyebrow {
  display: inline-flex;
  width: fit-content;
  padding: 6px 11px;
  border-radius: 999px;
  background: rgba(29, 78, 216, 0.1);
  color: #1d4ed8;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sandbox-hero h1 {
  margin: 10px 0 8px;
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  line-height: 0.95;
}

.sandbox-hero p {
  margin: 0;
  color: #5d7390;
  line-height: 1.6;
}

.sandbox-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.sandbox-summary__item {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.sandbox-summary__item span {
  display: block;
  margin-bottom: 6px;
  color: #5d7390;
  font-size: 0.82rem;
}

.sandbox-summary__item strong {
  display: block;
  line-break: anywhere;
}

.sandbox-banner {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  padding: 14px 16px;
  font-size: 0.92rem;
}

.sandbox-banner--info {
  color: #1d4ed8;
}

.sandbox-banner--warning {
  color: #b45309;
  background: rgba(255, 251, 235, 0.92);
}

.sandbox-banner--error {
  color: #b91c1c;
  background: rgba(254, 242, 242, 0.94);
}

.sandbox-canvas {
  margin-top: 14px;
  min-height: calc(100vh - 220px);
  overflow: hidden;
}

.sandbox-canvas__mount {
  min-height: inherit;
  padding: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(245, 248, 252, 0.92));
}

.sandbox-canvas__mount :deep(.markstream-vue),
.sandbox-canvas__mount :deep(.markstream-react) {
  min-height: calc(100vh - 320px);
}

.sandbox-canvas__mount :deep(.monaco-editor .ime-text-area) {
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  position: absolute;
  resize: none;
  border: 0;
  overflow: hidden;
  color: transparent;
  background: transparent;
  z-index: -10;
  outline: none !important;
}

@media (max-width: 720px) {
  .sandbox-page {
    padding: 12px;
  }

  .sandbox-summary {
    grid-template-columns: 1fr;
  }

  .sandbox-canvas__mount {
    padding: 16px;
  }
}
</style>
