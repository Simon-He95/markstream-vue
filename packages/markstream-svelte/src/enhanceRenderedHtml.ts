import type { NodeRendererCodeBlockProps, NodeRendererD2Props, NodeRendererInfographicProps, NodeRendererMermaidProps } from './components/shared/node-helpers'
import type { CodeBlockMonacoOptions } from './types/monaco'
import { toSafeMermaidSvgMarkup } from 'stream-markdown-parser'
import { getD2 } from './optional/d2'
import { getInfographic } from './optional/infographic'
import { getKatex } from './optional/katex'
import { getMermaid } from './optional/mermaid'
import { getUseMonaco } from './optional/monaco'
import { extractRenderedSvg, toSafeSvgMarkup } from './sanitizeSvg'
import { hideTooltip, showTooltipForAnchor } from './tooltip/singletonTooltip'
import { normalizeKaTeXRenderInput } from './utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from './workers/katexWorkerClient'
import { canParseOffthread, findPrefixOffthread } from './workers/mermaidWorkerClient'

let mermaidRenderId = 0
const rootHandles = new WeakMap<HTMLElement, RenderedHtmlEnhancementHandle>()
type MermaidTheme = 'light' | 'dark'

const DARK_THEME_OVERRIDES: Record<string, string> = {
  N1: '#E5E7EB',
  N2: '#CBD5E1',
  N3: '#94A3B8',
  N4: '#64748B',
  N5: '#475569',
  N6: '#334155',
  N7: '#0B1220',
  B1: '#60A5FA',
  B2: '#3B82F6',
  B3: '#2563EB',
  B4: '#1D4ED8',
  B5: '#1E40AF',
  B6: '#111827',
  AA2: '#22D3EE',
  AA4: '#0EA5E9',
  AA5: '#0284C7',
  AB4: '#FBBF24',
  AB5: '#F59E0B',
}

const MONACO_LANGUAGE_ALIASES: Record<string, string> = {
  cjs: 'javascript',
  cts: 'typescript',
  d2lang: 'plaintext',
  js: 'javascript',
  jsonc: 'json',
  jsx: 'javascript',
  md: 'markdown',
  mjs: 'javascript',
  sh: 'shell',
  text: 'plaintext',
  ts: 'typescript',
  tsx: 'typescript',
  txt: 'plaintext',
  vue: 'html',
  yml: 'yaml',
}

export interface EnhanceRenderedHtmlOptions {
  final?: boolean
  isDark?: boolean
  renderCodeBlocksAsPre?: boolean
  monacoOptions?: CodeBlockMonacoOptions
  d2ThemeId?: number | null
  d2DarkThemeId?: number | null
  showTooltips?: boolean
  codeBlockProps?: NodeRendererCodeBlockProps
  mermaidProps?: NodeRendererMermaidProps
  d2Props?: NodeRendererD2Props
  infographicProps?: NodeRendererInfographicProps
  onCopy?: (code: string) => void
  isCancelled?: () => boolean
}

export interface RenderedHtmlEnhancementHandle {
  dispose: () => void
}

export async function enhanceRenderedHtml(
  root: HTMLElement,
  options: EnhanceRenderedHtmlOptions = {},
): Promise<RenderedHtmlEnhancementHandle> {
  disposeRenderedHtmlEnhancements(root)

  const cleanupFns: Array<() => void> = []
  let disposed = false
  const isActive = () => !disposed && options.isCancelled?.() !== true
  const handle: RenderedHtmlEnhancementHandle = {
    dispose: () => {
      if (disposed)
        return
      disposed = true
      for (let index = cleanupFns.length - 1; index >= 0; index -= 1) {
        try {
          cleanupFns[index]?.()
        }
        catch {
          // Best-effort cleanup only.
        }
      }
      if (rootHandles.get(root) === handle)
        rootHandles.delete(root)
    },
  }

  rootHandles.set(root, handle)

  if (!isActive())
    return handle

  await renderKatex(root, isActive)
  if (!isActive())
    return handle

  await renderMermaid(root, cleanupFns, options, isActive)
  if (!isActive())
    return handle

  if (options.final !== false) {
    await renderInfographic(root, cleanupFns, options, isActive)
    if (!isActive())
      return handle

    await renderD2(root, cleanupFns, options, isActive)
    if (!isActive())
      return handle

    if (!options.renderCodeBlocksAsPre)
      await renderMonaco(root, cleanupFns, options, isActive)
  }

  enhanceFootnotes(root, cleanupFns)
  enhanceTooltips(root, cleanupFns, options)

  return handle
}

