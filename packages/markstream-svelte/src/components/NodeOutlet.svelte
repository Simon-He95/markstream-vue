<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { STANDARD_HTML_TAGS } from 'stream-markdown-parser'
  import { getCustomNodeComponents } from '../customComponents'
  import AdmonitionNode from './AdmonitionNode.svelte'
  import BlockquoteNode from './BlockquoteNode.svelte'
  import CheckboxNode from './CheckboxNode.svelte'
  import CodeBlockNode from './CodeBlockNode.svelte'
  import D2BlockNode from './D2BlockNode.svelte'
  import DefinitionListNode from './DefinitionListNode.svelte'
  import EmojiNode from './EmojiNode.svelte'
  import EmphasisNode from './EmphasisNode.svelte'
  import FallbackComponent from './FallbackComponent.svelte'
  import FootnoteAnchorNode from './FootnoteAnchorNode.svelte'
  import FootnoteNode from './FootnoteNode.svelte'
  import FootnoteReferenceNode from './FootnoteReferenceNode.svelte'
  import HardBreakNode from './HardBreakNode.svelte'
  import HeadingNode from './HeadingNode.svelte'
  import HighlightNode from './HighlightNode.svelte'
  import HtmlBlockNode from './HtmlBlockNode.svelte'
  import HtmlInlineNode from './HtmlInlineNode.svelte'
  import ImageNode from './ImageNode.svelte'
  import InfographicBlockNode from './InfographicBlockNode.svelte'
  import InlineCodeNode from './InlineCodeNode.svelte'
  import InsertNode from './InsertNode.svelte'
  import LinkNode from './LinkNode.svelte'
  import ListItemNode from './ListItemNode.svelte'
  import ListNode from './ListNode.svelte'
  import MathBlockNode from './MathBlockNode.svelte'
  import MathInlineNode from './MathInlineNode.svelte'
  import MermaidBlockNode from './MermaidBlockNode.svelte'
  import ParagraphNode from './ParagraphNode.svelte'
  import PreCodeNode from './PreCodeNode.svelte'
  import ReferenceNode from './ReferenceNode.svelte'
  import StrikethroughNode from './StrikethroughNode.svelte'
  import StrongNode from './StrongNode.svelte'
  import SubscriptNode from './SubscriptNode.svelte'
  import SuperscriptNode from './SuperscriptNode.svelte'
  import TableNode from './TableNode.svelte'
  import TextNode from './TextNode.svelte'
  import ThematicBreakNode from './ThematicBreakNode.svelte'
  import VmrContainerNode from './VmrContainerNode.svelte'
  import { hasCompleteHtmlTagContent } from './shared/node-helpers'
  import {
    coerceBuiltinHtmlNode,
    coerceCustomHtmlNode,
    resolveHtmlTag,
    resolveNodeOutletCodeMode,
    resolveNodeOutletCustomComponent,
    resolveNodeOutletCustomInputs,
  } from './shared/node-outlet-helpers'

  type Props = {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
    indexKey?: string | number
  };
  let {
    node,
    context = undefined,
    indexKey = undefined,
  }: Props = $props()

  let resolvedType = $derived(String((node as any)?.type || ''))
  let customComponentMap = $derived(context?.customComponents || getCustomNodeComponents(context?.customId))
  let CustomComponent = $derived(resolveNodeOutletCustomComponent(node, context, customComponentMap))
  let customNode = $derived(coerceCustomHtmlNode(node))
  let customInputs = $derived(resolveNodeOutletCustomInputs(node, context) || {})
  let codeMode = $derived(resolveNodeOutletCodeMode(node, context))
  let htmlTag = $derived(resolveHtmlTag(node))
  let shouldEscapeHtmlTag = $derived(resolveShouldEscapeHtmlTag())
  let htmlRenderNode = $derived(coerceBuiltinHtmlNode(node, resolvedType))
  let codeBlockInstanceKey = $derived(`${String(indexKey ?? 'code-block')}:${String((node as any)?.language ?? '')}:${(node as any)?.diff ? 'diff' : 'code'}`)
  let escapedTextNode = $derived({
    type: 'text',
    content: String((node as any)?.content ?? (node as any)?.raw ?? ''),
    raw: String((node as any)?.content ?? (node as any)?.raw ?? ''),
  } as SvelteRenderableNode)

  function resolveShouldEscapeHtmlTag() {
    if (resolvedType !== 'html_block' && resolvedType !== 'html_inline')
      return false
    if (context?.htmlPolicy === 'escape')
      return true
    if (!htmlTag)
      return false
    const customHtmlTags = context?.customHtmlTags ?? []
    const isWhitelisted = customHtmlTags.some(t => String(t).toLowerCase() === htmlTag)
    if (isWhitelisted)
      return false
    if (STANDARD_HTML_TAGS.has(htmlTag))
      return false
    return !hasCompleteHtmlTagContent((node as any)?.content ?? (node as any)?.raw, htmlTag)
  }
