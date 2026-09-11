import type { SolidRenderableNode, SolidRenderContext } from './node-helpers'
import { clampPreviewHeight, estimateInfographicPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber } from './diagramHeight'
import { getHtmlTagFromContent, resolveCodeBlockLanguage, stripCustomHtmlWrapper } from './node-helpers'

export type CodeBlockMode = 'mermaid' | 'd2' | 'infographic' | 'pre' | 'code'

export function resolveNodeOutletCodeMode(node: SolidRenderableNode, context?: SolidRenderContext): CodeBlockMode {
  if (context?.renderCodeBlocksAsPre)
    return 'pre'
  const language = resolveCodeBlockLanguage(node)
  if (language === 'd2' || language === 'd2lang')
    return 'd2'
  if (language === 'infographic')
    return 'infographic'
  if (language === 'mermaid')
    return 'mermaid'
  return 'code'
}

export function resolveHtmlTag(node: SolidRenderableNode) {
  return String((node as any)?.tag || '').trim().toLowerCase() || getHtmlTagFromContent((node as any)?.content)
}

export function coerceCustomHtmlNode(node: SolidRenderableNode) {
  const tag = resolveHtmlTag(node)
  return tag ? { ...(node as any), type: tag, tag, content: stripCustomHtmlWrapper((node as any)?.content, tag) } as SolidRenderableNode : node
}

export function coerceBuiltinHtmlNode(node: SolidRenderableNode, type: string) {
  const tag = resolveHtmlTag(node)
  return tag ? { ...(node as any), type, tag } as SolidRenderableNode : node
}

export function resolveNodeOutletCustomInputs(node: SolidRenderableNode, context?: SolidRenderContext) {
  if (String((node as any)?.type || '') !== 'code_block')
    return null
  const mode = resolveNodeOutletCodeMode(node, context)
  const code = String((node as any)?.code ?? '')
  const estimatedHeight = mode === 'mermaid' ? estimateMermaidPreviewHeight(code) : mode === 'infographic' ? estimateInfographicPreviewHeight(code) : null
  if (estimatedHeight == null)
    return mode === 'd2' ? context?.d2Props ?? null : context?.codeBlockProps ?? null
  const props = mode === 'mermaid' ? context?.mermaidProps : context?.infographicProps
  const next = { ...(props || {}) }
  if (parsePositiveNumber(next.estimatedPreviewHeightPx) == null)
    next.estimatedPreviewHeightPx = clampPreviewHeight(estimatedHeight, undefined, next.maxHeight === 'none' ? null : parsePositiveNumber(next.maxHeight) ?? undefined)
  return next
}

export function resolveNodeOutletCustomComponent(node: SolidRenderableNode, context?: SolidRenderContext, mapping = context?.customComponents) {
  const type = String((node as any)?.type || '')
  if (type === 'code_block') {
    const language = resolveCodeBlockLanguage(node)
    if (language && mapping?.[language])
      return mapping[language]
    const mode = resolveNodeOutletCodeMode(node, context)
    if (mode === 'mermaid' && mapping?.mermaid)
      return mapping.mermaid
    if (mode === 'd2' && mapping?.d2)
      return mapping.d2
    if (mode === 'infographic' && mapping?.infographic)
      return mapping.infographic
    if (mapping?.code_block)
      return mapping.code_block
  }
  return mapping?.[type] || mapping?.[resolveHtmlTag(node)] || null
}
