import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import type { CodeBlockOptions, CodeBlockTheme, CodeBlockThemeProp, CodeBlockThemes } from '../types/codeBlock'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import { isLikelyIncompleteLanguageIdentifier, resolveHighlighterLanguage, resolveLanguageId } from '../languageIcon'
import { getString } from '../node-helpers'
import { getStreamDiffsRuntime } from '../optional-streamDiffs'
import { copyTextToClipboard } from '../richBlockHelpers'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { PreCodeNode } from './Nodes'

export interface CodeBlockNodeProps {
  node: SolidRenderableNode
  context?: SolidRenderContext
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  codeBlockOptions?: CodeBlockOptions
  theme?: CodeBlockThemeProp
  darkTheme?: CodeBlockTheme
  lightTheme?: CodeBlockTheme
  themes?: CodeBlockThemes
  minWidth?: string | number
  maxWidth?: string | number
  showHeader?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showCollapseButton?: boolean
  enableFontSizeControl?: boolean
  showFontSizeButtons?: boolean
  showLineNumbers?: boolean
  isShowPreview?: boolean
  htmlPreviewAllowScripts?: boolean
  htmlPreviewSandbox?: string
}

interface TextSelectionSnapshot {
  start: number
  end: number
}

function collectComposedTextNodes(root: Node) {
  const nodes: Text[] = []
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push(node as Text)
      return
    }
    for (const child of Array.from(node.childNodes))
      visit(child)
    if (node instanceof Element && node.shadowRoot)
      visit(node.shadowRoot)
  }
  visit(root)
  return nodes
}

function isComposedDescendant(root: Node, node: Node | null) {
  let current = node
  while (current) {
    if (current === root)
      return true
    current = current.parentNode ?? (current as ShadowRoot).host ?? null
  }
  return false
}

function captureTextSelection(root: HTMLElement): TextSelectionSnapshot | undefined {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !isComposedDescendant(root, selection.anchorNode) || !isComposedDescendant(root, selection.focusNode))
    return
  const textNodes = collectComposedTextNodes(root)
  const offsetFor = (node: Node | null, offset: number) => {
    let total = 0
    for (const text of textNodes) {
      if (text === node)
        return total + Math.min(Math.max(0, offset), text.data.length)
      total += text.data.length
    }
    return undefined
  }
  const start = offsetFor(selection.anchorNode, selection.anchorOffset)
  const end = offsetFor(selection.focusNode, selection.focusOffset)
  return start == null || end == null ? undefined : { start, end }
}