export function disposeRenderedHtmlEnhancements(root: HTMLElement | null | undefined) {
  if (!root)
    return
  const existing = rootHandles.get(root)
  existing?.dispose()
}

function readKatexSource(node: HTMLElement, selector: string) {
  const sourceElement = node.querySelector<HTMLElement>(selector)
  return {
    sourceElement,
    source: (sourceElement?.textContent || (!sourceElement ? node.textContent : '') || '').trim(),
  }
}

function resolveKatexRenderTarget(node: HTMLElement, selector: string) {
  return node.querySelector<HTMLElement>(selector)
}

function hasRenderedKatex(node: HTMLElement, selector: string) {
  const renderTarget = resolveKatexRenderTarget(node, selector)
  const scope = renderTarget || node
  return !!scope.querySelector('.katex, .katex-display')
}

function writeKatexMarkup(
  node: HTMLElement,
  renderTarget: HTMLElement | null,
  markup: string,
  options: { renderedClass?: string } = {},
) {
  if (renderTarget)
    renderTarget.innerHTML = markup
  else
    node.innerHTML = markup

  node.dataset.markstreamKatex = '1'
  if (options.renderedClass)
    node.classList.add(options.renderedClass)
}

function clearKatexMarkup(
  node: HTMLElement,
  renderTarget: HTMLElement | null,
  options: { renderedClass?: string } = {},
) {
  if (renderTarget)
    renderTarget.innerHTML = ''
  delete node.dataset.markstreamKatex
  delete node.dataset.markstreamKatexSource
  if (options.renderedClass)
    node.classList.remove(options.renderedClass)
}

async function renderKatex(root: HTMLElement, isActive: () => boolean) {
  const inlineNodes = Array.from(root.querySelectorAll<HTMLElement>('.markstream-nested-math'))
  for (const node of inlineNodes) {
    if (!isActive())
      return
    if (node.dataset.markstreamKatexManaged === '1')
      continue
    const { source } = readKatexSource(node, '.markstream-nested-math__source')
    const renderTarget = resolveKatexRenderTarget(node, '.markstream-nested-math__render')
    if (!source) {
      clearKatexMarkup(node, renderTarget)
      continue
    }
    if (
      node.dataset.markstreamKatex === '1'
      && node.dataset.markstreamKatexSource === source
      && hasRenderedKatex(node, '.markstream-nested-math__render')
    ) {
      continue
    }
    try {
      writeKatexMarkup(node, renderTarget, await renderKatexMarkup(source, node.dataset.display === 'block'))
      node.dataset.markstreamKatexSource = source
    }
    catch {
      clearKatexMarkup(node, renderTarget)
    }
  }

  const blockNodes = Array.from(root.querySelectorAll<HTMLElement>('.markstream-nested-math-block'))
  for (const node of blockNodes) {
    if (!isActive())
      return
    if (node.dataset.markstreamKatexManaged === '1')
      continue
    const { source } = readKatexSource(node, '.markstream-nested-math-block__source')
    const renderTarget = resolveKatexRenderTarget(node, '.markstream-nested-math-block__render')
    if (!source) {
      clearKatexMarkup(node, renderTarget, { renderedClass: 'markstream-nested-math-block--rendered' })
      continue
    }
    if (
      node.dataset.markstreamKatex === '1'
      && node.dataset.markstreamKatexSource === source
      && hasRenderedKatex(node, '.markstream-nested-math-block__render')
    ) {
      continue
    }
    try {
      writeKatexMarkup(node, renderTarget, await renderKatexMarkup(source, true), {
        renderedClass: 'markstream-nested-math-block--rendered',
      })
      node.dataset.markstreamKatexSource = source
    }
    catch {
      clearKatexMarkup(node, renderTarget, { renderedClass: 'markstream-nested-math-block--rendered' })
    }
  }
}

