/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

export interface CssHighlightToken {
  start: number
  end: number
  category: 'comment' | 'keyword' | 'string' | 'number' | 'type' | 'function'
}

export interface CssHighlightBenchmarkMetrics {
  enhanceCalls: number
  streamingSkips: number
  tokenizeCalls: number
  tokenizeMs: number
  rangeBuildMs: number
  registryMs: number
  rangeCount: number
  firstEnhancedAt: number | null
  lastDisposedAt: number | null
}

/** Optional probe consumed by the real-browser benchmark. */
export function getCssHighlightBenchmarkMetrics(): CssHighlightBenchmarkMetrics {
  const scope = globalThis as typeof globalThis & { __markstreamCssHighlightMetrics?: CssHighlightBenchmarkMetrics }
  if (!scope.__markstreamCssHighlightMetrics) {
    scope.__markstreamCssHighlightMetrics = {
      enhanceCalls: 0,
      streamingSkips: 0,
      tokenizeCalls: 0,
      tokenizeMs: 0,
      rangeBuildMs: 0,
      registryMs: 0,
      rangeCount: 0,
      firstEnhancedAt: null,
      lastDisposedAt: null,
    }
  }
  return scope.__markstreamCssHighlightMetrics
}

const SUPPORTED_LANGUAGES = new Set([
  'bash',
  'css',
  'html',
  'javascript',
  'js',
  'jsx',
  'json',
  'python',
  'py',
  'sh',
  'shell',
  'tsx',
  'typescript',
  'ts',
  'yaml',
  'yml',
])

export function isCssHighlightLanguageSupported(language: string) {
  return SUPPORTED_LANGUAGES.has(language.trim().toLowerCase())
}

interface LocalHighlightRegistry {
  set: (name: string, highlight: unknown) => void
  delete: (name: string) => void
}

const KEYWORDS = /\b(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/g
const TYPES = /\b(?:boolean|number|string|unknown|never|any|void|Promise|Array|Record|Date|Error|Map|Set)\b/g
const NUMBERS = /\b(?:0[xob][\da-f]+|\d+(?:\.\d+)?)\b/gi
const STRINGS = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g
const YAML_URLS = /\bhttps?:\/\/\S+/gi
const COMMENTS = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g
const HASH_COMMENTS = /#[^\n]*/g
const FUNCTIONS = /\b[A-Z_$][\w$]*(?=\s*\()/gi

function overlaps(a: CssHighlightToken, b: CssHighlightToken) {
  return a.start < b.end && b.start < a.end
}

/**
 * Deliberately small lexer for the PoC. It is not a TextMate replacement;
 * keeping it local makes the lifecycle and CSS Custom Highlight behavior
 * measurable without adding a runtime dependency to the default renderer.
 */
export function tokenizeCssHighlightCode(code: string, language: string): CssHighlightToken[] {
  if (!code || !isCssHighlightLanguageSupported(language))
    return []

  const tokens: CssHighlightToken[] = []
  const add = (regex: RegExp, category: CssHighlightToken['category']) => {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(code))) {
      const start = match.index
      const end = start + match[0].length
      if (!tokens.some(token => overlaps(token, { start, end, category })))
        tokens.push({ start, end, category })
      if (match[0].length === 0)
        regex.lastIndex++
    }
  }

  // Strings must claim their ranges before comment patterns. Otherwise a URL
  // such as `"https://example.com#section"` is split by `//` or `#` and the
  // whole literal loses its string highlight.
  add(STRINGS, 'string')
  if (['yaml', 'yml'].includes(language.toLowerCase()))
    add(YAML_URLS, 'string')
  add(COMMENTS, 'comment')
  if (['python', 'py', 'shell', 'bash', 'sh', 'yaml', 'yml'].includes(language.toLowerCase()))
    add(HASH_COMMENTS, 'comment')
  add(KEYWORDS, 'keyword')
  add(TYPES, 'type')
  add(NUMBERS, 'number')
  add(FUNCTIONS, 'function')
  return tokens.sort((a, b) => a.start - b.start || a.end - b.end)
}

function resolveTextPosition(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode() as Text | null
  while (node) {
    if (remaining <= node.data.length)
      return { node, offset: remaining }
    remaining -= node.data.length
    node = walker.nextNode() as Text | null
  }
  return null
}

function safeRegistryName(scopeId: string, category: string) {
  return `markstream-${scopeId}-${category}`.replace(/[^\w-]/g, '_')
}

/** Apply namespaced CSS highlights and return an idempotent disposer. */
export function applyCssHighlights(root: HTMLElement, code: string, language: string, scopeId: string): (() => void) | null {
  const css = (globalThis as unknown as { CSS?: { highlights?: LocalHighlightRegistry } }).CSS
  const HighlightCtor = (globalThis as { Highlight?: new (...ranges: unknown[]) => unknown }).Highlight
  const StaticRangeCtor = (globalThis as { StaticRange?: new (init: StaticRangeInit) => StaticRange }).StaticRange
  if (!css?.highlights || !HighlightCtor || !StaticRangeCtor || typeof document === 'undefined')
    return null

  const metrics = getCssHighlightBenchmarkMetrics()
  metrics.tokenizeCalls++
  const tokenizeStarted = typeof performance !== 'undefined' ? performance.now() : 0
  const tokens = tokenizeCssHighlightCode(code, language)
  metrics.tokenizeMs += (typeof performance !== 'undefined' ? performance.now() : 0) - tokenizeStarted
  const names = new Set<string>()
  const byCategory = new Map<string, unknown[]>()
  const rangeStarted = typeof performance !== 'undefined' ? performance.now() : 0
  let rangeCount = 0
  for (const token of tokens) {
    const start = resolveTextPosition(root, token.start)
    const end = resolveTextPosition(root, token.end)
    if (!start || !end)
      continue
    const name = safeRegistryName(scopeId, token.category)
    names.add(name)
    const ranges = byCategory.get(name) ?? []
    ranges.push(new StaticRangeCtor({
      startContainer: start.node,
      startOffset: start.offset,
      endContainer: end.node,
      endOffset: end.offset,
    }))
    byCategory.set(name, ranges)
    rangeCount++
  }
  metrics.rangeBuildMs += (typeof performance !== 'undefined' ? performance.now() : 0) - rangeStarted
  metrics.rangeCount += rangeCount

  const registryStarted = typeof performance !== 'undefined' ? performance.now() : 0
  for (const name of names)
    css.highlights.delete(name)
  for (const [name, ranges] of byCategory)
    css.highlights.set(name, new HighlightCtor(...ranges))
  metrics.registryMs += (typeof performance !== 'undefined' ? performance.now() : 0) - registryStarted
  if (metrics.firstEnhancedAt == null)
    metrics.firstEnhancedAt = typeof performance !== 'undefined' ? performance.now() : 0

  let disposed = false
  return () => {
    if (disposed)
      return
    disposed = true
    for (const name of names)
      css.highlights?.delete(name)
    metrics.lastDisposedAt = typeof performance !== 'undefined' ? performance.now() : 0
  }
}

export function cssHighlightStyleText(scopeId: string, dark = false) {
  const colors = dark
    ? { comment: '#8b949e', keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', type: '#d2a8ff', function: '#d2a8ff' }
    : { comment: '#6a737d', keyword: '#d73a49', string: '#032f62', number: '#005cc5', type: '#6f42c1', function: '#6f42c1' }
  const safe = (category: string) => safeRegistryName(scopeId, category)
  return Object.entries(colors)
    .map(([category, color]) => `::highlight(${safe(category)}) { color: ${color}; }`)
    .join('\n')
}
