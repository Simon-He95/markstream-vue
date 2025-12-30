import type { ParsedNode } from 'stream-markdown-parser'
import type { RenderContext } from '../types'
import React from 'react'
import { AdmonitionNode } from '../components/AdmonitionNode/AdmonitionNode'
import { BlockquoteNode } from '../components/BlockquoteNode/BlockquoteNode'
import { CheckboxNode } from '../components/CheckboxNode/CheckboxNode'
import { CodeBlockNode as MonacoCodeBlockNode } from '../components/CodeBlockNode/CodeBlockNode'
import { PreCodeNode } from '../components/CodeBlockNode/PreCodeNode'
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
import { InlineCodeNode } from '../components/InlineCodeNode/InlineCodeNode'
import { InsertNode } from '../components/InsertNode/InsertNode'
import { LinkNode } from '../components/LinkNode/LinkNode'
import { ListItemNode } from '../components/ListItemNode/ListItemNode'
import { ListNode } from '../components/ListNode/ListNode'
import { MathBlockNode } from '../components/MathBlockNode/MathBlockNode'
import { MathInlineNode } from '../components/MathInlineNode/MathInlineNode'
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
import { normalizeLanguageIdentifier } from '../utils/languageIcon'
import { renderNodeChildren } from './renderChildren'

function getHtmlTagFromContent(html: unknown) {
  const raw = String(html ?? '')
  const match = raw.match(/^\s*<\s*([A-Z][\w:-]*)/i)
  return match ? match[1].toLowerCase() : ''
}

function stripCustomHtmlWrapper(html: unknown, tag: string) {
  const raw = String(html ?? '')
  if (!tag)
    return raw
  const openRe = new RegExp(String.raw`^\s*<\s*${tag}(?:\s[^>]*)?>\s*`, 'i')
  const closeRe = new RegExp(String.raw`\s*<\s*\/\s*${tag}\s*>\s*$`, 'i')
  return raw.replace(openRe, '').replace(closeRe, '')
}

function renderCodeBlock(node: any, key: React.Key, ctx: RenderContext) {
  const language = normalizeLanguageIdentifier(String(node.language || ''))
  if (language === 'mermaid') {
    const customMermaid = getCustomNodeComponents(ctx.customId).mermaid
    if (customMermaid)
      return React.createElement(customMermaid as any, { key, node, isDark: ctx.isDark })
    if (!ctx.renderCodeBlocksAsPre) {
      return (
        <MermaidBlockNode
          key={key}
          node={node as any}
          isDark={ctx.isDark}
          loading={Boolean(node.loading)}
        />
      )
    }
  }

  if (ctx.renderCodeBlocksAsPre || language === 'mermaid') {
    return <PreCodeNode key={key} node={node} />
  }

  return (
    <MonacoCodeBlockNode
      key={key}
      node={node}
      loading={Boolean(node.loading)}
      stream={ctx.codeBlockStream}
      darkTheme={ctx.codeBlockThemes?.darkTheme}
      lightTheme={ctx.codeBlockThemes?.lightTheme}
      monacoOptions={ctx.codeBlockThemes?.monacoOptions}
      themes={ctx.codeBlockThemes?.themes}
      minWidth={ctx.codeBlockThemes?.minWidth}
      maxWidth={ctx.codeBlockThemes?.maxWidth}
      isDark={ctx.isDark}
      onCopy={ctx.events.onCopy}
      {...(ctx.codeBlockProps || {})}
    />
  )
}

export function renderNode(node: ParsedNode, key: React.Key, ctx: RenderContext) {
  const customComponents = getCustomNodeComponents(ctx.customId)
  const custom = (customComponents as Record<string, any>)[node.type]
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
    })
  }

  if (node.type === 'html_block' || node.type === 'html_inline') {
    const tag = String((node as any).tag ?? '').trim().toLowerCase() || getHtmlTagFromContent((node as any).content)
    const customForTag = tag ? (customComponents as Record<string, any>)[tag] : null
    if (customForTag) {
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
      })
    }
  }

  switch (node.type) {
    case 'text':
      return <TextNode key={key} node={node as any} typewriter={ctx.typewriter} />
    case 'text_special':
      return <TextNode key={key} node={{ type: 'text', content: (node as any).content ?? '', center: (node as any).center } as any} typewriter={ctx.typewriter} />
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
      return <LinkNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} isDark={ctx.isDark} typewriter={ctx.typewriter} />
    case 'image':
      return (
        <ImageNode
          key={key}
          node={node as any}
        />
      )
    case 'inline_code':
      return <InlineCodeNode key={key} node={node as any} typewriter={ctx.typewriter} />
    case 'code_block':
      return renderCodeBlock(node, key, ctx)
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
      return <CheckboxNode key={key} node={node as any} typewriter={ctx.typewriter} />
    case 'emoji':
      return <EmojiNode key={key} node={node as any} typewriter={ctx.typewriter} />
    case 'thematic_break':
      return <ThematicBreakNode key={key} />
    case 'math_inline':
      return <MathInlineNode key={key} node={node as any} />
    case 'math_block':
      return <MathBlockNode key={key} node={node as any} />
    case 'reference':
      return <ReferenceNode key={key} node={node as any} ctx={ctx} typewriter={ctx.typewriter} />
    case 'html_block':
    case 'html_inline':
      return node.type === 'html_block'
        ? <HtmlBlockNode key={key} node={node as any} typewriter={ctx.typewriter} />
        : <HtmlInlineNode key={key} node={node as any} typewriter={ctx.typewriter} />
    case 'vmr_container':
      return <VmrContainerNode key={key} node={node as any} ctx={ctx} renderNode={renderNode} indexKey={key} typewriter={ctx.typewriter} />
    case 'label_open':
    case 'label_close':
      return null
    default:
      return <FallbackComponent key={key} node={node as any} />
  }
}