async function renderKatexMarkup(source: string, displayMode: boolean) {
  const normalizedSource = normalizeKaTeXRenderInput(source)
  try {
    return await renderKaTeXWithBackpressure(normalizedSource, displayMode, {
      timeout: 1500,
      waitTimeout: 0,
      maxRetries: 0,
    })
  }
  catch (error: any) {
    const code = error?.code || error?.name
    const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || error?.fallbackToRenderer
    const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
    if (!isWorkerInitFailure && !isBusyOrTimeout)
      throw error
  }

  const katex = await getKatex()
  if (!katex)
    throw new Error('KaTeX renderer is not available.')

  const html = katex.renderToString(normalizedSource, {
    displayMode,
    throwOnError: false,
  })
  setKaTeXCache(normalizedSource, displayMode, html)
  return html
}

async function renderMermaid(
  root: HTMLElement,
  cleanupFns: Array<() => void>,
  options: EnhanceRenderedHtmlOptions,
  isActive: () => boolean,
) {
  const strictMode = options.mermaidProps?.isStrict !== false
  const mermaid = await getMermaid({
    startOnLoad: false,
    securityLevel: strictMode ? 'strict' : 'loose',
    suppressErrorRendering: true,
    ...(strictMode ? { flowchart: { htmlLabels: false } } : {}),
  })
  if (!mermaid || !isActive())
    return

  const codeNodes = Array.from(root.querySelectorAll<HTMLElement>('pre > code.language-mermaid'))
  for (const codeNode of codeNodes) {
    if (!isActive())
      return
    const pre = codeNode.parentElement as HTMLElement | null
    const source = (codeNode.textContent || '').trim()
    if (!pre || !source)
      continue

    const originalPre = pre.cloneNode(true) as HTMLElement
    const shell = createEnhancedBlockShell(
      'mermaid',
      'Mermaid',
      source,
      true,
      options,
      {
        showHeader: options.mermaidProps?.showHeader !== false,
      },
    )
    pre.replaceWith(shell.wrapper)

    try {
      const theme: MermaidTheme = options.isDark ? 'dark' : 'light'
      let sourceToRender = source
      if (options.final === false) {
        try {
          await canParseMermaidWithFallback(source, theme, mermaid, options)
        }
        catch (error: any) {
          if (error?.name === 'AbortError')
            return
          const prefix = await findMermaidPrefixCandidate(source, theme, options)
          if (!isActive())
            return
          if (!prefix) {
            shell.wrapper.replaceWith(originalPre)
            continue
          }
          sourceToRender = prefix
        }
      }

      const renderId = `markstream-svelte-mermaid-${++mermaidRenderId}`
      const rendered = await withTimeout(
        () => Promise.resolve(mermaid.render(renderId, applyMermaidThemeTo(sourceToRender, theme))),
        options.final === false
          ? Number(options.mermaidProps?.renderTimeoutMs ?? 2500)
          : Number(options.mermaidProps?.fullRenderTimeoutMs ?? 4000),
      )
      if (!isActive())
        return
      const svg = typeof rendered === 'string' ? rendered : rendered?.svg
      if (!svg)
        continue
      const safeSvg = toSafeMermaidSvgMarkup(svg)
      if (!safeSvg)
        continue
      shell.body.innerHTML = safeSvg
      shell.body.classList.add('markstream-svelte-mermaid')
      shell.wrapper.dataset.markstreamMermaid = '1'
      if (options.mermaidProps?.enableMermaidInteractions === true && typeof rendered !== 'string') {
        try {
          rendered?.bindFunctions?.(shell.body)
        }
        catch {}
      }
      cleanupFns.push(() => {
        if (shell.wrapper.isConnected)
          shell.wrapper.replaceWith(originalPre.cloneNode(true))
      })
    }
    catch {
      shell.wrapper.replaceWith(originalPre)
    }
  }
}

function applyMermaidThemeTo(source: string, theme: MermaidTheme) {
  const trimmed = source.trimStart()
  if (trimmed.startsWith('%%{'))
    return source
  const themeValue = theme === 'dark' ? 'dark' : 'default'
  return `%%{init: {"theme": "${themeValue}"}}%%\n${source}`
}

async function canParseMermaidWithFallback(
  source: string,
  theme: MermaidTheme,
  mermaid: any,
  options: EnhanceRenderedHtmlOptions,
) {
  const workerTimeout = Number(options.mermaidProps?.workerTimeoutMs ?? 1400)
  const parseTimeout = Number(options.mermaidProps?.parseTimeoutMs ?? 1800)
  try {
    const ok = await canParseOffthread(source, theme, workerTimeout)
    if (ok)
      return true
  }
  catch (error: any) {
    if (error?.name === 'AbortError')
      throw error
  }

  const themedSource = applyMermaidThemeTo(source, theme)
  if (typeof mermaid?.parse === 'function') {
    await withTimeout(() => Promise.resolve(mermaid.parse(themedSource)), parseTimeout)
    return true
  }

  const renderId = `markstream-svelte-mermaid-parse-${++mermaidRenderId}`
  await withTimeout(() => Promise.resolve(mermaid.render(renderId, themedSource)), parseTimeout)
  return true
}

