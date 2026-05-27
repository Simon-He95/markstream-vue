import type { BaseNode, CustomComponentAttrs, HtmlPolicy, ParsedNode } from 'stream-markdown-parser'
import {
  DANGEROUS_HTML_ATTRS,
  getMarkdown,
  isHtmlTagBlocked,
  isUnsafeHtmlUrl,
  NON_STRUCTURING_HTML_TAGS,
  normalizeCustomHtmlTagName,
  normalizeCustomHtmlTags,
  sanitizeHtmlContent,
  sanitizeImageSrc,
  shouldOpenLinkInNewTab,
  URL_HTML_ATTRS,
} from 'stream-markdown-parser'

export type NestedRenderableNode = (ParsedNode | BaseNode) & Record<string, unknown>

type NestedClassValue = string | readonly string[] | null | undefined

export interface NestedMarkdownHtmlOptions {
  cacheKey?: string
  customHtmlTags?: readonly string[]
  allowHtml?: boolean
  htmlPolicy?: HtmlPolicy
  customNodeTag?: string
  customNodeClass?: NestedClassValue | ((node: NestedRenderableNode) => NestedClassValue)
}

export interface NestedMarkdownHtmlInput {
  node?: NestedRenderableNode | null
  nodes?: readonly NestedRenderableNode[] | null
  content?: string | null
}

interface RenderContext {
  markdown: ReturnType<typeof getMarkdown>
  options: Required<Pick<NestedMarkdownHtmlOptions, 'allowHtml' | 'customNodeTag' | 'htmlPolicy'>> & Pick<NestedMarkdownHtmlOptions, 'customNodeClass'>
}

const DEFAULT_CACHE_KEY = 'markstream-vue2-nested-html'
const DEFAULT_CUSTOM_NODE_TAG = 'div'
const markdownCache = new Map<string, ReturnType<typeof getMarkdown>>()
const KNOWN_NODE_TYPES = new Set([
  'admonition',
  'blockquote',
  'checkbox',
  'checkbox_input',
  'code_block',
  'definition_item',
  'definition_list',
  'emoji',
  'emphasis',
  'footnote',
  'footnote_reference',
  'footnote_anchor',
  'hardbreak',
  'heading',
  'highlight',
  'html_block',
  'html_inline',
  'image',
  'inline_code',
  'insert',
  'link',
  'list',
  'list_item',
  'math_block',
  'math_inline',
  'paragraph',
  'reference',
  'strikethrough',
  'strong',
  'subscript',
  'superscript',
  'table',
  'table_cell',
  'table_row',
  'text',
  'thematic_break',
])

export function renderNestedMarkdownToHtml(
  input: NestedMarkdownHtmlInput,
  options: NestedMarkdownHtmlOptions = {},
): string {
  const ctx = createRenderContext(options)
  return renderNestedInputToHtml(input, ctx)
}

export function renderMarkdownNodesToHtml(
  nodes: readonly NestedRenderableNode[] | null | undefined,
  options: NestedMarkdownHtmlOptions = {},
): string {
  const ctx = createRenderContext(options)
  return renderNodesToHtml(nodes, ctx)
}

export function renderMarkdownNodeToHtml(
  node: NestedRenderableNode | null | undefined,
  options: NestedMarkdownHtmlOptions = {},
): string {
  const ctx = createRenderContext(options)
  return renderNodeToHtml(node, ctx)
}

function createRenderContext(options: NestedMarkdownHtmlOptions): RenderContext {
  const normalizedTags = normalizeCustomHtmlTags(options.customHtmlTags)
  const cacheKey = `${options.cacheKey || DEFAULT_CACHE_KEY}::${normalizedTags.join(',')}`
  let markdown = markdownCache.get(cacheKey)

  if (!markdown) {
    markdown = getMarkdown(cacheKey, {
      customHtmlTags: normalizedTags,
    })
    markdownCache.set(cacheKey, markdown)
  }

  return {
    markdown,
    options: {
      allowHtml: options.allowHtml !== false,
      htmlPolicy: options.htmlPolicy ?? 'safe',
      customNodeTag: normalizeCustomHtmlTagName(options.customNodeTag) || DEFAULT_CUSTOM_NODE_TAG,
      customNodeClass: options.customNodeClass,
    },
  }
}

function renderNestedInputToHtml(input: NestedMarkdownHtmlInput, ctx: RenderContext): string {
  if (Array.isArray(input.nodes) && input.nodes.length > 0)
    return renderNodesToHtml(input.nodes, ctx)

  const node = input.node
  if (node) {
    const children = getNodeList(node.children)
    if (children.length > 0)
      return renderNodesToHtml(children, ctx)

    const content = getString(node.content)
    if (content)
      return renderMarkdownFragment(content, ctx)

    if (node.raw != null)
      return escapeHtml(getString(node.raw))
  }

  return input.content ? renderMarkdownFragment(getString(input.content), ctx) : ''
}

