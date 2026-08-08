'use client'

import type { D2Loader } from './components/D2BlockNode/d2'
import React, { useEffect, useState } from 'react'
import { AdmonitionNode as ClientAdmonitionNode } from './components/AdmonitionNode/AdmonitionNode'
import { BlockquoteNode as ClientBlockquoteNode } from './components/BlockquoteNode/BlockquoteNode'
import { CheckboxNode as ClientCheckboxNode } from './components/CheckboxNode/CheckboxNode'
import { CodeBlockNode as ClientCodeBlockNode } from './components/CodeBlockNode/CodeBlockNode'
import { HtmlPreviewFrame as ClientHtmlPreviewFrame } from './components/CodeBlockNode/HtmlPreviewFrame'
import { disableD2, enableD2, isD2Enabled, setD2Loader } from './components/D2BlockNode/d2'
import { D2BlockNode as ClientD2BlockNode } from './components/D2BlockNode/D2BlockNode'
import { DefinitionListNode as ClientDefinitionListNode } from './components/DefinitionListNode/DefinitionListNode'
import { EmojiNode as ClientEmojiNode } from './components/EmojiNode/EmojiNode'
import { EmphasisNode as ClientEmphasisNode } from './components/EmphasisNode/EmphasisNode'
import { FootnoteAnchorNode as ClientFootnoteAnchorNode } from './components/FootnoteAnchorNode/FootnoteAnchorNode'
import { FootnoteNode as ClientFootnoteNode } from './components/FootnoteNode/FootnoteNode'
import { FootnoteReferenceNode as ClientFootnoteReferenceNode } from './components/FootnoteReferenceNode/FootnoteReferenceNode'
import { HardBreakNode as ClientHardBreakNode } from './components/HardBreakNode/HardBreakNode'
import { HeadingNode as ClientHeadingNode } from './components/HeadingNode/HeadingNode'
import { HighlightNode as ClientHighlightNode } from './components/HighlightNode/HighlightNode'
import { HtmlBlockNode as ClientHtmlBlockNode } from './components/HtmlBlockNode/HtmlBlockNode'
import { HtmlInlineNode as ClientHtmlInlineNode } from './components/HtmlInlineNode/HtmlInlineNode'
import { ImageNode as ClientImageNode } from './components/ImageNode/ImageNode'
import { InfographicBlockNode as ClientInfographicBlockNode } from './components/InfographicBlockNode/InfographicBlockNode'
import { InlineCodeNode as ClientInlineCodeNode } from './components/InlineCodeNode/InlineCodeNode'
import { InsertNode as ClientInsertNode } from './components/InsertNode/InsertNode'
import { LinkNode as ClientLinkNode } from './components/LinkNode/LinkNode'
import { ListItemNode as ClientListItemNode } from './components/ListItemNode/ListItemNode'
import { ListNode as ClientListNode } from './components/ListNode/ListNode'
import { MathBlockNode as ClientMathBlockNode } from './components/MathBlockNode/MathBlockNode'
import { MathInlineNode as ClientMathInlineNode } from './components/MathInlineNode/MathInlineNode'
import { MermaidBlockNode as ClientMermaidBlockNode } from './components/MermaidBlockNode/MermaidBlockNode'
import ClientNodeRenderer from './components/NodeRenderer'
import { FallbackComponent as ClientFallbackComponent } from './components/NodeRenderer/FallbackComponent'
import { ParagraphNode as ClientParagraphNode } from './components/ParagraphNode/ParagraphNode'
import { PreCodeNode as ClientPreCodeNode } from './components/PreCodeNode/PreCodeNode'
import { ReferenceNode as ClientReferenceNode } from './components/ReferenceNode/ReferenceNode'
import { StrikethroughNode as ClientStrikethroughNode } from './components/StrikethroughNode/StrikethroughNode'
import { StrongNode as ClientStrongNode } from './components/StrongNode/StrongNode'
import { SubscriptNode as ClientSubscriptNode } from './components/SubscriptNode/SubscriptNode'
import { SuperscriptNode as ClientSuperscriptNode } from './components/SuperscriptNode/SuperscriptNode'
import { TableNode as ClientTableNode } from './components/TableNode/TableNode'
import { TextNode as ClientTextNode } from './components/TextNode/TextNode'
import { ThematicBreakNode as ClientThematicBreakNode } from './components/ThematicBreakNode/ThematicBreakNode'
import { Tooltip as ClientTooltip } from './components/Tooltip/Tooltip'
import { VmrContainerNode as ClientVmrContainerNode } from './components/VmrContainerNode/VmrContainerNode'
import {
  clearGlobalCustomComponents,
  defineHtmlComponents,
  defineStreamingComponents,
  getCustomNodeComponents,
  removeCustomComponents,
  setCustomComponents,
} from './customComponents'
import { AdmonitionNode as ServerAdmonitionNode, BlockquoteNode as ServerBlockquoteNode, CheckboxNode as ServerCheckboxNode, CodeBlockNode as ServerCodeBlockNode, D2BlockNode as ServerD2BlockNode, DefinitionListNode as ServerDefinitionListNode, EmojiNode as ServerEmojiNode, EmphasisNode as ServerEmphasisNode, FallbackComponent as ServerFallbackComponent, FootnoteAnchorNode as ServerFootnoteAnchorNode, FootnoteNode as ServerFootnoteNode, FootnoteReferenceNode as ServerFootnoteReferenceNode, HardBreakNode as ServerHardBreakNode, HeadingNode as ServerHeadingNode, HighlightNode as ServerHighlightNode, HtmlBlockNode as ServerHtmlBlockNode, HtmlInlineNode as ServerHtmlInlineNode, HtmlPreviewFrame as ServerHtmlPreviewFrame, ImageNode as ServerImageNode, InfographicBlockNode as ServerInfographicBlockNode, InlineCodeNode as ServerInlineCodeNode, InsertNode as ServerInsertNode, LinkNode as ServerLinkNode, ListItemNode as ServerListItemNode, ListNode as ServerListNode, MathBlockNode as ServerMathBlockNode, MathInlineNode as ServerMathInlineNode, MermaidBlockNode as ServerMermaidBlockNode, NodeRenderer as ServerNodeRenderer, ParagraphNode as ServerParagraphNode, PreCodeNode as ServerPreCodeNode, ReferenceNode as ServerReferenceNode, StrikethroughNode as ServerStrikethroughNode, StrongNode as ServerStrongNode, SubscriptNode as ServerSubscriptNode, SuperscriptNode as ServerSuperscriptNode, TableNode as ServerTableNode, TextNode as ServerTextNode, ThematicBreakNode as ServerThematicBreakNode, Tooltip as ServerTooltip, VmrContainerNode as ServerVmrContainerNode } from './server-renderer'