async function findMermaidPrefixCandidate(
  source: string,
  theme: MermaidTheme,
  options: EnhanceRenderedHtmlOptions,
) {
  const workerTimeout = Number(options.mermaidProps?.workerTimeoutMs ?? 1400)
  try {
    const prefix = await findPrefixOffthread(source, theme, workerTimeout)
    if (prefix)
      return prefix
  }
  catch (error: any) {
    if (error?.name === 'AbortError')
      throw error
  }
  return getSafeMermaidPrefixCandidate(source)
}

function getSafeMermaidPrefixCandidate(source: string) {
  const lines = source.split('\n')
  while (lines.length > 0) {
    const lastRaw = lines[lines.length - 1]
    const last = lastRaw.trimEnd()
    if (!last) {
      lines.pop()
      continue
    }
    const looksDangling = /^[-=~>|<\s]+$/.test(last.trim())
      || /(?:--|==|~~|->|<-|-\||-\)|-x|o-|\|-|\.-)\s*$/.test(last)
      || /[-|><]$/.test(last)
      || /(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt)\s*$/i.test(last)
    if (!looksDangling)
      break
    lines.pop()
  }
  return lines.join('\n')
}

function withTimeout<T>(run: () => Promise<T>, timeoutMs: number) {
  if (!timeoutMs || timeoutMs <= 0)
    return run()

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = globalThis.setTimeout(() => {
      if (settled)
        return
      settled = true
      reject(new Error('Operation timed out'))
    }, timeoutMs)

    run()
      .then((value) => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function renderInfographic(
  root: HTMLElement,
  cleanupFns: Array<() => void>,
  options: EnhanceRenderedHtmlOptions,
  isActive: () => boolean,
) {
  const codeNodes = Array.from(root.querySelectorAll<HTMLElement>('pre[data-markstream-code-block="1"] > code.language-infographic'))
  if (!codeNodes.length)
    return

  const InfographicClass = await getInfographic()
  if (!InfographicClass || !isActive())
    return

  for (const codeNode of codeNodes) {
    if (!isActive())
      return
    const pre = codeNode.parentElement as HTMLElement | null
    const source = codeNode.textContent || ''
    if (!pre || !source.trim())
      continue

    const originalPre = pre.cloneNode(true) as HTMLElement
    const shell = createEnhancedBlockShell('infographic', 'Infographic', source, true, options, {
      showHeader: options.infographicProps?.showHeader !== false,
    })
    shell.body.style.minHeight = '320px'
    shell.body.style.height = '360px'
    pre.replaceWith(shell.wrapper)

    try {
      const instance = new InfographicClass({
        container: shell.body,
        width: '100%',
        height: '100%',
      })
      instance.render(source)

      let frameId: number | null = null
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        frameId = window.requestAnimationFrame(() => {
          const actualHeight = shell.body.scrollHeight
          if (actualHeight > 0)
            shell.body.style.height = `${Math.min(Math.max(actualHeight, 260), 720)}px`
        })
      }

      cleanupFns.push(() => {
        if (frameId != null && typeof window !== 'undefined')
          window.cancelAnimationFrame(frameId)
        instance.destroy?.()
        if (shell.wrapper.isConnected)
          shell.wrapper.replaceWith(originalPre.cloneNode(true))
      })
      shell.wrapper.dataset.markstreamInfographic = '1'
    }
    catch {
      shell.wrapper.replaceWith(originalPre)
    }
  }
}

async function renderD2(
  root: HTMLElement,
  cleanupFns: Array<() => void>,
  options: EnhanceRenderedHtmlOptions,
  isActive: () => boolean,
) {
  const D2Ctor = await getD2()
  if (!D2Ctor || !isActive())
    return

  const codeNodes = Array.from(root.querySelectorAll<HTMLElement>('pre[data-markstream-code-block="1"] > code.language-d2, pre[data-markstream-code-block="1"] > code.language-d2lang'))
  for (const codeNode of codeNodes) {
    if (!isActive())
      return
    const pre = codeNode.parentElement as HTMLElement | null
    const source = codeNode.textContent || ''
    if (!pre || !source.trim())
      continue

    const originalPre = pre.cloneNode(true) as HTMLElement
    const shell = createEnhancedBlockShell('d2', 'D2', source, true, options, {
      showHeader: options.d2Props?.showHeader !== false,
    })
    pre.replaceWith(shell.wrapper)

    try {
      const instance = createD2Instance(D2Ctor)
      if (!instance || typeof instance.compile !== 'function' || typeof instance.render !== 'function')
        throw new TypeError('D2 instance is missing compile/render methods.')

      const compileResult = await instance.compile(source)
      const diagram = compileResult?.diagram ?? compileResult
      const baseRenderOptions = compileResult?.renderOptions ?? compileResult?.options ?? {}
      const resolvedThemeId = options.d2ThemeId ?? baseRenderOptions.themeID
      const resolvedDarkThemeId = options.d2DarkThemeId ?? baseRenderOptions.darkThemeID
      const renderOptions: Record<string, any> = { ...baseRenderOptions }
      renderOptions.themeID = options.isDark && resolvedDarkThemeId != null
        ? resolvedDarkThemeId
        : resolvedThemeId
      renderOptions.darkThemeID = null
      renderOptions.darkThemeOverrides = null
      if (options.isDark) {
        const baseOverrides = baseRenderOptions.themeOverrides && typeof baseRenderOptions.themeOverrides === 'object'
          ? baseRenderOptions.themeOverrides
          : null
        renderOptions.themeOverrides = {
          ...DARK_THEME_OVERRIDES,
          ...(baseOverrides || {}),
        }
      }

      const renderResult = await instance.render(diagram, renderOptions)
      if (!isActive())
        return
      const safeSvg = toSafeSvgMarkup(extractRenderedSvg(renderResult))
      if (!safeSvg)
        throw new Error('D2 render returned empty output.')

      shell.body.innerHTML = safeSvg
      shell.wrapper.dataset.markstreamD2 = '1'
      cleanupFns.push(() => {
        if (shell.wrapper.isConnected)
          shell.wrapper.replaceWith(originalPre.cloneNode(true))
      })
    }
    catch {
      shell.wrapper.replaceWith(originalPre)
    }
  }
}

async function renderMonaco(
  root: HTMLElement,
  cleanupFns: Array<() => void>,
  options: EnhanceRenderedHtmlOptions,
  isActive: () => boolean,
) {
  const monacoModule = await getUseMonaco()
  if (!monacoModule || typeof monacoModule.useMonaco !== 'function' || !isActive())
    return

  const preNodes = Array.from(root.querySelectorAll<HTMLElement>('pre[data-markstream-code-block="1"]'))
  for (const pre of preNodes) {
    if (!isActive())
      return
    const codeNode = pre.querySelector<HTMLElement>('code')
    if (!codeNode)
      continue

    const rawLanguage = resolveCodeLanguage(pre, codeNode)
    const normalizedLanguage = rawLanguage.trim().toLowerCase()
    if (normalizedLanguage === 'mermaid' || normalizedLanguage === 'infographic' || normalizedLanguage === 'd2' || normalizedLanguage === 'd2lang')
      continue

    const source = codeNode.textContent || ''
    const diff = pre.dataset.markstreamDiff === '1'
    const updatedCode = decodeDataPayload(pre.dataset.markstreamUpdated)
    const monacoLanguage = resolveMonacoLanguage(rawLanguage)
    const renderLanguage = diff ? 'plaintext' : monacoLanguage
    const shell = createEnhancedBlockShell(
      'code',
      diff ? `Diff / ${monacoLanguage}` : `Code / ${monacoLanguage}`,
      source,
      false,
      options,
      {
        showHeader: options.codeBlockProps?.showHeader !== false,
      },
    )
    shell.body.classList.add('markstream-svelte-enhanced-block__body--code')
    shell.body.style.minHeight = `${estimateCodeBlockHeight(diff ? updatedCode || source : source, diff)}px`
    const originalPre = pre.cloneNode(true) as HTMLElement
    let helpers: ReturnType<typeof monacoModule.useMonaco> | null = null
    let restored = false
    const restoreOriginalPre = () => {
      if (restored)
        return
      restored = true
      try {
        helpers?.cleanupEditor?.()
      }
      catch {
        // Ignore cleanup failures during fallback.
      }
      if (shell.wrapper.isConnected)
        shell.wrapper.replaceWith(originalPre.cloneNode(true))
    }
    pre.replaceWith(shell.wrapper)

    helpers = monacoModule.useMonaco({
      themes: ['vitesse-dark', 'vitesse-light'],
      languages: Array.from(new Set([monacoLanguage, 'plaintext'])),
      readOnly: true,
      minimap: { enabled: false },
      lineNumbers: 'on',
      wordWrap: 'off',
      revealDebounceMs: 75,
      MAX_HEIGHT: 500,
      fontSize: 13,
      ...(options.monacoOptions || {}),
    })
    cleanupFns.push(restoreOriginalPre)

    try {
      // Vue/React wire Monaco diff editors through dedicated components.
      // Svelte currently enhances static HTML after the fact, and the diff
      // editor path in stream-monaco can leave an empty shell or raise
      // "no diff result available" during worker setup. Prefer a stable
      // single-editor fallback that still preserves the diff source text.
      await helpers.createEditor(
        shell.body,
        source,
        renderLanguage,
      )
      if (!isActive()) {
        restoreOriginalPre()
        return
      }

      await helpers.setTheme?.(options.isDark ? 'vitesse-dark' : 'vitesse-light')
      if (!isActive()) {
        restoreOriginalPre()
        return
      }
      await waitForRenderFrame()
      if (!hasVisibleMonacoContent(shell.body, source))
        throw new Error('Monaco editor rendered no visible code content.')

      shell.wrapper.dataset.markstreamMonaco = '1'
      if (diff)
        shell.wrapper.dataset.markstreamMonacoDiff = '1'
    }
    catch {
      restoreOriginalPre()
    }
  }
}

function createD2Instance(D2Ctor: any) {
  if (typeof D2Ctor === 'function') {
    const instance = new D2Ctor()
    if (instance && typeof instance.compile === 'function')
      return instance
    if (typeof D2Ctor.compile === 'function')
      return D2Ctor
  }

  if (D2Ctor?.D2 && typeof D2Ctor.D2 === 'function')
    return new D2Ctor.D2()

  if (typeof D2Ctor?.compile === 'function')
    return D2Ctor

  return null
}

function resolveCodeLanguage(pre: HTMLElement, codeNode: HTMLElement) {
  const explicit = pre.dataset.markstreamLanguage?.trim()
  if (explicit)
    return explicit

  const languageClass = Array.from(codeNode.classList).find(className => className.startsWith('language-'))
  return languageClass ? languageClass.slice('language-'.length) : 'plaintext'
}

function resolveMonacoLanguage(language: string) {
  const normalized = language.trim().toLowerCase()
  return MONACO_LANGUAGE_ALIASES[normalized] || normalized || 'plaintext'
}

function estimateCodeBlockHeight(source: string, diff: boolean) {
  const lineCount = Math.max(1, source.split('\n').length)
  const perLine = diff ? 20 : 18
  const base = diff ? 180 : 96
  return Math.min(520, base + lineCount * perLine)
}

function hasVisibleMonacoContent(body: HTMLElement, source: string) {
  const editor = body.querySelector<HTMLElement>('.monaco-editor')
  if (!editor)
    return false

  const rect = editor.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0)
    return false

  const expected = source.split('\n').find(line => line.trim())?.trim()
  if (!expected)
    return true

  const normalizedVisible = normalizeVisibleCodeText(body.textContent || '')
  const normalizedExpected = normalizeVisibleCodeText(expected)
  return normalizedVisible.includes(normalizedExpected)
}