function renderNodesToHtml(nodes: readonly NestedRenderableNode[] | null | undefined, ctx: RenderContext): string {
  return (Array.isArray(nodes) ? nodes : []).map(node => renderNodeToHtml(node, ctx)).join('')
}

function renderNodeToHtml(node: NestedRenderableNode | null | undefined, ctx: RenderContext): string {
  if (!node || typeof node !== 'object')
    return ''

  switch (node.type) {
    case 'text':
      return escapeHtml(getString(node.content))
    case 'paragraph':
      return `<p>${renderNodesToHtml(getNodeList(node.children), ctx)}</p>`
    case 'strong':
      return `<strong>${renderNodesToHtml(getNodeList(node.children), ctx)}</strong>`
    case 'emphasis':
      return `<em>${renderNodesToHtml(getNodeList(node.children), ctx)}</em>`
    case 'strikethrough':
      return `<del>${renderNodesToHtml(getNodeList(node.children), ctx)}</del>`
    case 'highlight':
      return `<mark>${renderNodesToHtml(getNodeList(node.children), ctx)}</mark>`
    case 'insert':
      return `<ins>${renderNodesToHtml(getNodeList(node.children), ctx)}</ins>`
    case 'subscript':
      return `<sub>${renderNodesToHtml(getNodeList(node.children), ctx)}</sub>`
    case 'superscript':
      return `<sup>${renderNodesToHtml(getNodeList(node.children), ctx)}</sup>`
    case 'inline_code':
      return `<code>${escapeHtml(getString(node.code))}</code>`
    case 'hardbreak':
      return '<br>'
    case 'link':
      return renderLinkNode(node, ctx)
    case 'image':
      return renderImageNode(node)
    case 'list':
      return renderListNode(node, ctx)
    case 'list_item':
      return `<li>${renderNodesToHtml(getNodeList(node.children), ctx)}</li>`
    case 'blockquote':
      return `<blockquote>${renderNodesToHtml(getNodeList(node.children), ctx)}</blockquote>`
    case 'heading':
      return renderHeadingNode(node, ctx)
    case 'code_block':
      return renderCodeBlockNode(node)
    case 'thematic_break':
      return '<hr>'
    case 'table':
      return renderTableNode(node, ctx)
    case 'table_row':
      return renderTableRowNode(node, ctx)
    case 'table_cell':
      return renderTableCellNode(node, ctx)
    case 'definition_list':
      return renderDefinitionListNode(node, ctx)
    case 'definition_item':
      return renderDefinitionItemNode(node, ctx)
    case 'footnote':
      return renderFootnoteNode(node, ctx)
    case 'footnote_reference':
      return renderFootnoteReferenceNode(node)
    case 'footnote_anchor':
      return renderFootnoteAnchorNode(node)
    case 'admonition':
      return renderAdmonitionNode(node, ctx)
    case 'checkbox':
    case 'checkbox_input':
      return `<input type="checkbox" disabled${node.checked ? ' checked' : ''}>`
    case 'emoji':
      return escapeHtml(getString(node.raw || node.markup || node.content || node.name))
    case 'math_inline':
      return `<span class="markstream-nested-math" data-display="inline">${escapeHtml(getString(node.content || node.markup || node.raw))}</span>`
    case 'math_block':
      return `<pre class="markstream-nested-math-block"><code>${escapeHtml(getString(node.content || node.markup || node.raw))}</code></pre>`
    case 'reference':
      return `<sup class="markstream-nested-reference">[${escapeHtml(getString(node.id))}]</sup>`
    case 'html_inline':
    case 'html_block':
      return renderHtmlNode(node, ctx)
    default:
      return renderCustomOrFallbackNode(node, ctx)
  }
}

function renderLinkNode(node: NestedRenderableNode, ctx: RenderContext): string {
  const href = getString(node.href)
  const title = getString(node.title)
  const content = getNodeList(node.children).length > 0
    ? renderNodesToHtml(getNodeList(node.children), ctx)
    : escapeHtml(getString(node.text || href))
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : ''
  const safeHref = href && !isUnsafeHtmlUrl(href) ? href : ''
  const hrefAttr = safeHref ? ` href="${escapeAttr(safeHref)}"` : ''
  const externalAttrs = shouldOpenLinkInNewTab(safeHref) ? ' target="_blank" rel="noreferrer noopener"' : ''
  return `<a${hrefAttr}${titleAttr}${externalAttrs}>${content}</a>`
}

