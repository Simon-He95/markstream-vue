import type { ParsedNode } from 'stream-markdown-parser'
import type { RenderContext } from '../types'
import { normalizeShikiLanguage } from 'markstream-core'
import * as Octane from 'octane'
import { convertHtmlAttrsToProps, getHtmlTagFromContent, normalizeCustomHtmlTagName, sanitizeHtmlTokenAttrs, shouldRenderUnknownHtmlTagAsText, stripCustomHtmlWrapper, tokenAttrsToRecord } from 'stream-markdown-parser'
import { AdmonitionNode } from '../components/AdmonitionNode/AdmonitionNode.tsrx'
import { BlockquoteNode } from '../components/BlockquoteNode/BlockquoteNode.tsrx'
import { CheckboxNode } from '../components/CheckboxNode/CheckboxNode.tsrx'
import { CodeBlockNode as MonacoCodeBlockNode } from '../components/CodeBlockNode/CodeBlockNode.tsrx'
import { PreCodeNode } from '../components/CodeBlockNode/PreCodeNode.tsrx'
import { D2BlockNode } from '../components/D2BlockNode/D2BlockNode.tsrx'
import { DefinitionListNode } from '../components/DefinitionListNode/DefinitionListNode.tsrx'
import { EmojiNode } from '../components/EmojiNode/EmojiNode.tsrx'
import { EmphasisNode } from '../components/EmphasisNode/EmphasisNode.tsrx'
import { FootnoteAnchorNode } from '../components/FootnoteAnchorNode/FootnoteAnchorNode.tsrx'
import { FootnoteNode } from '../components/FootnoteNode/FootnoteNode.tsrx'
import { FootnoteReferenceNode } from '../components/FootnoteReferenceNode/FootnoteReferenceNode.tsrx'
import { HardBreakNode } from '../components/HardBreakNode/HardBreakNode.tsrx'
import { HeadingNode } from '../components/HeadingNode/HeadingNode.tsrx'
import { HighlightNode } from '../components/HighlightNode/HighlightNode.tsrx'
import { HtmlBlockNode } from '../components/HtmlBlockNode/HtmlBlockNode.tsrx'
import { HtmlInlineNode } from '../components/HtmlInlineNode/HtmlInlineNode.tsrx'
import { ImageNode } from '../components/ImageNode/ImageNode.tsrx'
import { clampInfographicPreviewHeight, estimateInfographicPreviewHeight, parsePositiveNumber as parsePositiveInfographicNumber } from '../components/InfographicBlockNode/height'
import { InfographicBlockNode } from '../components/InfographicBlockNode/InfographicBlockNode.tsrx'
import { InlineCodeNode } from '../components/InlineCodeNode/InlineCodeNode.tsrx'
import { InsertNode } from '../components/InsertNode/InsertNode.tsrx'
import { LinkNode } from '../components/LinkNode/LinkNode.tsrx'
import { ListItemNode } from '../components/ListItemNode/ListItemNode.tsrx'
import { ListNode } from '../components/ListNode/ListNode.tsrx'
import { MathBlockNode } from '../components/MathBlockNode/MathBlockNode.tsrx'
import { MathInlineNode } from '../components/MathInlineNode/MathInlineNode.tsrx'
import { clampMermaidPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber as parsePositiveMermaidNumber } from '../components/MermaidBlockNode/height'
import { MermaidBlockNode } from '../components/MermaidBlockNode/MermaidBlockNode.tsrx'
import { FallbackComponent } from '../components/NodeRenderer/FallbackComponent.tsrx'
import { ParagraphNode } from '../components/ParagraphNode/ParagraphNode.tsrx'
import { ReferenceNode } from '../components/ReferenceNode/ReferenceNode.tsrx'
import { StrikethroughNode } from '../components/StrikethroughNode/StrikethroughNode.tsrx'
import { StrongNode } from '../components/StrongNode/StrongNode.tsrx'
import { SubscriptNode } from '../components/SubscriptNode/SubscriptNode.tsrx'
import { SuperscriptNode } from '../components/SuperscriptNode/SuperscriptNode.tsrx'
import { TableNode } from '../components/TableNode/TableNode.tsrx'
import { TextNode } from '../components/TextNode/TextNode.tsrx'
import { ThematicBreakNode } from '../components/ThematicBreakNode/ThematicBreakNode.tsrx'
import { VmrContainerNode } from '../components/VmrContainerNode/VmrContainerNode.tsrx'
import { getCustomNodeComponents } from '../customComponents'
import { resolveCustomHtmlTag } from '../utils/customHtmlTag'
import { normalizeLanguageIdentifier } from '../utils/languageIcon'
import { getCodeBlockExtraProps } from './codeBlockExtraProps'
import { renderNodeChildren } from './renderChildren.tsrx'