function normalizeVisibleCodeText(value: string) {
  return value.replace(/\s+/g, '')
}

async function waitForRenderFrame() {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function')
    return
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
}

function decodeDataPayload(value: string | null | undefined) {
  if (!value)
    return ''

  const globalBuffer = (globalThis as any)?.require?.('buffer')?.Buffer
  if (globalBuffer?.from)
    return globalBuffer.from(value, 'base64').toString('utf8')

  if (typeof globalThis.atob === 'function' && typeof TextDecoder !== 'undefined') {
    const binary = globalThis.atob(value)
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  return ''
}

function createEnhancedBlockShell(
  kind: 'code' | 'd2' | 'infographic' | 'mermaid',
  label: string,
  source: string,
  showSourceDetails: boolean,
  options: EnhanceRenderedHtmlOptions,
  shellOptions: {
    showHeader?: boolean
  } = {},
) {
  const wrapper = document.createElement('div')
  wrapper.className = `markstream-svelte-enhanced-block markstream-svelte-enhanced-block--${kind}`

  if (shellOptions.showHeader !== false) {
    const header = document.createElement('div')
    header.className = 'markstream-svelte-enhanced-block__header'

    const badge = document.createElement('span')
    badge.className = 'markstream-svelte-enhanced-block__badge'
    badge.textContent = label

    header.appendChild(badge)
    header.appendChild(createHeaderActions(source, options))
    wrapper.appendChild(header)
  }

  const body = document.createElement('div')
  body.className = 'markstream-svelte-enhanced-block__body'
  wrapper.appendChild(body)

  if (showSourceDetails) {
    const details = document.createElement('details')
    details.className = 'markstream-svelte-enhanced-block__details'

    const summary = document.createElement('summary')
    summary.textContent = 'Source'
    details.appendChild(summary)

    const sourcePre = document.createElement('pre')
    sourcePre.className = 'markstream-svelte-enhanced-block__source'
    const code = document.createElement('code')
    code.textContent = source
    sourcePre.appendChild(code)
    details.appendChild(sourcePre)

    wrapper.appendChild(details)
  }

  return { wrapper, body }
}

function createHeaderActions(source: string, options: EnhanceRenderedHtmlOptions) {
  const actions = document.createElement('div')
  actions.className = 'markstream-svelte-enhanced-block__actions'

  const copyButton = document.createElement('button')
  copyButton.type = 'button'
  copyButton.className = 'markstream-svelte-enhanced-block__action'
  copyButton.textContent = 'Copy'
  if (options.showTooltips !== false)
    copyButton.title = 'Copy source'

  copyButton.addEventListener('click', () => {
    void copyText(source)
    options.onCopy?.(source)
  })

  actions.appendChild(copyButton)
  return actions
}

function enhanceTooltips(
  root: HTMLElement,
  cleanupFns: Array<() => void>,
  options: EnhanceRenderedHtmlOptions,
) {
  if (options.showTooltips === false)
    return

  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-markstream-tooltip], [title]'))
  if (targets.length === 0)
    return

  for (const target of targets) {
    if (target.matches('.footnote-link, .footnote-anchor'))
      continue

    const title = target.getAttribute('title')
    const text = (target.dataset.markstreamTooltip || title || '').trim()
    if (!text)
      continue

    if (title != null)
      target.removeAttribute('title')

    const show = () => showTooltipForAnchor(target, text, 'top', false, undefined, options.isDark)
    const hide = () => hideTooltip()

    target.addEventListener('mouseenter', show)
    target.addEventListener('focus', show)
    target.addEventListener('mouseleave', hide)
    target.addEventListener('blur', hide)

    cleanupFns.push(() => {
      const ownsVisibleTooltip = target.getAttribute('aria-describedby') != null
      target.removeEventListener('mouseenter', show)
      target.removeEventListener('focus', show)
      target.removeEventListener('mouseleave', hide)
      target.removeEventListener('blur', hide)
      if (ownsVisibleTooltip)
        hideTooltip(true)
      if (title != null && target.getAttribute('title') == null)
        target.setAttribute('title', title)
    })
  }
}

function enhanceFootnotes(root: HTMLElement, cleanupFns: Array<() => void>) {
  const links = Array.from(root.querySelectorAll<HTMLElement>('.footnote-reference .footnote-link[href^="#"]'))
  for (const link of links) {
    const handleClick = (event: MouseEvent) => {
      const href = link.getAttribute('href')
      if (!href)
        return
      event.preventDefault()
      const target = document.getElementById(href.slice(1))
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    link.addEventListener('click', handleClick)
    cleanupFns.push(() => link.removeEventListener('click', handleClick))
  }
}

async function copyText(source: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(source)
      return
    }
  }
  catch {
    // Fall through to the textarea fallback below.
  }

  if (typeof document === 'undefined')
    return

  const textarea = document.createElement('textarea')
  textarea.value = source
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  }
  catch {
    // Ignore copy failures; the output callback still fires.
  }
  finally {
    textarea.remove()
  }
}