function renderImageNode(node: NestedRenderableNode): string {
  const src = sanitizeImageSrc(node.src)
  if (!src)
    return ''
  const alt = getString(node.alt)
  const title = getString(node.title)
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : ''
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${titleAttr}>`
}

function renderListNode(node: NestedRenderableNode, ctx: RenderContext): string {
  const tag = node.ordered ? 'ol' : 'ul'
  const start = node.ordered && Number.isFinite(node.start) ? ` start="${Number(node.start)}"` : ''
  return `<${tag}${start}>${renderNodesToHtml(getNodeList(node.items), ctx)}</${tag}>`
}

function renderHeadingNode(node: NestedRenderableNode, ctx: RenderContext): string {
  const level = clampHeadingLevel(node.level)
  return `<h${level}>${renderNodesToHtml(getNodeList(node.children), ctx)}</h${level}>`
}

function renderCodeBlockNode(node: NestedRenderableNode): string {
  const language = sanitizeClassToken(getString(node.language))
  const languageClass = language ? ` class="language-${language}"` : ''
  return `<pre><code${languageClass}>${escapeHtml(getString(node.code))}</code></pre>`
}

function renderTableNode(node: NestedRenderableNode, ctx: RenderContext): string {
  const header = node.header ? renderTableRowNode(node.header as NestedRenderableNode, ctx, true) : ''
  const rows = renderNodesToHtml(getNodeList(node.rows), ctx)
  const thead = header ? `<thead>${header}</thead>` : ''
  const tbody = rows ? `<tbody>${rows}</tbody>` : ''
  return `<table>${thead}${tbody}</table>`
}

function renderTableRowNode(node: NestedRenderableNode, ctx: RenderContext, forceHeader = false): string {
  const cells = getNodeList(node.cells).map(cell => renderTableCellNode(cell, ctx, forceHeader)).join('')
  return `<tr>${cells}</tr>`
}

function renderTableCellNode(node: NestedRenderableNode, ctx: RenderContext, forceHeader = false): string {
  const tag = forceHeader || !!node.header ? 'th' : 'td'
  const align = getString(node.align)
  const alignAttr = align ? ` style="text-align:${escapeAttr(align)}"` : ''
  return `<${tag}${alignAttr}>${renderNodesToHtml(getNodeList(node.children), ctx)}</${tag}>`
}

function renderDefinitionListNode(node: NestedRenderableNode, ctx: RenderContext): string {
  return `<dl>${getNodeList(node.items).map(item => renderDefinitionItemNode(item, ctx)).join('')}</dl>`
}

function renderDefinitionItemNode(node: NestedRenderableNode, ctx: RenderContext): string {
  const term = renderNodesToHtml(getNodeList(node.term), ctx)
  const definition = renderNodesToHtml(getNodeList(node.definition), ctx)
  return `<dt>${term}</dt><dd>${definition}</dd>`
}

function renderFootnoteNode(node: NestedRenderableNode, ctx: RenderContext): string {
  const id = escapeAttr(getString(node.id))
  return `<div id="fnref--${id}" class="footnote-node markstream-nested-footnote"><div class="footnote-node__content">${renderNodesToHtml(getNodeList(node.children), ctx)}</div></div>`
}

function renderFootnoteReferenceNode(node: NestedRenderableNode): string {
  const id = escapeHtml(getString(node.id))
  const href = escapeAttr(getString(node.id))
  return `<sup id="fnref-${href}" class="footnote-reference markstream-nested-footnote-ref"><span href="#fnref--${href}" title="查看脚注 ${href}" class="footnote-link cursor-pointer">[${id}]</span></sup>`
}

function renderFootnoteAnchorNode(node: NestedRenderableNode): string {
  const id = escapeAttr(getString(node.id))
  return `<a class="footnote-anchor" href="#fnref-${id}" title="返回引用 ${id}" aria-label="返回引用 ${id}">↩︎</a>`
}

function renderAdmonitionNode(node: NestedRenderableNode, ctx: RenderContext): string {
  const kind = sanitizeClassToken(getString(node.kind || 'note')) || 'note'
  const title = getString(node.title) || capitalize(kind)
  return `<div class="markstream-nested-admonition markstream-nested-admonition--${kind}"><div class="markstream-nested-admonition__title">${escapeHtml(title)}</div><div class="markstream-nested-admonition__content">${renderNodesToHtml(getNodeList(node.children), ctx)}</div></div>`
}

function renderHtmlNode(node: NestedRenderableNode, ctx: RenderContext): string {
  const content = getString(node.content)
  const rawContent = content || getString(node.raw)
  const tag = getString(node.tag).trim().toLowerCase()
  const children = getNodeList(node.children)
  if (!ctx.options.allowHtml)
    return escapeHtml(rawContent)
  if (ctx.options.htmlPolicy === 'escape')
    return escapeHtml(rawContent)
  if (node.loading && !node.autoClosed)
    return escapeHtml(rawContent)
  if (tag && children.length > 0 && !NON_STRUCTURING_HTML_TAGS.has(tag) && !isHtmlTagBlocked(tag, ctx.options.htmlPolicy)) {
    const attrs = serializeAttrs(node.attrs as CustomComponentAttrs | undefined)
    return `<${tag}${attrs}>${renderNodesToHtml(children, ctx)}</${tag}>`
  }
  return sanitizeHtmlContent(rawContent, ctx.options.htmlPolicy)
}

function renderCustomOrFallbackNode(node: NestedRenderableNode, ctx: RenderContext): string {
  const tagName = getString(node.tag || node.type)
  if (!tagName || KNOWN_NODE_TYPES.has(tagName))
    return escapeHtml(getString(node.content || node.raw))

  const classes = [
    'markstream-nested-custom',
    `markstream-nested-custom--${sanitizeClassToken(tagName) || 'node'}`,
    resolveCustomNodeClass(node, ctx.options.customNodeClass),
  ].filter(Boolean).join(' ')
  const attrs = serializeAttrs(node.attrs as CustomComponentAttrs | undefined, classes)
  const body = resolveCustomNodeBody(node, ctx)
  const wrapperTag = ctx.options.customNodeTag
  return `<${wrapperTag}${attrs} data-markstream-custom-tag="${escapeAttr(tagName)}">${body}</${wrapperTag}>`
}

function resolveCustomNodeBody(node: NestedRenderableNode, ctx: RenderContext): string {
  const children = getNodeList(node.children)
  if (children.length > 0)
    return renderNodesToHtml(children, ctx)

  const content = getString(node.content)
  if (content)
    return renderMarkdownFragment(content, ctx)

  return escapeHtml(getString(node.raw))
}

function renderMarkdownFragment(content: string, ctx: RenderContext): string {
  return content ? ctx.markdown.render(content) : ''
}

function resolveCustomNodeClass(
  node: NestedRenderableNode,
  customNodeClass?: NestedMarkdownHtmlOptions['customNodeClass'],
): string {
  if (!customNodeClass)
    return ''
  const resolved = typeof customNodeClass === 'function'
    ? customNodeClass(node)
    : customNodeClass
  return serializeClassValue(resolved)
}

function serializeClassValue(value: NestedClassValue): string {
  if (Array.isArray(value))
    return value.map(item => serializeClassValue(item)).filter(Boolean).join(' ')
  return typeof value === 'string'
    ? value.trim()
    : ''
}

function serializeAttrs(attrs?: CustomComponentAttrs | null, extraClass = ''): string {
  const pairs = normalizeAttrs(attrs)
  const rendered: string[] = []
  const mergedClasses = [extraClass]

  for (const [name, value] of pairs) {
    const safeName = String(name).trim()
    const lowerName = safeName.toLowerCase()
    if (!safeName || !isSafeAttrName(safeName))
      continue
    if (DANGEROUS_HTML_ATTRS.has(lowerName))
      continue
    if (value !== true && URL_HTML_ATTRS.has(lowerName) && value && isUnsafeHtmlUrl(String(value), { attrName: lowerName }))
      continue
    if (lowerName === 'class') {
      mergedClasses.push(String(value))
      continue
    }
    if (value === true)
      rendered.push(` ${safeName}`)
    else
      rendered.push(` ${safeName}="${escapeAttr(String(value))}"`)
  }

  const className = mergedClasses.map(value => value.trim()).filter(Boolean).join(' ')
  if (className)
    rendered.unshift(` class="${escapeAttr(className)}"`)
  return rendered.join('')
}

function normalizeAttrs(attrs?: CustomComponentAttrs | null): Array<[string, string | boolean]> {
  if (!attrs)
    return []

  if (Array.isArray(attrs)) {
    if (attrs.length === 0)
      return []
    const first = attrs[0]
    if (Array.isArray(first))
      return (attrs as [string, string][]).map(([name, value]) => [String(name), value])
    return (attrs as Array<{ name: string, value: string | boolean }>).map(item => [String(item.name), item.value])
  }

  return Object.entries(attrs).map(([name, value]) => [name, value])
}

function getNodeList(value: unknown): NestedRenderableNode[] {
  return Array.isArray(value)
    ? value.filter((item): item is NestedRenderableNode => !!item && typeof item === 'object')
    : []
}

function getString(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value == null
      ? ''
      : String(value)
}

function isSafeAttrName(value: string): boolean {
  return /^[^\s"'<>`=]+$/.test(value) && !/^on/i.test(value)
}

function sanitizeClassToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

function clampHeadingLevel(value: unknown): number {
  const level = Math.trunc(Number(value) || 1)
  return Math.min(6, Math.max(1, level))
}

function escapeHtml(value: unknown): string {
  return getString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : ''
}
