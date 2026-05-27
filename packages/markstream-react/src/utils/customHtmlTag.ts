import type { ParsedNode } from 'stream-markdown-parser'
import type { CustomComponentDisplayMode, CustomComponentMap, MarkstreamCustomComponent } from '../customComponents'
import { getHtmlTagFromContent } from 'stream-markdown-parser'
import { getCustomComponentDisplay } from '../customComponents'

export interface ResolvedCustomHtmlTag {
  tag: string
  isWhitelisted: boolean
  component: MarkstreamCustomComponent | null
  display: CustomComponentDisplayMode | undefined
}

export function resolveCustomHtmlTag(
  node: Pick<ParsedNode, 'type'> & { tag?: string | null, content?: unknown },
  customComponents: CustomComponentMap,
  customHtmlTags?: readonly string[],
): ResolvedCustomHtmlTag | null {
  const normalizedType = String(node.type ?? '').trim().toLowerCase()
  const normalizedTags = (customHtmlTags ?? []).map(tag => tag.toLowerCase())
  const taggedNode = normalizedType === 'html_inline' || normalizedType === 'html_block'

  if (!taggedNode && !normalizedTags.includes(normalizedType))
    return null

  const tag = taggedNode
    ? (String(node.tag ?? '').trim().toLowerCase() || getHtmlTagFromContent(node.content))
    : (String(node.tag ?? '').trim().toLowerCase() || normalizedType)
  if (!tag)
    return null

  const isWhitelisted = normalizedTags.includes(tag)
  const component = isWhitelisted ? (customComponents[tag] ?? customComponents[normalizedType] ?? null) : null

  return {
    tag,
    isWhitelisted,
    component,
    display: getCustomComponentDisplay(component),
  }
}

export function isParagraphBreakingCustomHtmlNode(
  node: Pick<ParsedNode, 'type'> & { tag?: string | null, content?: unknown },
  customComponents: CustomComponentMap,
  customHtmlTags?: readonly string[],
) {
  return resolveCustomHtmlTag(node, customComponents, customHtmlTags)?.display === 'block'
}
