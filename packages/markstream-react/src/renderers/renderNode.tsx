import type { ParsedNode } from 'stream-markdown-parser'
import type { RenderContext } from '../types'
import { normalizeShikiLanguage } from 'markstream-core'
import React from 'react'
import { convertHtmlAttrsToProps, getHtmlTagFromContent, normalizeCustomHtmlTagName, sanitizeHtmlTokenAttrs, shouldRenderUnknownHtmlTagAsText, stripCustomHtmlWrapper, tokenAttrsToRecord } from 'stream-markdown-parser'
import { AdmonitionNode } from '../components/AdmonitionNode/AdmonitionNode'
import { BlockquoteNode } from '../components/BlockquoteNode/BlockquoteNode'
import { CheckboxNode } from '../components/CheckboxNode/CheckboxNode'
import { CodeBlockNode as MonacoCodeBlockNode } from '../components/CodeBlockNode/CodeBlockNode'
import { PreCodeNode } from '../components/CodeBlockNode/PreCodeNode'
import { D2BlockNode } from '../components/D2BlockNode/D2BlockNode'
import { DefinitionListNode } from '../components/DefinitionListNode/DefinitionListNode'
import { EmojiNode } from '../components/EmojiNode/EmojiNode'
import { EmphasisNode } from '../components/EmphasisNode/EmphasisNode'
import { FootnoteAnchorNode } from '../components/FootnoteAnchorNode/FootnoteAnchorNode'
import { FootnoteNode } from '../components/FootnoteNode/FootnoteNode'
import { FootnoteReferenceNode } from '../components/FootnoteReferenceNode/FootnoteReferenceNode'
import { HardBreakNode } from '../components/HardBreakNode/HardBreakNode'
import { HeadingNode } from '../components/HeadingNode/HeadingNode'
import { HighlightNode } from '../components/HighlightNode/HighlightNode'
import { HtmlBlockNode } from '../components/HtmlBlockNode/HtmlBlockNode'
import { HtmlInlineNode } from '../components/HtmlInlineNode/HtmlInlineNode'
import { ImageNode } from '../components/ImageNode/ImageNode'
import { clampInfographicPreviewHeight, estimateInfographicPreviewHeight, parsePositiveNumber as parsePositiveInfographicNumber } from '../components/InfographicBlockNode/height'
import { InfographicBlockNode } from '../components/InfographicBlockNode/InfographicBlockNode'
import { InlineCodeNode } from '../components/InlineCodeNode/InlineCodeNode'
import { InsertNode } from '../components/InsertNode/InsertNode'
import { LinkNode } from '../components/LinkNode/LinkNode'
import { ListItemNode } from '../components/ListItemNode/ListItemNode'
import { ListNode } from '../components/ListNode/ListNode'
import { MathBlockNode } from '../components/MathBlockNode/MathBlockNode'
import { MathInlineNode } from '../components/MathInlineNode/MathInlineNode'
import { clampMermaidPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber as parsePositiveMermaidNumber } from '../components/MermaidBlockNode/height'
import { MermaidBlockNode } from '../components/MermaidBlockNode/MermaidBlockNode'
import { FallbackComponent } from '../components/NodeRenderer/FallbackComponent'
import { ParagraphNode } from '../components/ParagraphNode/ParagraphNode'
import { ReferenceNode } from '../components/ReferenceNode/ReferenceNode'
import { StrikethroughNode } from '../components/StrikethroughNode/StrikethroughNode'
import { StrongNode } from '../components/StrongNode/StrongNode'
import { SubscriptNode } from '../components/SubscriptNode/SubscriptNode'
import { SuperscriptNode } from '../components/SuperscriptNode/SuperscriptNode'
import { TableNode } from '../components/TableNode/TableNode'
import { TextNode } from '../components/TextNode/TextNode'
import { ThematicBreakNode } from '../components/ThematicBreakNode/ThematicBreakNode'
import { VmrContainerNode } from '../components/VmrContainerNode/VmrContainerNode'
import { getCustomNodeComponents } from '../customComponents'
import { resolveCustomHtmlTag } from '../utils/customHtmlTag'
import { normalizeLanguageIdentifier } from '../utils/languageIcon'
import { getCodeBlockExtraProps } from './codeBlockExtraProps'
import { renderNodeChildren } from './renderChildren'

