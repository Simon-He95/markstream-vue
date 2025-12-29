import type { MarkdownIt, MarkdownItPlugin } from 'markdown-it-ts'
import type { FactoryOptions } from './factory'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItIns from 'markdown-it-ins'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'

import markdownItSup from 'markdown-it-sup'
import * as markdownItCheckbox from 'markdown-it-task-checkbox'
import { factory } from './factory'
import {
  parseInlineTokens,
  parseMarkdownToStructure,
  processTokens,
} from './parser'

// Module-level registry for callers that want to add plugins to every
// `getMarkdown()` instance without modifying call sites. Useful for tests
// or apps that want a central place to `use` plugins.
const _registeredMarkdownPlugins: Array<unknown> = []

export function registerMarkdownPlugin(plugin: unknown) {
  _registeredMarkdownPlugins.push(plugin)
}

export function clearRegisteredMarkdownPlugins() {
  _registeredMarkdownPlugins.length = 0
}

// Re-export config
export { setDefaultMathOptions } from './config'

// Re-export parser functions
export { parseInlineTokens, parseMarkdownToStructure, processTokens }
export type { MathOptions } from './config'
export type { MarkdownIt }

// Re-export utilities
export { findMatchingClose } from './findMatchingClose'

export { parseFenceToken } from './parser/inline-parsers/fence-parser'
// Re-export plugins
export { applyContainers } from './plugins/containers'

export { ESCAPED_TEX_BRACE_COMMANDS, isMathLike, TEX_BRACE_COMMANDS } from './plugins/isMathLike'
export { applyMath, KATEX_COMMANDS, normalizeStandaloneBackslashT } from './plugins/math'
// Re-export the node types for backward compatibility
export * from './types'

export interface GetMarkdownOptions extends FactoryOptions {
  plugin?: Array<unknown>
  apply?: Array<(md: MarkdownIt) => void>
  /**
   * Custom translation function or translation map for UI texts
   * @default { 'common.copy': 'Copy' }
   */
  i18n?: ((key: string) => string) | Record<string, string>
}

