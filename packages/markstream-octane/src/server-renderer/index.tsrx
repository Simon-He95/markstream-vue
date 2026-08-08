import type {
  DefinitionItemNode as DefinitionItemNodeType,
  HtmlPolicy,
  ListItemNode as ListItemNodeType,
  MarkdownIt,
  ParsedNode,
  ParseOptions,
  TableCellNode as TableCellNodeType,
  TableRowNode as TableRowNodeType,
} from 'stream-markdown-parser'
import type { HtmlPreviewFrameProps } from '../components/CodeBlockNode/HtmlPreviewFrame.tsrx'
import type { TooltipProps } from '../components/Tooltip/Tooltip.tsrx'
import type { CustomComponentMap, HtmlComponentMap, StreamingComponentMap } from '../customComponents'
import type { NodeRendererProps, RenderContext } from '../types'
import type {
  CodeBlockNodeProps,
  D2BlockNodeProps,
  ImageNodeProps,
  InfographicBlockNodeProps,
  LinkNodeProps,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MermaidBlockNodeProps,
  PreCodeNodeProps,
} from '../types/component-props'
import type { NodeComponentProps } from '../types/node-component'
import type { OctaneHeadingAttributes, OctaneSpanAttributes, OctaneStyle } from '../types/octane'
import { normalizeShikiLanguage } from 'markstream-core'
import * as Octane from 'octane'
import {
  convertHtmlAttrsToProps,
  getMarkdown,
  isHtmlTagBlocked,
  mergeCustomHtmlTags,
  NON_STRUCTURING_HTML_TAGS,
  normalizeCustomHtmlTagName,
  parseMarkdownToStructure,
  sanitizeHtmlAttrs,
  sanitizeHtmlTokenAttrs,
  sanitizeImageSrc,
  shouldOpenLinkInNewTab,
  shouldRenderUnknownHtmlTagAsText,
  stripCustomHtmlWrapper,
  tokenAttrsToRecord,
} from 'stream-markdown-parser'
import { clampInfographicPreviewHeight, estimateInfographicPreviewHeight, parsePositiveNumber as parsePositiveInfographicNumber } from '../components/InfographicBlockNode/height'
import { clampMermaidPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber as parsePositiveMermaidNumber } from '../components/MermaidBlockNode/height'
import {
  getCustomNodeComponents,
  normalizeComponentMap,
  warnComponentMapConflicts,
} from '../customComponents'
import { getCodeBlockExtraProps } from '../renderers/codeBlockExtraProps'
import { BLOCK_LEVEL_TYPES, renderInline, renderNodeChildren, tokenAttrsToProps } from '../renderers/renderChildren.tsrx'
import { isParagraphBreakingCustomHtmlNode, resolveCustomHtmlTag } from '../utils/customHtmlTag'
import { normalizeDomAttrs } from '../utils/htmlToOctane'
import { normalizeLanguageIdentifier } from '../utils/languageIcon'
import { parseHtmlToOctaneNodes } from './html.tsrx'
import { renderKatexToHtml } from './katex'

const fallbackMarkdown = getMarkdown()