</script>

{#if CustomComponent}
  <CustomComponent
    node={customNode}
    context={context}
    ctx={context}
    customId={context?.customId}
    isDark={context?.isDark}
    indexKey={indexKey}
    typewriter={context?.typewriter}
    fade={context?.fade}
    {...customInputs}
  />
{:else if resolvedType === 'text' || resolvedType === 'text_special'}
  <TextNode {node} {context} {indexKey} typewriter={context?.typewriter} />
{:else if resolvedType === 'paragraph'}
  <ParagraphNode {node} {context} {indexKey} />
{:else if resolvedType === 'heading'}
  <HeadingNode {node} {context} {indexKey} />
{:else if resolvedType === 'blockquote'}
  <BlockquoteNode {node} {context} {indexKey} />
{:else if resolvedType === 'list'}
  <ListNode {node} {context} {indexKey} />
{:else if resolvedType === 'list_item'}
  <ListItemNode {node} {context} {indexKey} />
{:else if resolvedType === 'table'}
  <TableNode {node} {context} />
{:else if resolvedType === 'definition_list'}
  <DefinitionListNode {node} {context} />
{:else if resolvedType === 'footnote'}
  <FootnoteNode {node} {context} />
{:else if resolvedType === 'footnote_reference'}
  <FootnoteReferenceNode {node} />
{:else if resolvedType === 'footnote_anchor'}
  <FootnoteAnchorNode {node} />
{:else if resolvedType === 'admonition'}
  <AdmonitionNode {node} {context} />
{:else if resolvedType === 'hardbreak'}
  <HardBreakNode />
{:else if resolvedType === 'link'}
  <LinkNode {node} {context} {indexKey} showTooltip={typeof context?.showTooltips === 'boolean' ? context?.showTooltips : undefined} />
{:else if resolvedType === 'image'}
  <ImageNode {node} />
{:else if resolvedType === 'inline_code'}
  <InlineCodeNode {node} {context} {indexKey} />
{:else if resolvedType === 'strong'}
  <StrongNode {node} {context} {indexKey} />
{:else if resolvedType === 'emphasis'}
  <EmphasisNode {node} {context} {indexKey} />
{:else if resolvedType === 'strikethrough'}
  <StrikethroughNode {node} {context} {indexKey} />
{:else if resolvedType === 'highlight'}
  <HighlightNode {node} {context} {indexKey} />
{:else if resolvedType === 'insert'}
  <InsertNode {node} {context} {indexKey} />
{:else if resolvedType === 'subscript'}
  <SubscriptNode {node} {context} {indexKey} />
{:else if resolvedType === 'superscript'}
  <SuperscriptNode {node} {context} {indexKey} />
{:else if resolvedType === 'checkbox' || resolvedType === 'checkbox_input'}
  <CheckboxNode {node} />
{:else if resolvedType === 'emoji'}
  <EmojiNode {node} />
{:else if resolvedType === 'reference'}
  <ReferenceNode {node} {context} />
{:else if resolvedType === 'html_block'}
  {#if shouldEscapeHtmlTag}
    <TextNode node={escapedTextNode} {context} {indexKey} />
  {:else}
    <HtmlBlockNode node={htmlRenderNode} {context} />
  {/if}
{:else if resolvedType === 'html_inline'}
  {#if shouldEscapeHtmlTag}
    <TextNode node={escapedTextNode} {context} {indexKey} />
  {:else}
    <HtmlInlineNode node={htmlRenderNode} {context} />
  {/if}
{:else if resolvedType === 'vmr_container'}
  <VmrContainerNode {node} {context} />
{:else if resolvedType === 'thematic_break'}
  <ThematicBreakNode />
{:else if resolvedType === 'math_inline'}
  <MathInlineNode {node} />
{:else if resolvedType === 'math_block'}
  <MathBlockNode {node} />
{:else if resolvedType === 'code_block'}
  {#if codeMode === 'mermaid'}
    <MermaidBlockNode {node} {context} {...customInputs} />
  {:else if codeMode === 'd2'}
    <D2BlockNode {node} {context} {...customInputs} />
  {:else if codeMode === 'infographic'}
    <InfographicBlockNode {node} {context} {...customInputs} />
  {:else if codeMode === 'pre'}
    <PreCodeNode {node} />
  {:else}
    {#key codeBlockInstanceKey}
      <CodeBlockNode {node} {context} {...customInputs} />
    {/key}
  {/if}
{:else if resolvedType === 'label_open' || resolvedType === 'label_close'}
  <span hidden></span>
{:else}
  <FallbackComponent {node} {context} />
{/if}