export function getMarkdown(msgId: string = `editor-${Date.now()}`, options: GetMarkdownOptions = {}) {
  // keep legacy behaviour but delegate to new factory and reapply project-specific rules
  const md = factory(options)

  // Setup i18n translator function
  const defaultTranslations: Record<string, string> = {
    'common.copy': 'Copy',
  }

  let t: (key: string) => string
  if (typeof options.i18n === 'function') {
    t = options.i18n
  }
  else if (options.i18n && typeof options.i18n === 'object') {
    const i18nMap = options.i18n as Record<string, string>
    t = (key: string) => i18nMap[key] ?? defaultTranslations[key] ?? key
  }
  else {
    t = (key: string) => defaultTranslations[key] ?? key
  }

  // apply user supplied plugins (md.use)
  if (Array.isArray(options.plugin)) {
    for (const p of options.plugin) {
      // allow both [plugin, opts] tuple or plugin function
      const pluginItem = p as unknown
      if (Array.isArray(pluginItem)) {
        const fn = pluginItem[0]
        const opts = pluginItem[1]
        if (typeof fn === 'function')
          md.use(fn, opts)
      }
      else if (typeof pluginItem === 'function') {
        md.use(pluginItem as MarkdownItPlugin)
      }
      // otherwise ignore non-callable plugins
    }
  }

  // apply user supplied apply functions to mutate the md instance (e.g. md.block.ruler.before(...))
  if (Array.isArray(options.apply)) {
    for (const fn of options.apply) {
      try {
        fn(md)
      }
      catch (e) {
        // swallow errors to preserve legacy behaviour; developers can see stack in console

        console.error('[getMarkdown] apply function threw an error', e)
      }
    }
  }

  // Apply any globally registered plugins (via registerMarkdownPlugin)
  if (_registeredMarkdownPlugins.length) {
    for (const p of _registeredMarkdownPlugins) {
      if (Array.isArray(p)) {
        const fn = p[0] as any
        const opts = p[1]
        if (typeof fn === 'function')
          md.use(fn, opts)
      }
      else if (typeof p === 'function') {
        md.use(p as MarkdownItPlugin)
      }
      // ignore non-callable registrations
    }
  }

  // Re-apply a few project specific plugins that were previously always enabled
  md.use(markdownItSub)
  md.use(markdownItSup)
  md.use(markdownItMark)
  // Safely resolve default export or the module itself for checkbox plugin
  type CheckboxPluginFn = (md: MarkdownIt, opts?: unknown) => void
  const markdownItCheckboxPlugin = ((markdownItCheckbox as unknown) as {
    default?: CheckboxPluginFn
  }).default ?? markdownItCheckbox
  md.use(markdownItCheckboxPlugin)
  md.use(markdownItIns)
  md.use(markdownItFootnote)

  // Annotate fence tokens with unclosed meta using a lightweight line check
  md.core.ruler.after('block', 'mark_fence_closed', (state: unknown) => {
    const s = state as unknown as {
      src: string
      env?: Record<string, unknown>
      tokens: Array<{ type?: string, map?: number[], markup?: string, meta?: Record<string, unknown> }>
    }
    const src: string = s.src
    const envFinal = !!s.env?.__markstreamFinal
    const lines = src.split(/\r?\n/)
    for (const token of s.tokens) {
      if (token.type !== 'fence' || !token.map || !token.markup)
        continue
      const openLine: number = token.map[0]
      const endLine: number = token.map[1]
      const markup: string = token.markup
      const marker = markup[0]
      const minLen = markup.length
      // The closing line, if exists, should be the last line consumed by the block
      const lineIdx = Math.max(0, endLine - 1)
      const line = lines[lineIdx] ?? ''
      let i = 0
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
      let count = 0
      while (i + count < line.length && line[i + count] === marker) count++
      let j = i + count
      while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++
      const closed = envFinal ? true : (endLine > openLine + 1 && count >= minLen && j === line.length)
      const tokenShape = token as unknown as { meta?: Record<string, unknown> }
      tokenShape.meta = tokenShape.meta ?? {}
      ; (tokenShape.meta as Record<string, unknown>).unclosed = !closed
      // also set a explicit `closed` boolean for compatibility with plugins/tests
      ; (tokenShape.meta as Record<string, unknown>).closed = !!closed
    }
  })

  // wave rule (legacy)
  const waveRule = (state: unknown, silent: boolean) => {
    const s = state as unknown as { pos: number, src: string, push: (type: string, tag?: string, nesting?: number) => any }
    const start = s.pos
    if (s.src[start] !== '~')
      return false
    const prevChar = s.src[start - 1]
    const nextChar = s.src[start + 1]
    if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
      if (!silent) {
        const token = s.push('text', '', 0)
        token.content = '~'
      }
      s.pos += 1
      return true
    }
    return false
  }

  md.inline.ruler.before('sub', 'wave', waveRule)

  // custom fence that uses msgId for unique ids
  md.renderer.rules.fence = (tokens: unknown, idx: number) => {
    const tokensAny = tokens as unknown as import('./types').MarkdownToken[]
    const token = tokensAny[idx]
    const tokenShape = token as unknown as { info?: string, content?: string }
    const info = String(tokenShape.info ?? '').trim()
    const str = String(tokenShape.content ?? '')
    const encodedCode = btoa(unescape(encodeURIComponent(str)))
    const language = String(info ?? 'text')
    const uniqueId = `editor-${msgId}-${idx}-${language}`

    return `<div class="code-block" data-code="${encodedCode}" data-lang="${language}" id="${uniqueId}">
      <div class="code-header">
        <span class="code-lang">${language.toUpperCase()}</span>
        <button class="copy-button" data-code="${encodedCode}">${t(
          'common.copy',
        )}</button>
      </div>
      <div class="code-editor"></div>
    </div>`
  }

  // reference rule (legacy)
  const RE_REFERENCE = /^\[(\d+)\]/
  const referenceInline = (state: unknown, silent: boolean) => {
    const s = state as unknown as { src: string, pos: number, push: (type: string, tag?: string, nesting?: number) => any }
    if (s.src[s.pos] !== '[')
      return false
    const match = RE_REFERENCE.exec(s.src.slice(s.pos))
    if (!match)
      return false
    if (!silent) {
      const id = match[1]
      const token = s.push('reference', 'span', 0)
      token.content = id
      token.markup = match[0]
    }
    s.pos += match[0].length
    return true
  }

  md.inline.ruler.before('escape', 'reference', referenceInline)
  md.renderer.rules.reference = (tokens: unknown, idx: number) => {
    const tokensAny = tokens as unknown as import('./types').MarkdownToken[]
    const id = String(tokensAny[idx].content ?? '')
    return `<span class="reference-link" data-reference-id="${id}" role="button" tabindex="0" title="Click to view reference">${id}</span>`
  }

  return md
}