function createNextEntryComponent<P>(
  ClientComponent: React.ComponentType<P>,
  ServerComponent: React.ComponentType<P>,
) {
  function renderServerComponentWithDisabledSyncKatex(props: P) {
    const globalKey = '__MARKSTREAM_REACT_DISABLE_SYNC_KATEX__'
    const globalState = globalThis as Record<string, unknown>
    const previousValue = globalState[globalKey]
    globalState[globalKey] = true
    try {
      return (ServerComponent as unknown as (props: P) => React.ReactElement | null)(props)
    }
    finally {
      if (previousValue === undefined)
        delete globalState[globalKey]
      else
        globalState[globalKey] = previousValue
    }
  }

  function MarkstreamNextEntryComponent(props: P) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
      setMounted(true)
    }, [])

    if (!mounted)
      return renderServerComponentWithDisabledSyncKatex(props)

    return React.createElement(ClientComponent, props)
  }

  MarkstreamNextEntryComponent.displayName = `MarkstreamNextEntry(${ClientComponent.displayName || ClientComponent.name || 'Component'})`

  return MarkstreamNextEntryComponent
}

export const AdmonitionNode = createNextEntryComponent(ClientAdmonitionNode, ServerAdmonitionNode)
export const BlockquoteNode = createNextEntryComponent(ClientBlockquoteNode, ServerBlockquoteNode)
export const CheckboxNode = createNextEntryComponent(ClientCheckboxNode, ServerCheckboxNode)
export const CodeBlockNode = createNextEntryComponent(ClientCodeBlockNode, ServerCodeBlockNode)
export const ReactCodeBlockNode = CodeBlockNode
export const HtmlPreviewFrame = createNextEntryComponent(ClientHtmlPreviewFrame, ServerHtmlPreviewFrame)
export const D2BlockNode = createNextEntryComponent(ClientD2BlockNode, ServerD2BlockNode)
export const DefinitionListNode = createNextEntryComponent(ClientDefinitionListNode, ServerDefinitionListNode)
export const EmojiNode = createNextEntryComponent(ClientEmojiNode, ServerEmojiNode)
export const EmphasisNode = createNextEntryComponent(ClientEmphasisNode, ServerEmphasisNode)
export const FootnoteAnchorNode = createNextEntryComponent(ClientFootnoteAnchorNode, ServerFootnoteAnchorNode)
export const FootnoteNode = createNextEntryComponent(ClientFootnoteNode, ServerFootnoteNode)
export const FootnoteReferenceNode = createNextEntryComponent(ClientFootnoteReferenceNode, ServerFootnoteReferenceNode)
export const HardBreakNode = createNextEntryComponent(ClientHardBreakNode, ServerHardBreakNode)
export const HeadingNode = createNextEntryComponent(ClientHeadingNode, ServerHeadingNode)
export const HighlightNode = createNextEntryComponent(ClientHighlightNode, ServerHighlightNode)
export const HtmlBlockNode = createNextEntryComponent(ClientHtmlBlockNode, ServerHtmlBlockNode)
export const HtmlInlineNode = createNextEntryComponent(ClientHtmlInlineNode, ServerHtmlInlineNode)
export const ImageNode = createNextEntryComponent(ClientImageNode, ServerImageNode)
export const InfographicBlockNode = createNextEntryComponent(ClientInfographicBlockNode, ServerInfographicBlockNode)
export const InlineCodeNode = createNextEntryComponent(ClientInlineCodeNode, ServerInlineCodeNode)
export const InsertNode = createNextEntryComponent(ClientInsertNode, ServerInsertNode)
export const LinkNode = createNextEntryComponent(ClientLinkNode, ServerLinkNode)
export const ListItemNode = createNextEntryComponent(ClientListItemNode, ServerListItemNode)
export const ListNode = createNextEntryComponent(ClientListNode, ServerListNode)
export const MathBlockNode = createNextEntryComponent(ClientMathBlockNode, ServerMathBlockNode)
export const MathInlineNode = createNextEntryComponent(ClientMathInlineNode, ServerMathInlineNode)
export const MermaidBlockNode = createNextEntryComponent(ClientMermaidBlockNode, ServerMermaidBlockNode)
export const NodeRenderer = createNextEntryComponent(ClientNodeRenderer, ServerNodeRenderer)
export const FallbackComponent = createNextEntryComponent(ClientFallbackComponent, ServerFallbackComponent)
export const ParagraphNode = createNextEntryComponent(ClientParagraphNode, ServerParagraphNode)
export const PreCodeNode = createNextEntryComponent(ClientPreCodeNode, ServerPreCodeNode)
export const ReferenceNode = createNextEntryComponent(ClientReferenceNode, ServerReferenceNode)
export const StrikethroughNode = createNextEntryComponent(ClientStrikethroughNode, ServerStrikethroughNode)
export const StrongNode = createNextEntryComponent(ClientStrongNode, ServerStrongNode)
export const SubscriptNode = createNextEntryComponent(ClientSubscriptNode, ServerSubscriptNode)
export const SuperscriptNode = createNextEntryComponent(ClientSuperscriptNode, ServerSuperscriptNode)
export const TableNode = createNextEntryComponent(ClientTableNode, ServerTableNode)
export const TextNode = createNextEntryComponent(ClientTextNode, ServerTextNode)
export const ThematicBreakNode = createNextEntryComponent(ClientThematicBreakNode, ServerThematicBreakNode)
export const Tooltip = createNextEntryComponent(ClientTooltip, ServerTooltip)
export const VmrContainerNode = createNextEntryComponent(ClientVmrContainerNode, ServerVmrContainerNode)