function formatLanguageLabel(language: unknown) {
  const normalized = normalizeLanguageIdentifier(String(language ?? ''))
  if (!normalized || normalized === 'plaintext')
    return 'Text'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function normalizePreLanguage(raw: unknown) {
  const head = String(String(raw ?? '').split(/\s+/g)[0] ?? '').toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
}

function renderStaticCodeShell(
  className: string,
  node: {
    language?: string | null
    code?: string | null
    raw?: string | null
    loading?: boolean
  },
  opts: {
    showHeader?: boolean
    fallback: string
  },
) {
  const normalizedLanguage = normalizePreLanguage(node.language)
  const code = String(node.code ?? node.raw ?? '')
  const label = formatLanguageLabel(node.language)

  return (
    <div className={`${className} ${className}--ssr`} data-ssr-fallback={opts.fallback}>
      {opts.showHeader !== false && (
        <div className={`${className}__header`}>
          <span className={`${className}__language`}>{label}</span>
        </div>
      )}
      <div className={`${className}__body`}>
        <pre
          className={`language-${normalizedLanguage}`}
          aria-busy={node.loading === true}
          aria-label={normalizedLanguage ? `Code block: ${normalizedLanguage}` : 'Code block'}
          data-language={normalizedLanguage}
          tabIndex={0}
        >
          <code translate="no">{code}</code>
        </pre>
      </div>
    </div>
  )
}

function mergeHtmlBlockWrapperProps(
  attrs?: [string, string | null][] | null,
  htmlPolicy: HtmlPolicy = 'safe',
  tagName?: string,
) {
  const normalized = normalizeDomAttrs((tokenAttrsToProps(sanitizeHtmlTokenAttrs(attrs ?? undefined, htmlPolicy, tagName)) as Record<string, string> | undefined) || {})
  const next = { ...normalized }
  const existing = typeof next.className === 'string' ? next.className.trim() : ''
  next.className = existing ? `html-block-node ${existing}` : 'html-block-node'
  return next
}

function renderCustomCodeBlockComponent(
  component: any,
  node: any,
  key: string | number | bigint,
  ctx: RenderContext,
  specialProps: Record<string, unknown> = {},
) {
  const extraProps = getCodeBlockExtraProps(ctx.codeBlockProps)

  return Octane.createElement(component as any, {
    key,
    node,
    loading: Boolean(node.loading),
    stream: ctx.codeBlockStream,
    customId: ctx.customId,
    isDark: ctx.isDark,
    darkTheme: ctx.codeBlockThemes?.darkTheme,
    lightTheme: ctx.codeBlockThemes?.lightTheme,
    themes: ctx.codeBlockThemes?.themes,
    langs: ctx.codeBlockThemes?.langs,
    minWidth: ctx.codeBlockThemes?.minWidth,
    maxWidth: ctx.codeBlockThemes?.maxWidth,
    onCopy: ctx.events.onCopy,
    ...extraProps,
    ...specialProps,
    ctx,
    renderNode,
    indexKey: key,
    typewriter: ctx.typewriter,
    fade: ctx.fade,
  })
}

function renderSpecialCodeBlockComponent(
  component: any,
  node: any,
  key: string | number | bigint,
  ctx: RenderContext,
  specialProps: Record<string, unknown> = {},
) {
  return Octane.createElement(component as any, {
    key,
    node,
    isDark: ctx.isDark,
    ...specialProps,
  })
}

function getParserCustomTagNodeTag(node: ParsedNode) {
  if (node.type === 'html_block' || node.type === 'html_inline')
    return ''

  const type = normalizeCustomHtmlTagName(node.type)
  const tag = normalizeCustomHtmlTagName((node as any).tag)
  return type && tag && type === tag ? type : ''
}

function renderHtmlComponentForCustomTagNode(
  component: Octane.ComponentBody<any>,
  node: ParsedNode,
  key: string | number | bigint,
  ctx: RenderContext,
  tag: string,
): Octane.OctaneNode {
  const attrs = sanitizeHtmlTokenAttrs((node as any).attrs ?? undefined, ctx.htmlPolicy ?? 'safe', tag)
  const props = convertHtmlAttrsToProps(tokenAttrsToRecord(attrs))
  const children: Octane.OctaneNode = Array.isArray((node as any).children)
    ? renderNodeChildren((node as any).children, ctx, `${String(key)}-html`, renderNode)
    : ((node as any).content ?? null)

  return Octane.createElement(component, {
    ...props,
    key,
  }, children)
}

function createRenderContext(
  props: NodeRendererProps,
  customComponents: CustomComponentMap,
  streamingComponents: NonNullable<RenderContext['streamingComponents']>,
  htmlComponents: NonNullable<RenderContext['htmlComponents']>,
  indexPrefix: string,
  customHtmlTags: readonly string[],
  final?: boolean,
): RenderContext {
  return {
    customId: props.customId,
    final,
    customComponents,
    customHtmlTags,
    htmlPolicy: props.htmlPolicy ?? 'safe',
    isDark: props.isDark,
    indexKey: indexPrefix,
    typewriter: props.typewriter,
    fade: props.fade,
    showTooltips: props.showTooltips,
    streamingComponents,
    htmlComponents,
    renderCodeBlocksAsPre: props.renderCodeBlocksAsPre,
    codeBlockStream: props.codeBlockStream,
    codeBlockProps: {
      ...(typeof props.showTooltips === 'boolean' ? { showTooltips: props.showTooltips } : {}),
      ...(props.codeBlockProps || {}),
    },
    mermaidProps: {
      ...(props.mermaidProps || {}),
    },
    d2Props: {
      ...(props.d2Props || {}),
    },
    infographicProps: {
      ...(props.infographicProps || {}),
    },
    codeBlockThemes: {
      themes: props.themes,
      langs: props.langs,
      darkTheme: props.codeBlockDarkTheme,
      lightTheme: props.codeBlockLightTheme,
      minWidth: props.codeBlockMinWidth,
      maxWidth: props.codeBlockMaxWidth,
    },
    events: {
      onCopy: props.onCopy,
      onHandleArtifactClick: props.onHandleArtifactClick,
    },
  }
}

function getMermaidRenderProps(node: any, ctx: RenderContext) {
  const next = { ...(ctx.mermaidProps || {}) } as Record<string, any>
  if (parsePositiveMermaidNumber(next.estimatedPreviewHeightPx) == null) {
    next.estimatedPreviewHeightPx = clampMermaidPreviewHeight(
      estimateMermaidPreviewHeight(String(node?.code ?? '')),
      undefined,
      next.maxHeight === 'none' ? null : (parsePositiveMermaidNumber(next.maxHeight) ?? undefined),
    )
  }
  return next
}

function getInfographicRenderProps(node: any, ctx: RenderContext) {
  const next = { ...(ctx.infographicProps || {}) } as Record<string, any>
  if (parsePositiveInfographicNumber(next.estimatedPreviewHeightPx) == null) {
    next.estimatedPreviewHeightPx = clampInfographicPreviewHeight(
      estimateInfographicPreviewHeight(String(node?.code ?? '')),
      undefined,
      next.maxHeight === 'none' ? null : (parsePositiveInfographicNumber(next.maxHeight) ?? undefined),
    )
  }
  return next
}

function getCustomCodeLanguageComponent(
  customComponents: Record<string, any>,
  rawLanguage: string,
) {
  const raw = rawLanguage.trim().toLowerCase()
  if (!raw)
    return null

  for (const key of [raw, normalizeLanguageIdentifier(raw), normalizeShikiLanguage(raw)]) {
    const component = key && customComponents[key]
    if (component)
      return component
  }

  return null
}

function renderCodeBlock(
  node: any,
  key: string | number | bigint,
  ctx: RenderContext,
  customComponents: Record<string, any>,
) {
  const trimmedLanguage = String(node?.language || '').trim()
  const rawLanguage = trimmedLanguage
    ? String(trimmedLanguage.split(/\s+/)[0] ?? '').split(':')[0].toLowerCase()
    : ''
  const language = normalizeLanguageIdentifier(rawLanguage)
  const customForLanguage = getCustomCodeLanguageComponent(customComponents, rawLanguage)
  if (language === 'mermaid') {
    const mermaidProps = getMermaidRenderProps(node, ctx)
    const customMermaid = customForLanguage || customComponents.mermaid
    if (customMermaid)
      return renderSpecialCodeBlockComponent(customMermaid, node, key, ctx, mermaidProps)
    return (
      <MermaidBlockNode
        key={key}
        node={node as any}
        isDark={ctx.isDark}
        loading={Boolean(node.loading)}
        {...mermaidProps}
      />
    )
  }

  if (language === 'infographic') {
    const infographicProps = getInfographicRenderProps(node, ctx)
    const customInfographic = customForLanguage || customComponents.infographic
    if (customInfographic)
      return renderSpecialCodeBlockComponent(customInfographic, node, key, ctx, infographicProps)
    return (
      <InfographicBlockNode
        key={key}
        node={node as any}
        isDark={ctx.isDark}
        loading={Boolean(node.loading)}
        {...infographicProps}
      />
    )
  }

  if (language === 'd2' || language === 'd2lang') {
    const customD2 = customForLanguage || customComponents.d2
    if (customD2)
      return renderSpecialCodeBlockComponent(customD2, node, key, ctx, ctx.d2Props || {})
    return (
      <D2BlockNode
        key={key}
        node={node as any}
        isDark={ctx.isDark}
        loading={Boolean(node.loading)}
        {...(ctx.d2Props || {})}
      />
    )
  }

  if (customForLanguage)
    return renderCustomCodeBlockComponent(customForLanguage, node, key, ctx)

  const customCodeBlock = customComponents.code_block
  if (customCodeBlock)
    return renderCustomCodeBlockComponent(customCodeBlock, node, key, ctx)

  if (ctx.renderCodeBlocksAsPre) {
    const extraProps = getCodeBlockExtraProps(ctx.codeBlockProps, { omit: ['langs'] })
    return <PreCodeNode key={key} node={node} showLineNumbers={extraProps.showLineNumbers === true} />
  }

  return (
    <CodeBlockNode
      key={key}
      node={node}
      loading={Boolean(node.loading)}
      stream={ctx.codeBlockStream}
      themes={ctx.codeBlockThemes?.themes}
      darkTheme={ctx.codeBlockThemes?.darkTheme}
      lightTheme={ctx.codeBlockThemes?.lightTheme}
      minWidth={ctx.codeBlockThemes?.minWidth}
      maxWidth={ctx.codeBlockThemes?.maxWidth}
      isDark={ctx.isDark}
      {...getCodeBlockExtraProps(ctx.codeBlockProps, { omit: ['langs'] })}
    />
  )
}

export function TextNode(props: NodeComponentProps<{ type: 'text', content: string, center?: boolean }>) {
  const { node, children } = props
  return (
    <span className={`text-node whitespace-pre-wrap break-words${node.center ? ' text-node-center' : ''}`}>
      {children ?? node.content}
    </span>
  )
}

function isWhitespaceTextNode(node: ParsedNode | null | undefined) {
  return node?.type === 'text' && String((node as any)?.content ?? '').trim() === ''
}

function getMeaningfulLinkChildren(node: ParsedNode | null | undefined) {
  if (node?.type !== 'link' || !Array.isArray((node as any)?.children))
    return []

  return ((node as any).children as ParsedNode[]).filter(child => !isWhitespaceTextNode(child))
}

function isImageOnlyLinkNode(node: ParsedNode | null | undefined) {
  const linkChildren = getMeaningfulLinkChildren(node)
  return linkChildren.length === 1 && linkChildren[0]?.type === 'image'
}

function renderParagraphInlineNodes(
  nodes: ParsedNode[],
  renderNode: NonNullable<NodeComponentProps<{ type: 'paragraph', children?: ParsedNode[] }>['renderNode']>,
  ctx: NonNullable<NodeComponentProps<{ type: 'paragraph', children?: ParsedNode[] }>['ctx']>,
  prefix: string,
) {
  const meaningfulChildren = nodes.filter(child => !isWhitespaceTextNode(child))
  const mediaOnly = meaningfulChildren.length > 0
    && meaningfulChildren.every(child => child.type === 'image' || isImageOnlyLinkNode(child))

  if (!mediaOnly || meaningfulChildren.length <= 1)
    return renderNodeChildren(nodes, ctx, prefix, renderNode)

  const normalizedNodes: ParsedNode[] = []
  for (let index = 0; index < nodes.length; index++) {
    const child = nodes[index]
    if (!isWhitespaceTextNode(child)) {
      normalizedNodes.push(child)
      continue
    }

    const hasPrevious = normalizedNodes.length > 0
    const hasNext = nodes.slice(index + 1).some(nextChild => !isWhitespaceTextNode(nextChild))
    if (!hasPrevious || !hasNext)
      continue

    normalizedNodes.push({
      ...(child as any),
      content: ' ',
      raw: ' ',
    })
  }

  return normalizedNodes.map((child, index) => (
    mediaOnly && isWhitespaceTextNode(child)
      ? String((child as any)?.content ?? '')
      : renderNode(child, `${prefix}-${index}`, ctx)
  ))
}

export function ParagraphNode(props: NodeComponentProps<{ type: 'paragraph', children?: ParsedNode[] }>) {
  const { node, ctx, renderNode: renderNodeProp, indexKey, children } = props
  if (!ctx || !renderNodeProp) {
    return Octane.createElement('p', {
      dir: 'auto',
      className: 'paragraph-node',
    }, children)
  }

  const nodeChildren = node.children ?? []
  const customComponents = ctx.customComponents ?? getCustomNodeComponents(ctx.customId)
  const displayComponents = {
    ...customComponents,
    ...(ctx.htmlComponents ?? {}),
    ...(ctx.streamingComponents ?? {}),
  }
  const parts: Octane.OctaneNode[] = []
  const inlineBuffer: ParsedNode[] = []

  const flushInline = () => {
    if (!inlineBuffer.length)
      return
    const chunkIndex = parts.length
    parts.push(
      Octane.createElement('p', {
        key: `${String(indexKey ?? 'paragraph')}-inline-${chunkIndex}`,
        dir: 'auto',
        className: 'paragraph-node',
      }, renderParagraphInlineNodes(
        inlineBuffer.slice(),
        renderNodeProp,
        ctx,
        `${String(indexKey ?? 'paragraph')}-${chunkIndex}`,
      )),
    )
    inlineBuffer.length = 0
  }

  nodeChildren.forEach((child, childIndex) => {
    const canUseHtmlDisplayMetadata = (ctx.htmlPolicy ?? 'safe') !== 'escape'
      || (child.type !== 'html_inline' && child.type !== 'html_block')
    if (BLOCK_LEVEL_TYPES.has(child.type) || (canUseHtmlDisplayMetadata && isParagraphBreakingCustomHtmlNode(child, displayComponents, ctx.customHtmlTags))) {
      flushInline()
      parts.push(renderNodeProp(child, `${String(indexKey ?? 'paragraph')}-block-${childIndex}`, ctx))
    }
    else {
      inlineBuffer.push(child)
    }
  })
  flushInline()

  if (!parts.length) {
    return Octane.createElement('p', {
      dir: 'auto',
      className: 'paragraph-node',
    }, renderParagraphInlineNodes(nodeChildren, renderNodeProp, ctx, String(indexKey ?? 'paragraph')))
  }

  return Octane.createElement(Octane.Fragment, {}, parts)
}

export function HeadingNode(props: NodeComponentProps<{ type: 'heading', level?: number, children?: ParsedNode[], attrs?: Record<string, string | boolean> }>) {
  const { node, ctx, renderNode: renderNodeProp, indexKey, children } = props
  const level = Math.min(6, Math.max(1, Number(node.level) || 1))
  type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  const Tag = `h${level}` as HeadingTag
  const attrs = (node as any)?.attrs as Record<string, unknown> | undefined
  const { class: classAttr, className: classNameAttr, style: styleAttr, ...restAttrs } = attrs ?? {}
  const classes = ['heading-node', 'font-semibold', `heading-${level}`, classAttr, classNameAttr]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag
      dir="auto"
      className={classes}
      {...(typeof styleAttr === 'object' && styleAttr != null ? { style: styleAttr as any } : {})}
      {...(restAttrs as OctaneHeadingAttributes)}
    >
      {children ?? (ctx && renderNodeProp
        ? renderNodeChildren(node.children, ctx, String(indexKey ?? `heading-${level}`), renderNodeProp)
        : null)}
    </Tag>
  )
}

