import type { SolidRenderableNode, SolidRenderContext } from './node-helpers'
import { renderMarkdownNodesToHtml, renderMarkdownNodeToHtml } from './renderMarkdownHtml'

export function renderNodeHtml(node: SolidRenderableNode | null | undefined, context?: SolidRenderContext) {
  return renderMarkdownNodeToHtml(node as any, {
    cacheKey: context?.customId ? `markstream-solid-${context.customId}` : 'markstream-solid-node',
    customHtmlTags: context?.customHtmlTags,
    allowHtml: context?.allowHtml !== false,
    htmlPolicy: context?.htmlPolicy ?? 'safe',
  })
}

export function renderNodesHtml(nodes: readonly SolidRenderableNode[] | null | undefined, context?: SolidRenderContext) {
  return renderMarkdownNodesToHtml(nodes as any, {
    cacheKey: context?.customId ? `markstream-solid-${context.customId}` : 'markstream-solid-node',
    customHtmlTags: context?.customHtmlTags,
    allowHtml: context?.allowHtml !== false,
    htmlPolicy: context?.htmlPolicy ?? 'safe',
  })
}