type NodeKey = string | number | bigint

function createNodeElement<TProps extends { node: unknown }>(
  component: (props: TProps) => unknown,
  node: TProps['node'] | ParsedNode,
  key: NodeKey,
  props: Omit<TProps, 'node'>,
  ...children: Octane.OctaneNode[]
) {
  const componentProps = {
    ...props,
    key,
    node,
  } as unknown as TProps
  return Octane.createElement(
    component as unknown as Octane.ComponentBody<TProps>,
    componentProps,
    ...children,
  )
}

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
  key: string | number | bigint,
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

  return Octane.createElement(component, {
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
  key: string | number | bigint,
  ctx: RenderContext,
  specialProps: Record<string, unknown> = {},
) {
  return Octane.createElement(component, {
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
  key: string | number | bigint,
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
      return Octane.createElement(MermaidBlockNode, {
        key,
        node,
        isDark: ctx.isDark,
        loading: Boolean(node.loading),
        ...mermaidProps,
      })
    }
  }

  if (language === 'infographic') {
    const infographicProps = getInfographicRenderProps(node, ctx)
    const customInfographic = customForLanguage || customComponents.infographic
    if (customInfographic)
      return renderSpecialCodeBlockComponent(customInfographic, node, key, ctx, infographicProps)

    return Octane.createElement(InfographicBlockNode, {
      key,
      node,
      isDark: ctx.isDark,
      loading: Boolean(node.loading),
      ...infographicProps,
    })
  }

  if (language === 'd2' || language === 'd2lang') {
    const customD2 = customForLanguage || customComponents.d2
    if (customD2)
      return renderSpecialCodeBlockComponent(customD2, node, key, ctx, ctx.d2Props || {})

    return Octane.createElement(D2BlockNode, {
      key,
      node,
      isDark: ctx.isDark,
      loading: Boolean(node.loading),
      ...(ctx.d2Props || {}),
    })
  }

  if (customForLanguage)
    return renderCustomCodeBlockComponent(customForLanguage, node, key, ctx)

  const customCodeBlock = customComponents.code_block
  if (customCodeBlock)
    return renderCustomCodeBlockComponent(customCodeBlock, node, key, ctx)

  if (ctx.renderCodeBlocksAsPre || language === 'mermaid') {
    const extraProps = getCodeBlockExtraProps(ctx.codeBlockProps, { omit: ['langs'] })
    return Octane.createElement(PreCodeNode, {
      key,
      node,
      showLineNumbers: extraProps.showLineNumbers === true,
    })
  }

  return Octane.createElement(MonacoCodeBlockNode, {
    key,
    node,
    loading: Boolean(node.loading),
    stream: ctx.codeBlockStream,
    themes: ctx.codeBlockThemes?.themes,
    darkTheme: ctx.codeBlockThemes?.darkTheme,
    lightTheme: ctx.codeBlockThemes?.lightTheme,
    minWidth: ctx.codeBlockThemes?.minWidth,
    maxWidth: ctx.codeBlockThemes?.maxWidth,
    isDark: ctx.isDark,
    onCopy: ctx.events.onCopy,
    ...getCodeBlockExtraProps(ctx.codeBlockProps, { omit: ['langs'] }),
  })
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
          return createNodeElement(TextNode, { type: 'text', content: rawContent }, key, {
            ctx,
            indexKey: key,
            typewriter: ctx.typewriter,
            fade: ctx.fade,
          })
        }
        else {
          return createNodeElement(
            ParagraphNode,
            {
              type: 'paragraph',
              children: [{ type: 'text', content: rawContent, raw: rawContent }],
            },
            key,
            {
              ctx,
              renderNode,
              indexKey: key,
              typewriter: ctx.typewriter,
              fade: ctx.fade,
            },
          )
        }
      }
    }
  }

  switch (node.type) {
    case 'text':
      return createNodeElement(TextNode, node, key, {
        ctx,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'text_special':
      return createNodeElement(
        TextNode,
        {
          type: 'text',
          content: (node as { content?: string }).content ?? '',
          center: (node as { center?: boolean }).center,
        },
        key,
        {
          ctx,
          indexKey: key,
          typewriter: ctx.typewriter,
          fade: ctx.fade,
        },
      )
    case 'paragraph':
      return createNodeElement(ParagraphNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'heading':
      return createNodeElement(HeadingNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'blockquote':
      return createNodeElement(BlockquoteNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'list':
      return createNodeElement(ListNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'list_item':
      return createNodeElement(ListItemNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'table':
      return createNodeElement(TableNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'definition_list':
      return createNodeElement(DefinitionListNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'footnote':
      return createNodeElement(FootnoteNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'footnote_reference':
      return createNodeElement(FootnoteReferenceNode, node, key, {})
    case 'footnote_anchor':
      return createNodeElement(FootnoteAnchorNode, node, key, {})
    case 'admonition':
      return createNodeElement(AdmonitionNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        isDark: ctx.isDark,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'hardbreak':
      return createNodeElement(HardBreakNode, node, key, {
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'link':
      return createNodeElement(LinkNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        isDark: ctx.isDark,
        showTooltip: typeof ctx.showTooltips === 'boolean' ? ctx.showTooltips : undefined,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'image':
      return createNodeElement(ImageNode, node, key, {})
    case 'inline_code':
      return createNodeElement(InlineCodeNode, node, key, {
        ctx,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'code_block':
      return renderCodeBlock(node, key, ctx, customComponents)
    case 'strong':
      return createNodeElement(
        StrongNode,
        node,
        key,
        {},
        renderNodeChildren(
          (node as ParsedNode & { children?: ParsedNode[] }).children,
          ctx,
          `${String(key)}-strong`,
          renderNode,
        ),
      )
    case 'emphasis':
      return createNodeElement(
        EmphasisNode,
        node,
        key,
        {},
        renderNodeChildren(
          (node as ParsedNode & { children?: ParsedNode[] }).children,
          ctx,
          `${String(key)}-em`,
          renderNode,
        ),
      )
    case 'strikethrough':
      return createNodeElement(
        StrikethroughNode,
        node,
        key,
        {},
        renderNodeChildren(
          (node as ParsedNode & { children?: ParsedNode[] }).children,
          ctx,
          `${String(key)}-strike`,
          renderNode,
        ),
      )
    case 'highlight':
      return createNodeElement(
        HighlightNode,
        node,
        key,
        {},
        renderNodeChildren(
          (node as ParsedNode & { children?: ParsedNode[] }).children,
          ctx,
          `${String(key)}-highlight`,
          renderNode,
        ),
      )
    case 'insert':
      return createNodeElement(
        InsertNode,
        node,
        key,
        {},
        renderNodeChildren(
          (node as ParsedNode & { children?: ParsedNode[] }).children,
          ctx,
          `${String(key)}-insert`,
          renderNode,
        ),
      )
    case 'subscript':
      return createNodeElement(
        SubscriptNode,
        node,
        key,
        {},
        renderNodeChildren(
          (node as ParsedNode & { children?: ParsedNode[] }).children,
          ctx,
          `${String(key)}-sub`,
          renderNode,
        ),
      )
    case 'superscript':
      return createNodeElement(
        SuperscriptNode,
        node,
        key,
        {},
        renderNodeChildren(
          (node as ParsedNode & { children?: ParsedNode[] }).children,
          ctx,
          `${String(key)}-sup`,
          renderNode,
        ),
      )
    case 'checkbox':
    case 'checkbox_input':
      return createNodeElement(CheckboxNode, node, key, {
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'emoji':
      return createNodeElement(EmojiNode, node, key, {
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'thematic_break':
      return Octane.createElement(ThematicBreakNode)
    case 'math_inline':
      return createNodeElement(MathInlineNode, node, key, {})
    case 'math_block':
      return createNodeElement(MathBlockNode, node, key, {})
    case 'reference':
      return createNodeElement(ReferenceNode, node, key, {
        ctx,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'html_block':
    case 'html_inline':
      return node.type === 'html_block'
        ? createNodeElement(HtmlBlockNode, node, key, {
            ctx,
            renderNode,
            indexKey: key,
            typewriter: ctx.typewriter,
            fade: ctx.fade,
            customId: ctx.customId,
          })
        : createNodeElement(HtmlInlineNode, node, key, {
            ctx,
            renderNode,
            indexKey: key,
            typewriter: ctx.typewriter,
            fade: ctx.fade,
            customId: ctx.customId,
          })
    case 'vmr_container':
      return createNodeElement(VmrContainerNode, node, key, {
        ctx,
        renderNode,
        indexKey: key,
        typewriter: ctx.typewriter,
        fade: ctx.fade,
      })
    case 'label_open':
    case 'label_close':
      return null
    default:
      return createNodeElement(FallbackComponent, node, key, {})
  }
}