export function BlockquoteNode(props: NodeComponentProps<{ type: 'blockquote', children?: ParsedNode[] }>) {
  const { node, ctx, renderNode: renderNodeProp, indexKey, children } = props
  return (
    <blockquote className="blockquote-node" dir="auto" cite={(node as any).cite}>
      {children ?? (ctx && renderNodeProp
        ? renderNodeChildren(node.children, ctx, String(indexKey ?? 'blockquote'), renderNodeProp)
        : null)}
    </blockquote>
  )
}

export function ListItemNode(props: NodeComponentProps<{ type: 'list_item', children?: ParsedNode[] }> & { value?: number }) {
  const { node, ctx, renderNode: renderNodeProp, value, indexKey, children } = props
  return (
    <li className="list-item pl-1.5 my-2" dir="auto" value={value == null ? undefined : value}>
      {children ?? (ctx && renderNodeProp
        ? renderNodeChildren(node.children, ctx, String(indexKey ?? 'list-item'), renderNodeProp)
        : null)}
    </li>
  )
}

export function ListNode(props: NodeComponentProps<{ type: 'list', ordered?: boolean, start?: number, items?: ListItemNodeType[] }>) {
  const { node, ctx, renderNode: renderNodeProp, indexKey } = props
  const Tag = node.ordered ? 'ol' : 'ul'
  const startAttr = node.ordered && node.start ? node.start : undefined
  const ListItemComponent = ((ctx && getCustomNodeComponents(ctx.customId).list_item) || ListItemNode) as Octane.ComponentBody<NodeComponentProps<ListItemNodeType> & { value?: number }>
  return (
    <Tag
      className={node.ordered
        ? 'list-node my-5 pl-[calc(13/8*1em)] list-decimal'
        : 'list-node my-5 pl-[calc(13/8*1em)] list-disc max-lg:my-[calc(4/3*1em)] max-lg:pl-[calc(14/9*1em)]'}
      start={startAttr}
    >
      {node.items?.map((item, idx: number) => (
        <ListItemComponent
          key={`${String(indexKey ?? 'list')}-${idx}`}
          node={item}
          value={node.ordered ? (node.start ?? 1) + idx : undefined}
          ctx={ctx}
          renderNode={renderNodeProp}
          indexKey={`${String(indexKey ?? 'list')}-${idx}`}
          customId={ctx?.customId}
          isDark={ctx?.isDark}
          typewriter={ctx?.typewriter}
        />
      ))}
    </Tag>
  )
}

