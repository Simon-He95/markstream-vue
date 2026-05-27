import type { SvelteRenderableNode, SvelteRenderContext } from './node-helpers'
import { renderMarkdownNodesToHtml, renderMarkdownNodeToHtml } from '../../renderMarkdownHtml'

export function renderNodeHtml(node: SvelteRenderableNode | null | undefined, context?: SvelteRenderContext) {
  return renderMarkdownNodeToHtml(node as any, {
    cacheKey: context?.customId ? `markstream-svelte-${context.customId}` : 'markstream-svelte-node',
    customHtmlTags: context?.customHtmlTags,
    allowHtml: context?.allowHtml !== false,
    htmlPolicy: context?.htmlPolicy ?? 'safe',
  })
}

export function renderNodesHtml(nodes: readonly SvelteRenderableNode[] | null | undefined, context?: SvelteRenderContext) {
  return renderMarkdownNodesToHtml(nodes as any, {
    cacheKey: context?.customId ? `markstream-svelte-${context.customId}` : 'markstream-svelte-node',
    customHtmlTags: context?.customHtmlTags,
    allowHtml: context?.allowHtml !== false,
    htmlPolicy: context?.htmlPolicy ?? 'safe',
  })
}