function isMissingHighlighterLanguage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /not found in bundled or custom languages/i.test(message)
    || /Language `[^`]+` is not included/i.test(message)
}

function restoreTextSelection(root: HTMLElement, snapshot: TextSelectionSnapshot | undefined) {
  if (!snapshot)
    return
  const textNodes = collectComposedTextNodes(root)
  const pointAt = (target: number) => {
    let remaining = Math.max(0, target)
    for (const text of textNodes) {
      if (remaining <= text.data.length)
        return { node: text, offset: remaining }
      remaining -= text.data.length
    }
    const last = textNodes.at(-1)
    return last ? { node: last, offset: last.data.length } : undefined
  }
  const start = pointAt(snapshot.start)
  const end = pointAt(snapshot.end)
  if (!start || !end)
    return
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * Keeps one stream-diffs runtime per mounted code node. Content changes use
 * updateCode/updateDiff; only a single/diff mode transition recreates the view.
 */
export function CodeBlockNode(props: CodeBlockNodeProps) {
  const [host, setHost] = createSignal<HTMLDivElement>()
  const [fallback, setFallback] = createSignal(true)
  const [copied, setCopied] = createSignal(false)
  const [collapsed, setCollapsed] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)
  const [previewOpen, setPreviewOpen] = createSignal(false)
  const [fontSize, setFontSize] = createSignal(Math.max(8, Math.min(32, props.codeBlockOptions?.fontSize ?? 12)))
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const applyFontSize = (next: number) => {
    const size = Math.max(8, Math.min(32, next))
    setFontSize(size)
    const element = root()
    if (element) {
      element.style.setProperty('--vscode-editor-font-size', `${size}px`)
      element.style.fontSize = `${size}px`
    }
  }
  let helpers: Awaited<ReturnType<typeof getStreamDiffsRuntime>> extends infer T ? T extends { createCodeBlockRuntime: (...args: any[]) => infer R } ? R : never : never
  let editorKind: 'single' | 'diff' | undefined
  let generation = 0
  let pendingSelection: TextSelectionSnapshot | undefined
  const unsupportedHighlighterLanguages = new Set<string>()

  const code = () => getString((props.node as any).diff ? (props.node as any).updatedCode ?? (props.node as any).code : (props.node as any).code)
  const original = () => getString((props.node as any).originalCode)
  const rawLanguage = () => getString((props.node as any).language)
  const language = () => resolveLanguageId(getString((props.node as any).language) || 'plaintext')
  const highlighterLanguage = () => resolveHighlighterLanguage(rawLanguage() || 'plaintext')
  const isLoading = () => props.loading ?? Boolean((props.node as any).loading)
  const shouldDeferStreamingLanguage = () => isLoading() && isLikelyIncompleteLanguageIdentifier(rawLanguage())
  const isDiff = () => Boolean((props.node as any).diff)
  const isPreviewable = () => props.isShowPreview !== false && ['html', 'svg'].includes(language())
  const requestedTheme = () => {
    if (typeof props.theme === 'string')
      return props.theme
    if (props.theme && typeof props.theme === 'object')
      return (props.isDark ?? props.context?.isDark) ? props.theme.dark : props.theme.light
    return (props.isDark ?? props.context?.isDark) ? (props.darkTheme ?? props.themes?.[0] ?? props.context?.codeBlockThemes?.darkTheme ?? 'vitesse-dark') : (props.lightTheme ?? props.themes?.[1] ?? props.context?.codeBlockThemes?.lightTheme ?? 'vitesse-light')
  }
  const showLineNumbers = () => props.showLineNumbers ?? (props.codeBlockOptions?.disableLineNumbers !== true && props.context?.codeBlockOptions?.disableLineNumbers !== true)
  const runtimeOptions = () => ({
    ...(props.context?.codeBlockOptions || {}),
    ...(props.codeBlockOptions || {}),
    stream: false,
    disableFileHeader: true,
    disableLineNumbers: !showLineNumbers(),
    fontSize: fontSize(),
    themes: props.themes ?? props.context?.codeBlockThemes?.themes ?? ['vitesse-dark', 'vitesse-light'],
    themeType: (props.isDark ?? props.context?.isDark) ? 'dark' : 'light',
  })

  createEffect(() => {
    const element = root()
    const size = fontSize()
    if (!element)
      return
    element.style.setProperty('--vscode-editor-font-size', `${size}px`)
    element.style.fontSize = `${size}px`
  })

  createEffect(() => {
    const target = host()
    const nextCode = code()
    const nextOriginal = original()
    const nextLanguage = highlighterLanguage()
    const nextDiff = isDiff()
    const theme = requestedTheme()
    if (!target || typeof window === 'undefined')
      return
    const task = ++generation
    if (shouldDeferStreamingLanguage()) {
      setFallback(true)
      return
    }
    // Take the selection snapshot synchronously. Optional runtime loading and
    // theme updates may yield before updateCode replaces its internal DOM.
    const currentSelection = captureTextSelection(target)
    if (currentSelection)
      pendingSelection = currentSelection
    void (async () => {
      const module = await getStreamDiffsRuntime()
      if (task !== generation || !module) {
        if (task === generation) {
          setFallback(true)
        }
        return
      }
      if (!helpers)
        helpers = module.createCodeBlockRuntime(runtimeOptions()) as typeof helpers
      const runtime = helpers
      await Promise.resolve(runtime?.setTheme?.(theme))
      await Promise.resolve((runtime as any)?.updateOptions?.({ fontSize: fontSize() }))
      if (task !== generation || !runtime)
        return
      const applyEditor = async (highlighterLanguage: string) => {
        const kind: 'single' | 'diff' = nextDiff ? 'diff' : 'single'
        if (editorKind !== kind) {
          if (editorKind) {
            try {
              runtime.safeClean?.() ?? runtime.cleanupEditor?.()
            }
            catch {}
          }
          target.replaceChildren()
          if (kind === 'diff' && runtime.createDiffEditor)
            await Promise.resolve(runtime.createDiffEditor(target, nextOriginal, nextCode, highlighterLanguage))
          else
            await Promise.resolve(runtime.createEditor?.(target, nextCode, highlighterLanguage))
          if (task !== generation)
            return
          editorKind = kind
        }
        if (task !== generation)
          return
        if (kind === 'diff' && runtime.updateDiff)
          await Promise.resolve(runtime.updateDiff(nextOriginal, nextCode, highlighterLanguage))
        else await Promise.resolve(runtime.updateCode?.(nextCode, highlighterLanguage))
      }
      const highlighterLanguage = unsupportedHighlighterLanguages.has(nextLanguage) ? 'plaintext' : nextLanguage
      try {
        await applyEditor(highlighterLanguage)
      }
      catch (error) {
        if (!isMissingHighlighterLanguage(error) || highlighterLanguage === 'plaintext')
          throw error
        unsupportedHighlighterLanguages.add(nextLanguage)
        editorKind = undefined
        await applyEditor('plaintext')
      }
      if (task === generation) {
        setFallback(false)
        queueMicrotask(() => {
          if (task === generation && host() === target) {
            const selection = pendingSelection
            pendingSelection = undefined
            restoreTextSelection(target, selection)
          }
        })
      }
    })().catch(() => {
      if (task === generation)
        setFallback(true)
    })
  })

  onCleanup(() => {
    generation += 1
    try {
      helpers?.cleanupEditor?.()
    }
    catch {}
    helpers = undefined as typeof helpers
  })

  const widthStyle = () => [props.minWidth ?? props.context?.codeBlockThemes?.minWidth, props.maxWidth ?? props.context?.codeBlockThemes?.maxWidth]
  const copy = async () => {
    await copyTextToClipboard(code())
    props.context?.events?.onCopy?.(code())
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1000)
  }
  return (
    <div ref={setRoot} class={`code-block-node code-block-container${expanded() ? ' is-expanded' : ''}${collapsed() ? ' is-collapsed' : ''}`} data-markstream-code-block="1" style={{ 'min-width': widthStyle()[0] == null ? undefined : String(widthStyle()[0]), 'max-width': widthStyle()[1] == null ? undefined : String(widthStyle()[1]) }}>
      {props.showHeader !== false && (
        <div class="code-block-header">
          <div class="code-block-header__meta">{isDiff() ? `Diff / ${language()}` : language()}</div>
          <div class="code-block-header__actions">
            {props.showCopyButton !== false && <button type="button" class="code-action-btn" aria-label={copied() ? 'Copied' : 'Copy'} onClick={() => void copy()}>{copied() ? '✓' : 'Copy'}</button>}
            {isPreviewable() && props.showPreviewButton !== false && <button type="button" class="code-action-btn" aria-label="Preview" onClick={() => setPreviewOpen(value => !value)}>Preview</button>}
            {props.showExpandButton !== false && <button type="button" class="code-action-btn" aria-pressed={expanded()} aria-label={expanded() ? 'Collapse' : 'Expand'} onClick={() => setExpanded(value => !value)}>{expanded() ? 'Collapse' : 'Expand'}</button>}
            {props.showCollapseButton !== false && <button type="button" class="code-action-btn" aria-pressed={collapsed()} aria-label={collapsed() ? 'Expand' : 'Collapse'} onClick={() => setCollapsed(value => !value)}>{collapsed() ? 'Expand' : 'Collapse'}</button>}
            {props.enableFontSizeControl !== false && props.showFontSizeButtons !== false && (
              <div class="code-block-font-controls">
                <button type="button" class="code-action-btn" aria-label="Decrease font size" onClick={() => applyFontSize(fontSize() - 1)}>−</button>
                <button type="button" class="code-action-btn" aria-label="Reset font size" onClick={() => applyFontSize(props.codeBlockOptions?.fontSize ?? 12)}>{fontSize()}</button>
                <button type="button" class="code-action-btn" aria-label="Increase font size" onClick={() => applyFontSize(fontSize() + 1)}>+</button>
              </div>
            )}
          </div>
        </div>
      )}
      {!collapsed() && (
        <div class={`code-block-body${expanded() ? ' code-block-body--expanded' : ''}`}>
          <div ref={setHost} class="code-block-node__editor code-editor-container" style={{ display: fallback() ? 'none' : undefined }} />
          {fallback() && <PreCodeNode node={{ ...(props.node as any), code: code() }} showLineNumbers={showLineNumbers()} />}
        </div>
      )}
      {previewOpen() && isPreviewable() && <HtmlPreviewFrame code={code()} title={`${language()} preview`} isDark={props.isDark ?? props.context?.isDark} htmlPreviewAllowScripts={props.htmlPreviewAllowScripts} htmlPreviewSandbox={props.htmlPreviewSandbox} onClose={() => { setPreviewOpen(false) }} />}
    </div>
  )
}