export function TableNode(props: NodeComponentProps<{ type: 'table', header?: TableRowNodeType, rows?: TableRowNodeType[], loading?: boolean }>) {
  const { node, ctx, renderNode: renderNodeProp, indexKey } = props
  const headerCells = Array.isArray(node?.header?.cells) ? node.header.cells : []
  const isLoading = Boolean(node?.loading)
  const bodyRows = Array.isArray(node?.rows) ? node.rows : []

  const getAlignClass = (align?: string) => {
    if (align === 'right')
      return 'text-right'
    if (align === 'center')
      return 'text-center'
    return 'text-left'
  }

  return (
    <div className="table-node-wrapper" data-index-key={indexKey}>
      <table className={`my-8 text-sm table-node${isLoading ? ' table-node--loading' : ''}`} aria-busy={isLoading}>
        <thead className="border-[var(--table-border,#cbd5e1)]">
          <tr className="border-b">
            {headerCells.map((cell: TableCellNodeType, idx: number) => (
              <th key={`header-${idx}`} className={`font-semibold p-[calc(4/7*1em)] ${getAlignClass(cell.align)}`} dir="auto">
                {ctx && renderNodeProp ? renderInline(cell.children, ctx, `${String(indexKey ?? 'table')}-th-${idx}`, renderNodeProp) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row: TableRowNodeType, rowIdx: number) => (
            <tr key={`row-${rowIdx}`} className={rowIdx < bodyRows.length - 1 ? 'border-[var(--table-border,#cbd5e1)] border-b' : 'border-[var(--table-border,#cbd5e1)]'}>
              {row.cells?.map((cell: TableCellNodeType, cellIdx: number) => (
                <td key={`cell-${rowIdx}-${cellIdx}`} className={`p-[calc(4/7*1em)] ${getAlignClass(cell.align)}`} dir="auto">
                  {ctx && renderNodeProp ? renderInline(cell.children, ctx, `${String(indexKey ?? 'table')}-row-${rowIdx}-${cellIdx}`, renderNodeProp) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {isLoading && (
        <div className="table-node__loading" role="status" aria-live="polite">
          <span className="table-node__spinner" aria-hidden="true" />
          <span className="sr-only">Loading</span>
        </div>
      )}
    </div>
  )
}

export function DefinitionListNode(props: NodeComponentProps<{ type: 'definition_list', items?: DefinitionItemNodeType[] }>) {
  const { node, ctx, renderNode: renderNodeProp, indexKey } = props
  const items = Array.isArray(node.items) ? node.items : []
  return (
    <dl className="definition-list" data-index-key={indexKey}>
      {items.map((item, idx: number) => (
        <div key={`${String(indexKey ?? 'definition')}-${idx}`} className="mb-4">
          <dt className="definition-term font-semibold">
            {ctx && renderNodeProp ? renderInline(item.term, ctx, `${String(indexKey ?? 'definition')}-term-${idx}`, renderNodeProp) : null}
          </dt>
          <dd className="definition-desc ml-4">
            {ctx && renderNodeProp ? renderInline(item.definition, ctx, `${String(indexKey ?? 'definition')}-desc-${idx}`, renderNodeProp) : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function FootnoteNode(props: NodeComponentProps<{ type: 'footnote', id: string, children?: ParsedNode[] }>) {
  const { node, ctx, renderNode: renderNodeProp, indexKey } = props
  return (
    <div id={`fnref--${node.id}`} className="footnote-node flex text-sm leading-relaxed border-t border-[var(--footnote-border,#eaecef)] pt-2">
      <div className="flex-1">
        {ctx && renderNodeProp ? renderNodeChildren(node.children, ctx, String(indexKey ?? `footnote-${node.id}`), renderNodeProp) : null}
      </div>
    </div>
  )
}

export function FootnoteReferenceNode(props: NodeComponentProps<{ type: 'footnote_reference', id: string }>) {
  const { node } = props
  const href = `#fnref--${node.id}`
  return (
    <sup id={`fnref-${node.id}`} className="footnote-reference">
      <span {...({ href } as OctaneSpanAttributes & { href: string })} title={`查看脚注 ${node.id}`} className="footnote-link cursor-pointer">
        [
        {node.id}
        ]
      </span>
    </sup>
  )
}

export function FootnoteAnchorNode(props: NodeComponentProps<{ type: 'footnote_anchor', id: string }>) {
  const { node } = props
  return (
    <a
      className="footnote-anchor text-sm hover:underline cursor-pointer"
      href={`#fnref-${node.id}`}
      title={`返回引用 ${node.id}`}
    >
      ↩︎
    </a>
  )
}

export function AdmonitionNode(props: NodeComponentProps<{
  type: 'admonition'
  kind?: string
  title?: string
  children?: ParsedNode[]
  collapsible?: boolean
  open?: boolean
}>) {
  const { node, ctx, renderNode: renderNodeProp, indexKey, isDark } = props
  const kind = String(node.kind || 'note')
  const displayTitle = node.title && String(node.title).trim().length
    ? String(node.title)
    : kind.charAt(0).toUpperCase() + kind.slice(1)
  const headerId = `admonition-${String(indexKey ?? kind)}`
  const isOpen = node.collapsible ? (node.open ?? true) : true
  const iconMap: Record<string, string> = {
    note: 'ℹ️',
    info: 'ℹ️',
    tip: '💡',
    warning: '⚠️',
    danger: '❗',
    error: '⛔',
    caution: '⚠️',
  }

  return (
    <div className={`admonition admonition-${kind}${isDark ? ' is-dark' : ''}`} data-index-key={indexKey}>
      <div id={headerId} className="admonition-header">
        {iconMap[kind] && <span className="admonition-icon">{iconMap[kind]}</span>}
        <span className="admonition-title">{displayTitle}</span>
        {node.collapsible && (
          <span
            className="admonition-toggle"
            aria-expanded={isOpen}
            aria-controls={`${headerId}-content`}
          >
            <span>{isOpen ? '▼' : '▶'}</span>
          </span>
        )}
      </div>
      {isOpen && (
        <div id={`${headerId}-content`} className="admonition-content" aria-labelledby={headerId}>
          {ctx && renderNodeProp ? renderNodeChildren(node.children, ctx, String(indexKey ?? headerId), renderNodeProp) : null}
        </div>
      )}
    </div>
  )
}

export function CheckboxNode(props: NodeComponentProps<{ type: 'checkbox' | 'checkbox_input', checked?: boolean }>) {
  const { node } = props
  return (
    <span className="checkbox-node">
      <input
        type="checkbox"
        checked={Boolean(node.checked)}
        disabled
        className="checkbox-input"
        readOnly
      />
    </span>
  )
}

export function EmojiNode(props: NodeComponentProps<{ type: 'emoji', name: string, markup?: string }>) {
  const { node } = props
  return <span className="emoji-node">{node.name ?? node.markup}</span>
}

export function StrongNode(props: NodeComponentProps<{ type: 'strong', children?: ParsedNode[] }>) {
  const { node, children, ctx, renderNode: renderNodeProp, indexKey } = props
  return (
    <strong className="strong-node">
      {children ?? (ctx && renderNodeProp ? renderNodeChildren(node.children, ctx, `${String(indexKey ?? 'strong')}-strong`, renderNodeProp) : null)}
    </strong>
  )
}

export function EmphasisNode(props: NodeComponentProps<{ type: 'emphasis', children?: ParsedNode[] }>) {
  const { node, children, ctx, renderNode: renderNodeProp, indexKey } = props
  return (
    <em className="emphasis-node">
      {children ?? (ctx && renderNodeProp ? renderNodeChildren(node.children, ctx, `${String(indexKey ?? 'emphasis')}-emphasis`, renderNodeProp) : null)}
    </em>
  )
}

export function StrikethroughNode(props: NodeComponentProps<{ type: 'strikethrough', children?: ParsedNode[] }>) {
  const { node, children, ctx, renderNode: renderNodeProp, indexKey } = props
  return (
    <del className="strikethrough-node">
      {children ?? (ctx && renderNodeProp ? renderNodeChildren(node.children, ctx, `${String(indexKey ?? 'strikethrough')}-strikethrough`, renderNodeProp) : null)}
    </del>
  )
}

export function HighlightNode(props: NodeComponentProps<{ type: 'highlight', children?: ParsedNode[] }>) {
  const { node, children, ctx, renderNode: renderNodeProp, indexKey } = props
  return (
    <mark className="highlight-node">
      {children ?? (ctx && renderNodeProp ? renderNodeChildren(node.children, ctx, `${String(indexKey ?? 'highlight')}-highlight`, renderNodeProp) : null)}
    </mark>
  )
}

export function InsertNode(props: NodeComponentProps<{ type: 'insert', children?: ParsedNode[] }>) {
  const { node, children, ctx, renderNode: renderNodeProp, indexKey } = props
  return (
    <ins className="insert-node">
      {children ?? (ctx && renderNodeProp ? renderNodeChildren(node.children, ctx, `${String(indexKey ?? 'insert')}-insert`, renderNodeProp) : null)}
    </ins>
  )
}

export function SubscriptNode(props: NodeComponentProps<{ type: 'subscript', children?: ParsedNode[] }>) {
  const { node, children, ctx, renderNode: renderNodeProp, indexKey } = props
  return (
    <sub className="subscript-node">
      {children ?? (ctx && renderNodeProp ? renderNodeChildren(node.children, ctx, `${String(indexKey ?? 'subscript')}-subscript`, renderNodeProp) : null)}
    </sub>
  )
}

export function SuperscriptNode(props: NodeComponentProps<{ type: 'superscript', children?: ParsedNode[] }>) {
  const { node, children, ctx, renderNode: renderNodeProp, indexKey } = props
  return (
    <sup className="superscript-node">
      {children ?? (ctx && renderNodeProp ? renderNodeChildren(node.children, ctx, `${String(indexKey ?? 'superscript')}-superscript`, renderNodeProp) : null)}
    </sup>
  )
}

export function HardBreakNode(_props: NodeComponentProps<{ type: 'hardbreak' }>) {
  return <br />
}

export function ThematicBreakNode(_props?: NodeComponentProps<{ type: 'thematic_break' }>) {
  return <hr className="thematic-break-node" />
}

export function InlineCodeNode(props: NodeComponentProps<{ type: 'inline_code', code: string }>) {
  const { node, children } = props
  return (
    <code className="inline-code inline text-[85%] px-1 py-0.5 rounded font-mono bg-[hsl(var(--secondary))] whitespace-normal break-words max-w-full">
      {children ?? node.code}
    </code>
  )
}

export function LinkNode(props: NodeComponentProps<LinkNodeProps['node']> & {
  showTooltip?: boolean
  color?: string
  underlineHeight?: number
  underlineBottom?: number | string
  animationDuration?: number
  animationOpacity?: number
  animationTiming?: string
  animationIteration?: string | number
}) {
  const { node, ctx, renderNode: renderNodeProp, indexKey } = props
  const bottom = props.underlineBottom !== undefined
    ? (typeof props.underlineBottom === 'number' ? `${props.underlineBottom}px` : String(props.underlineBottom))
    : '-3px'
  const activeOpacity = props.animationOpacity ?? 0.35
  const restingOpacity = Math.max(0.12, Math.min(activeOpacity * 0.5, activeOpacity))
  const cssVars = {
    ['--link-color' as any]: props.color ?? '#0366d6',
    ['--underline-height' as any]: `${props.underlineHeight ?? 2}px`,
    ['--underline-bottom' as any]: bottom,
    ['--underline-opacity' as any]: String(activeOpacity),
    ['--underline-rest-opacity' as any]: String(restingOpacity),
    ['--underline-duration' as any]: `${props.animationDuration ?? 1.6}s`,
    ['--underline-timing' as any]: props.animationTiming ?? 'ease-in-out',
    ['--underline-iteration' as any]: typeof props.animationIteration === 'number'
      ? String(props.animationIteration)
      : (props.animationIteration ?? 'infinite'),
  } as OctaneStyle
  const safeHref = sanitizeHtmlAttrs({ href: String(node.href ?? '') }).href
  const title = typeof node.title === 'string' && node.title.trim().length > 0
    ? node.title
    : String(safeHref ?? '')
  const openInNewTab = shouldOpenLinkInNewTab(safeHref)

  if (node.loading) {
    return (
      <span className="link-loading inline-flex items-baseline gap-1.5" aria-hidden="false" style={cssVars}>
        <span className="link-text-wrapper relative inline-flex">
          <span className="leading-[normal] link-text">
            <TextNode
              node={{ type: 'text', content: String(node.text ?? '') }}
              ctx={ctx}
              indexKey={`${String(indexKey ?? 'link')}-loading`}
              typewriter={props.typewriter}
            />
          </span>
          <span className="link-loading-indicator" aria-hidden="true" />
        </span>
      </span>
    )
  }

  return (
    <a
      className="link-node"
      href={safeHref || undefined}
      title={title}
      aria-label={`Link: ${title}`}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      style={cssVars}
    >
      {ctx && renderNodeProp
        ? renderNodeChildren(node.children, ctx, String(indexKey ?? 'link'), renderNodeProp)
        : (
            <TextNode
              node={{ type: 'text', content: String(node.text ?? '') }}
              ctx={ctx}
              indexKey={`${String(indexKey ?? 'link')}-fallback`}
              typewriter={props.typewriter}
            />
          )}
    </a>
  )
}

export function ImageNode(rawProps: ImageNodeProps) {
  const props = rawProps
  const src = sanitizeImageSrc(props.node.src) || sanitizeImageSrc(props.fallbackSrc)
  if (!src)
    return null

  return (
    <img
      src={src}
      alt={String(props.node.alt ?? props.node.title ?? '')}
      title={String(props.node.title ?? props.node.alt ?? '')}
      className="image-node__img is-loaded"
      loading={props.lazy === false ? 'eager' : 'lazy'}
      decoding="async"
      tabIndex={0}
      aria-label={props.node.alt ?? 'Preview image'}
    />
  )
}

export function PreCodeNode({ node }: PreCodeNodeProps) {
  const normalizedLanguage = normalizePreLanguage((node as any)?.language)
  const languageClass = `language-${normalizedLanguage}`
  const ariaLabel = normalizedLanguage ? `Code block: ${normalizedLanguage}` : 'Code block'

  return (
    <pre
      className={languageClass}
      aria-busy={(node as any)?.loading === true}
      aria-label={ariaLabel}
      data-language={normalizedLanguage}
      tabIndex={0}
    >
      <code translate="no">{String((node as any)?.code ?? '')}</code>
    </pre>
  )
}

export function CodeBlockNode(props: CodeBlockNodeProps) {
  return renderStaticCodeShell('code-block-node', props.node, {
    showHeader: props.showHeader,
    fallback: 'code-block',
  })
}

export function MermaidBlockNode(props: MermaidBlockNodeProps) {
  return renderStaticCodeShell('mermaid-block-node', props.node, {
    showHeader: props.showHeader,
    fallback: 'mermaid',
  })
}

export function D2BlockNode(props: D2BlockNodeProps) {
  return renderStaticCodeShell('d2-block-node', props.node, {
    showHeader: props.showHeader,
    fallback: 'd2',
  })
}

export function InfographicBlockNode(props: InfographicBlockNodeProps) {
  return renderStaticCodeShell('infographic-block-node', props.node, {
    showHeader: props.showHeader,
    fallback: 'infographic',
  })
}

export function MathBlockNode({ node }: MathBlockNodeProps) {
  const html = renderKatexToHtml(String(node.content ?? ''), true, Boolean(node.loading))
  if (!html) {
    return (
      <div className="math-block text-center overflow-x-auto relative min-h-[40px]">
        <div>{String(node.raw ?? node.content ?? '')}</div>
      </div>
    )
  }

  return (
    <div className="math-block text-center overflow-x-auto relative min-h-[40px]">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

export function MathInlineNode({ node }: MathInlineNodeProps) {
  const displayMode = node.markup === '$$'
  const html = renderKatexToHtml(String(node.content ?? ''), displayMode, Boolean(node.loading))
  if (!html) {
    return (
      <span className="math-inline-wrapper">
        <span className="math-inline">{String(node.raw ?? node.content ?? '')}</span>
      </span>
    )
  }

  return (
    <span className="math-inline-wrapper">
      <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  )
}

export function ReferenceNode(props: NodeComponentProps<{ type: 'reference', id: string }> & { messageId?: string, threadId?: string }) {
  const { node } = props
  return (
    <span
      className="reference-node cursor-pointer bg-[hsl(var(--muted))] text-xs rounded-md px-1.5 mx-0.5 hover:bg-[hsl(var(--secondary))]"
      role="button"
      tabIndex={0}
      data-reference-id={node.id}
    >
      {node.id}
    </span>
  )
}

export function HtmlBlockNode(props: NodeComponentProps<{
  type: 'html_block'
  content?: string
  tag?: string
  attrs?: [string, string | null][] | null
  children?: ParsedNode[]
}>) {
  const structuredTag = String((props.node as any)?.tag ?? '').trim().toLowerCase()
  const normalizedStructuredTag = normalizeCustomHtmlTagName(structuredTag)
  const structuredChildren = Array.isArray((props.node as any)?.children)
    ? ((props.node as any).children as ParsedNode[])
    : []
  const StructuredHtmlComponent = normalizedStructuredTag
    ? props.ctx?.htmlComponents?.[normalizedStructuredTag]
    : undefined
  if (
    structuredChildren.length > 0
    && structuredTag
    && !NON_STRUCTURING_HTML_TAGS.has(structuredTag)
    && !isHtmlTagBlocked(structuredTag, props.ctx?.htmlPolicy ?? 'safe')
    && props.ctx
    && props.renderNode
  ) {
    const structuredContent = renderNodeChildren(
      structuredChildren,
      props.ctx,
      `${String(props.indexKey ?? 'html-block')}-structured`,
      props.renderNode,
    )
    if (StructuredHtmlComponent) {
      const attrs = sanitizeHtmlTokenAttrs((props.node as any)?.attrs ?? null, props.ctx?.htmlPolicy ?? 'safe', normalizedStructuredTag)
      return Octane.createElement(
        StructuredHtmlComponent as any,
        convertHtmlAttrsToProps(tokenAttrsToRecord(attrs)),
        structuredContent,
      )
    }

    return Octane.createElement(
      structuredTag,
      mergeHtmlBlockWrapperProps((props.node as any)?.attrs ?? null, props.ctx?.htmlPolicy ?? 'safe', structuredTag),
      structuredContent,
    )
  }

  const customComponents = {
    ...(props.ctx?.customComponents ?? getCustomNodeComponents(props.customId)),
    ...(props.ctx?.htmlComponents ?? {}),
  }
  const nodes = parseHtmlToOctaneNodes(String(props.node.content ?? ''), customComponents, props.ctx?.htmlPolicy ?? 'safe', {
    ctx: props.ctx,
    keyPrefix: String(props.indexKey ?? 'html-block'),
    nodeComponents: props.ctx?.streamingComponents,
    propComponents: props.ctx?.htmlComponents,
    renderNode: props.renderNode,
    sourceNode: props.node as ParsedNode,
  })
  if (nodes == null)
    return <>{String(props.node.content ?? '')}</>
  return <>{nodes}</>
}

export function HtmlInlineNode(props: NodeComponentProps<{
  type: 'html_inline'
  content?: string
  tag?: string
  attrs?: [string, string | null][] | null
  children?: ParsedNode[]
}>) {
  const htmlPolicy = props.ctx?.htmlPolicy ?? 'safe'
  const structuredTag = String((props.node as any)?.tag ?? '').trim().toLowerCase()
  const normalizedStructuredTag = normalizeCustomHtmlTagName(structuredTag)
  const structuredChildren = Array.isArray((props.node as any)?.children)
    ? ((props.node as any).children as ParsedNode[])
    : []
  const StructuredHtmlComponent = normalizedStructuredTag
    ? props.ctx?.htmlComponents?.[normalizedStructuredTag]
    : undefined
  if (
    structuredChildren.length > 0
    && structuredTag
    && htmlPolicy !== 'escape'
    && !isHtmlTagBlocked(structuredTag, htmlPolicy)
    && props.ctx
    && props.renderNode
    && StructuredHtmlComponent
  ) {
    const structuredContent = renderNodeChildren(
      structuredChildren,
      props.ctx,
      `${String(props.indexKey ?? 'html-inline')}-structured`,
      props.renderNode,
    )
    const attrs = sanitizeHtmlTokenAttrs((props.node as any)?.attrs ?? null, htmlPolicy, normalizedStructuredTag)
    return Octane.createElement(
      StructuredHtmlComponent as any,
      convertHtmlAttrsToProps(tokenAttrsToRecord(attrs)),
      structuredContent,
    )
  }

  const customComponents = {
    ...(props.ctx?.customComponents ?? getCustomNodeComponents(props.customId)),
    ...(props.ctx?.htmlComponents ?? {}),
  }
  const nodes = parseHtmlToOctaneNodes(String(props.node.content ?? ''), customComponents, htmlPolicy, {
    ctx: props.ctx,
    keyPrefix: String(props.indexKey ?? 'html-inline'),
    nodeComponents: props.ctx?.streamingComponents,
    propComponents: props.ctx?.htmlComponents,
    renderNode: props.renderNode,
    sourceNode: props.node as ParsedNode,
  })
  if (nodes == null)
    return <>{String(props.node.content ?? '')}</>
  return <>{nodes}</>
}

export function VmrContainerNode(props: NodeComponentProps<{
  type: 'vmr_container'
  name: string
  attrs?: Record<string, string> | [string, string | null][] | null
  children?: ParsedNode[]
}>) {
  const { node, ctx, renderNode: renderNodeProp, indexKey } = props
  const boundAttrs = !node.attrs
    ? undefined
    : Array.isArray(node.attrs)
      ? tokenAttrsToProps(node.attrs as any)
      : node.attrs

  return (
    <div className={`vmr-container vmr-container-${node.name}`} {...(boundAttrs as any)}>
      {(ctx && renderNodeProp && Array.isArray(node.children))
        ? node.children.map((child, idx) => (
            <Octane.Fragment key={`${String(indexKey ?? 'vmr-container')}-${idx}`}>
              {renderNodeProp(child, `${String(indexKey ?? 'vmr-container')}-${idx}`, ctx)}
            </Octane.Fragment>
          ))
        : null}
    </div>
  )
}

export function Tooltip(_props: TooltipProps) {
  return null
}

export function HtmlPreviewFrame(_props: HtmlPreviewFrameProps) {
  return null
}

export function FallbackComponent(props: NodeComponentProps<{ type: string }>) {
  const { node } = props
  return (
    <div className="unknown-node text-sm text-gray-500 italic">
      Unsupported node type:
      {' '}
      {String((node as any)?.type)}
    </div>
  )
}

export function renderNode(node: ParsedNode, key: string | number | bigint, ctx: RenderContext): Octane.OctaneNode {
  const customComponents = ctx.customComponents ?? getCustomNodeComponents(ctx.customId)
  const streamingComponents = ctx.streamingComponents ?? {}
  const htmlComponents = ctx.htmlComponents ?? {}
  const parserCustomTag = getParserCustomTagNodeTag(node)
  const streamingCustom = parserCustomTag
    ? (streamingComponents as Record<string, any>)[parserCustomTag]
    : null
  const htmlCustom = parserCustomTag && !streamingCustom
    ? (htmlComponents as Record<string, any>)[parserCustomTag]
    : null
  const custom = node.type === 'code_block'
    ? null
    : (customComponents as Record<string, any>)[node.type]
  if (streamingCustom) {
    return Octane.createElement(streamingCustom, {
      key,
      node,
      customId: ctx.customId,
      isDark: ctx.isDark,
      ctx,
      renderNode,
      indexKey: key,
      typewriter: ctx.typewriter,
      fade: ctx.fade,
    })
  }
  if (htmlCustom)
    return renderHtmlComponentForCustomTagNode(htmlCustom, node, key, ctx, parserCustomTag)
  if (custom) {
    return Octane.createElement(custom, {
      key,
      node,
      customId: ctx.customId,
      isDark: ctx.isDark,
      ctx,
      renderNode,
      indexKey: key,
      typewriter: ctx.typewriter,
      fade: ctx.fade,
    })
  }

  if (node.type === 'html_block' || node.type === 'html_inline') {
    const streamingAndLegacyComponents = {
      ...(customComponents as Record<string, any>),
      ...(streamingComponents as Record<string, any>),
    }
    const resolvedCustomTag = resolveCustomHtmlTag(node as any, streamingAndLegacyComponents as any, ctx.customHtmlTags)
    const tag = resolvedCustomTag?.tag ?? ''
    const isWhitelisted = resolvedCustomTag?.isWhitelisted ?? false
    const customForTag = resolvedCustomTag?.component ?? null
    if (isWhitelisted && customForTag) {
      const coerced = {
        ...(node as any),
        type: tag,
        tag,
        content: stripCustomHtmlWrapper((node as any).content, tag),
      }
      return Octane.createElement(customForTag as any, {
        key,
        node: coerced,
        customId: ctx.customId,
        isDark: ctx.isDark,
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    }
    const rawContent = String((node as any).content ?? (node as any).raw ?? '')
    if (!isWhitelisted && shouldRenderUnknownHtmlTagAsText(rawContent, tag)) {
      if (node.type === 'html_inline') {
        return <TextNode key={key} node={{ type: 'text', content: rawContent, raw: rawContent } as any} ctx={ctx} indexKey={key} typewriter={ctx.typewriter} />
      }
      return <ParagraphNode key={key} node={{ type: 'paragraph', children: [{ type: 'text', content: rawContent, raw: rawContent }], raw: rawContent } as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    }
  }

  switch (node.type) {
    case 'text':
      return <TextNode key={key} node={node as any} ctx={ctx} indexKey={key} typewriter={ctx.typewriter} />
    case 'text_special':
      return <TextNode key={key} node={{ type: 'text', content: (node as any).content ?? '', center: (node as any).center } as any} ctx={ctx} indexKey={key} typewriter={ctx.typewriter} />
    case 'paragraph':
      return <ParagraphNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'heading':
      return <HeadingNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'blockquote':
      return <BlockquoteNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'list':
      return <ListNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'list_item':
      return <ListItemNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'table':
      return <TableNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'definition_list':
      return <DefinitionListNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'footnote':
      return <FootnoteNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'footnote_reference':
      return <FootnoteReferenceNode key={key} node={node as any} />
    case 'footnote_anchor':
      return <FootnoteAnchorNode key={key} node={node as any} />
    case 'admonition':
      return <AdmonitionNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} isDark={ctx.isDark} typewriter={ctx.typewriter} />
    case 'hardbreak':
      return <HardBreakNode key={key} node={node as any} typewriter={ctx.typewriter} />
    case 'link':
      return (
        <LinkNode
          key={key}
          node={node as any}
          ctx={ctx}
          renderNode={renderNode}
          indexKey={key}
          isDark={ctx.isDark}
          showTooltip={typeof ctx.showTooltips === 'boolean' ? ctx.showTooltips : undefined}
          typewriter={ctx.typewriter}
        />
      )
    case 'image':
      return <ImageNode key={key} node={node as any} />
    case 'inline_code':
      return <InlineCodeNode key={key} node={node as any} ctx={ctx} indexKey={key} typewriter={ctx.typewriter} />
    case 'code_block':
      return renderCodeBlock(node, key, ctx, customComponents)
    case 'strong':
      return (
        <StrongNode key={key} node={node as any}>
          {renderNodeChildren((node as any).children, ctx, `${String(key)}-strong`, renderNode)}
        </StrongNode>
      )
    case 'emphasis':
      return (
        <EmphasisNode key={key} node={node as any}>
          {renderNodeChildren((node as any).children, ctx, `${String(key)}-em`, renderNode)}
        </EmphasisNode>
      )
    case 'strikethrough':
      return (
        <StrikethroughNode key={key} node={node as any}>
          {renderNodeChildren((node as any).children, ctx, `${String(key)}-strike`, renderNode)}
        </StrikethroughNode>
      )
    case 'highlight':
      return (
        <HighlightNode key={key} node={node as any}>
          {renderNodeChildren((node as any).children, ctx, `${String(key)}-highlight`, renderNode)}
        </HighlightNode>
      )
    case 'insert':
      return (
        <InsertNode key={key} node={node as any}>
          {renderNodeChildren((node as any).children, ctx, `${String(key)}-insert`, renderNode)}
        </InsertNode>
      )
    case 'subscript':
      return (
        <SubscriptNode key={key} node={node as any}>
          {renderNodeChildren((node as any).children, ctx, `${String(key)}-sub`, renderNode)}
        </SubscriptNode>
      )
    case 'superscript':
      return (
        <SuperscriptNode key={key} node={node as any}>
          {renderNodeChildren((node as any).children, ctx, `${String(key)}-sup`, renderNode)}
        </SuperscriptNode>
      )
    case 'checkbox':
    case 'checkbox_input':
      return <CheckboxNode key={key} node={node as any} typewriter={ctx.typewriter} />
    case 'emoji':
      return <EmojiNode key={key} node={node as any} typewriter={ctx.typewriter} />
    case 'thematic_break':
      return <ThematicBreakNode key={key} node={node as any} />
    case 'math_inline':
      return <MathInlineNode key={key} node={node as any} />
    case 'math_block':
      return <MathBlockNode key={key} node={node as any} />
    case 'reference':
      return <ReferenceNode key={key} node={node as any} ctx={ctx} typewriter={ctx.typewriter} />
    case 'html_block':
      return <HtmlBlockNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} customId={ctx.customId} />
    case 'html_inline':
      return <HtmlInlineNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} customId={ctx.customId} />
    case 'vmr_container':
      return <VmrContainerNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'label_open':
    case 'label_close':
      return null
    default:
      return <FallbackComponent key={key} node={node as any} />
  }
}

export function NodeRenderer<
  TStreamingComponents extends StreamingComponentMap = StreamingComponentMap,
  THtmlComponents extends Record<string, any> = HtmlComponentMap,
>(props: NodeRendererProps<TStreamingComponents, THtmlComponents>) {
  const customComponents = getCustomNodeComponents(props.customId)
  const streamingComponents = normalizeComponentMap(props.streamingComponents)
  const htmlComponents = normalizeComponentMap(props.htmlComponents)
  const warnedComponentMapConflicts = new Set<string>()

  warnComponentMapConflicts(
    streamingComponents,
    htmlComponents,
    warnedComponentMapConflicts,
  )

  const baseParseOptions = props.parseOptions ?? {}
  const optionTags = (baseParseOptions as any).customHtmlTags ?? []
  const effectiveCustomHtmlTags = mergeCustomHtmlTags(
    props.customHtmlTags,
    Array.isArray(optionTags) ? optionTags : [],
    Object.keys(streamingComponents),
  )

  const instanceMsgId = props.customId
    ? `server-renderer-${props.customId}`
    : 'server-renderer'

  const mdBase = effectiveCustomHtmlTags.length > 0
    ? getMarkdown(instanceMsgId, { customHtmlTags: effectiveCustomHtmlTags })
    : getMarkdown(instanceMsgId)
  const mdInstance = props.customMarkdownIt ? props.customMarkdownIt(mdBase as MarkdownIt) : mdBase
  const resolvedFinal = props.final ?? (baseParseOptions as any).final
  const mergedParseOptions = (resolvedFinal == null && effectiveCustomHtmlTags.length === 0)
    ? baseParseOptions
    : {
        ...(baseParseOptions as ParseOptions),
        ...(resolvedFinal != null ? { final: resolvedFinal } : {}),
        ...(effectiveCustomHtmlTags.length > 0 ? { customHtmlTags: effectiveCustomHtmlTags } : {}),
      }

  const parsedNodes: ParsedNode[] = Array.isArray(props.nodes) && props.nodes.length
    ? (props.nodes as ParsedNode[]).map(node => ({ ...node }))
    : props.content
      ? parseMarkdownToStructure(props.content, mdInstance ?? fallbackMarkdown, mergedParseOptions)
      : []

  const indexPrefix = props.indexKey != null ? String(props.indexKey) : 'markdown-renderer'
  const renderCtx = createRenderContext(
    props,
    customComponents,
    streamingComponents,
    htmlComponents,
    indexPrefix,
    effectiveCustomHtmlTags,
    resolvedFinal,
  )

  return (
    <div
      className={`markstream-octane markdown-renderer${props.isDark ? ' dark' : ''}`}
      data-custom-id={props.customId}
    >
      {parsedNodes.map((node, index) => (
        <div
          key={`${indexPrefix}-${index}`}
          className="node-slot"
          data-node-index={index}
          data-node-type={node.type}
        >
          <div className="node-content">
            {renderNode(node, `${indexPrefix}-${index}`, renderCtx)}
          </div>
        </div>
      ))}
    </div>
  )
}

export { CodeBlockNode as OctaneCodeBlockNode }

export default NodeRenderer