function getRawCodeBlockLanguage(node: any) {
  const trimmed = String(node?.language || '').trim()
  if (!trimmed)
    return ''
  const [firstToken] = trimmed.split(/\s+/)
  const [base] = firstToken.split(':')
  return base.toLowerCase()
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

function renderCustomCodeBlockComponent(
  component: any,
  node: any,
  key: React.Key,
  ctx: RenderContext,
  specialProps: Record<string, unknown> = {},
) {
  const extraProps = getCodeBlockExtraProps(ctx.codeBlockProps)
  const onPreviewCode = ctx.events.onHandleArtifactClick
    ? (payload: { type?: string, content?: string, title?: string }) => {
        const artifactType = payload.type === 'image/svg+xml'
          ? 'image/svg+xml'
          : 'text/html'

        ctx.events.onHandleArtifactClick?.({
          node: payload.content == null
            ? node
            : {
                ...node,
                code: payload.content,
              },
          artifactType,
          artifactTitle: payload.title || (
            artifactType === 'image/svg+xml' ? 'SVG Preview' : 'HTML Preview'
          ),
          id: String(key),
        })
      }
    : undefined

  return React.createElement(component, {
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
    onPreviewCode,
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
  key: React.Key,
  ctx: RenderContext,
  specialProps: Record<string, unknown> = {},
) {
  return React.createElement(component, {
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
  component: React.ComponentType<any>,
  node: ParsedNode,
  key: React.Key,
  ctx: RenderContext,
  tag: string,
) {
  const attrs = sanitizeHtmlTokenAttrs((node as any).attrs ?? undefined, ctx.htmlPolicy ?? 'safe', tag)
  const props = convertHtmlAttrsToProps(tokenAttrsToRecord(attrs))
  const children = Array.isArray((node as any).children)
    ? renderNodeChildren((node as any).children, ctx, `${String(key)}-html`, renderNode)
    : ((node as any).content ?? null)

  return React.createElement(component, {
    ...props,
    key,
  }, children)
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

function renderCodeBlock(
  node: any,
  key: React.Key,
  ctx: RenderContext,
  customComponents: Record<string, any>,
) {
  const rawLanguage = getRawCodeBlockLanguage(node)
  const language = normalizeLanguageIdentifier(rawLanguage)
  const customForLanguage = getCustomCodeLanguageComponent(customComponents, rawLanguage)
  if (language === 'mermaid') {
    const mermaidProps = getMermaidRenderProps(node, ctx)
    const customMermaid = customForLanguage || customComponents.mermaid
    if (customMermaid)
      return renderSpecialCodeBlockComponent(customMermaid, node, key, ctx, mermaidProps)
    if (!ctx.renderCodeBlocksAsPre) {
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

  if (ctx.renderCodeBlocksAsPre || language === 'mermaid') {
    return <PreCodeNode key={key} node={node} />
  }

  return (
    <MonacoCodeBlockNode
      key={key}
      node={node}
      loading={Boolean(node.loading)}
      stream={ctx.codeBlockStream}
      monacoOptions={ctx.codeBlockThemes?.monacoOptions}
      themes={ctx.codeBlockThemes?.themes}
      darkTheme={ctx.codeBlockThemes?.darkTheme}
      lightTheme={ctx.codeBlockThemes?.lightTheme}
      minWidth={ctx.codeBlockThemes?.minWidth}
      maxWidth={ctx.codeBlockThemes?.maxWidth}
      isDark={ctx.isDark}
      onCopy={ctx.events.onCopy}
      {...getCodeBlockExtraProps(ctx.codeBlockProps, { omit: ['langs'] })}
    />
  )
}

export function renderNode(node: ParsedNode, key: React.Key, ctx: RenderContext) {
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
    return React.createElement(streamingCustom, {
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
    return React.createElement(custom, {
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
    const fallbackTag = String((node as any).tag ?? '').trim().toLowerCase() || getHtmlTagFromContent((node as any).content)
    const tag = resolvedCustomTag?.tag ?? fallbackTag
    if (tag) {
      const customForTag = resolvedCustomTag?.component ?? (customComponents as Record<string, any>)[tag]
      const isWhitelisted = resolvedCustomTag?.isWhitelisted ?? (ctx.customHtmlTags ?? []).some((t: string) => t.toLowerCase() === tag)
      if (isWhitelisted && customForTag) {
        const coerced = {
          ...(node as any),
          type: tag,
          tag,
          content: stripCustomHtmlWrapper((node as any).content, tag),
        }
        return React.createElement(customForTag as any, {
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
          return <TextNode key={key} node={{ type: 'text', content: rawContent, raw: rawContent } as any} ctx={ctx} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
        }
        else {
          return <ParagraphNode key={key} node={{ type: 'paragraph', children: [{ type: 'text', content: rawContent, raw: rawContent }], raw: rawContent } as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
        }
      }
    }
  }

  switch (node.type) {
    case 'text':
      return <TextNode key={key} node={node as any} ctx={ctx} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'text_special':
      return <TextNode key={key} node={{ type: 'text', content: (node as any).content ?? '', center: (node as any).center } as any} ctx={ctx} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'paragraph':
      return <ParagraphNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'heading':
      return <HeadingNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'blockquote':
      return <BlockquoteNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'list':
      return <ListNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'list_item':
      return <ListItemNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'table':
      return <TableNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'definition_list':
      return <DefinitionListNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'footnote':
      return <FootnoteNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'footnote_reference':
      return <FootnoteReferenceNode key={key} node={node as any} />
    case 'footnote_anchor':
      return <FootnoteAnchorNode key={key} node={node as any} />
    case 'admonition':
      return <AdmonitionNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} isDark={ctx.isDark} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'hardbreak':
      return <HardBreakNode key={key} node={node as any} typewriter={ctx.typewriter} fade={ctx.fade} />
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
          fade={ctx.fade}
        />
      )
    case 'image':
      return (
        <ImageNode
          key={key}
          node={node as any}
        />
      )
    case 'inline_code':
      return <InlineCodeNode key={key} node={node as any} ctx={ctx} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'code_block':
      return renderCodeBlock(node, key, ctx, customComponents)
    case 'strong':
      return (
        <StrongNode
          key={key}
          node={node as any}
        >
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
      return <CheckboxNode key={key} node={node as any} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'emoji':
      return <EmojiNode key={key} node={node as any} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'thematic_break':
      return <ThematicBreakNode key={key} />
    case 'math_inline':
      return <MathInlineNode key={key} node={node as any} />
    case 'math_block':
      return <MathBlockNode key={key} node={node as any} />
    case 'reference':
      return <ReferenceNode key={key} node={node as any} ctx={ctx} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'html_block':
    case 'html_inline':
      return node.type === 'html_block'
        ? <HtmlBlockNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} customId={ctx.customId} />
        : <HtmlInlineNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} customId={ctx.customId} />
    case 'vmr_container':
      return <VmrContainerNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} fade={ctx.fade} />
    case 'label_open':
    case 'label_close':
      return null
    default:
      return <FallbackComponent key={key} node={node as any} />
  }
}