export default NodeRenderer

export type { D2Loader }
export { disableD2, enableD2, isD2Enabled, setD2Loader }
export {
  clearGlobalCustomComponents,
  defineHtmlComponents,
  defineStreamingComponents,
  getCustomNodeComponents,
  removeCustomComponents,
  setCustomComponents,
}
export type { HtmlPreviewFrameProps } from './components/CodeBlockNode/HtmlPreviewFrame'
export * from './components/D2BlockNode/d2'
export type { LinkNodeStyleProps } from './components/LinkNode/LinkNode'
export type { ListItemNodeProps } from './components/ListItemNode/ListItemNode'
export type { TooltipPlacement, TooltipProps } from './components/Tooltip/Tooltip'
export type {
  CustomComponentDisplayMode,
  HtmlComponent,
  HtmlComponentMap,
  MarkstreamCustomComponent,
  StreamingComponent,
  StreamingComponentMap,
} from './customComponents'
export * from './i18n/useSafeI18n'
export * from './renderers/renderNode'
export type { NodeRendererCodeBlockProps, NodeRendererProps } from './types'
export * from './types/component-props'
export type { NodeComponentProps } from './types/node-component'
export * from './utils/languageIcon'
export * from './workers/katexWorkerClient'
export * from './workers/mermaidWorkerClient'
