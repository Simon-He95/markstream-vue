import type { MarkdownIt } from '../../markdown-it-types'
import type { ParsedNode, TextNode } from '../../types'
import type { ParseContext } from '../parse-context'
import { isDeadInlineTarget } from './inline-target'

type LoadingNode = ParsedNode & {
  alt?: unknown
  children?: ParsedNode[]
  href?: string
  loading?: boolean
  markup?: string
  raw?: string
  src?: string
  text?: string
  title?: unknown
}

function textNode(content: string): TextNode {
  return { type: 'text', content, raw: content } as TextNode
}

function titleSuffix(title: unknown) {
  const value = title == null ? '' : String(title)
  return value ? ` "${value}"` : ''
}

/**
 * Rebuilds the source of a folded link token. The token can already contain the
 * source's closing paren (linkify folds it into the href), so prefer the shape
 * the inline source actually had.
 */
function loadingLinkSource(node: LoadingNode, raw: string | undefined) {
  const base = `[${String(node.text ?? '')}](${String(node.href ?? '')}${titleSuffix(node.title)}`
  return raw?.endsWith(`${base})`) ? `${base})` : base
}

function isDeadTargetIn(source: string, md: MarkdownIt | undefined) {
  const openParen = source.indexOf('](')
  if (openParen === -1)
    return true
  return isDeadInlineTarget(md, source, openParen + 1, source.length, true)
}

/**
 * Source text for an image that is still loading at `final`, or `null` when the
 * image must be kept: a target that markdown-it accepts but a link validator
 * rejected is a real image, not a half-typed one.
 */
function loadingImageSource(node: LoadingNode, md: MarkdownIt | undefined) {
  const raw = typeof node.raw === 'string' ? node.raw : ''
  const src = String(node.src ?? '')
  const hasImageSyntax = raw.startsWith('![')
  if (hasImageSyntax && !src && !isDeadTargetIn(raw, md))
    return null
  if (hasImageSyntax)
    return raw
  return `![${String(node.alt ?? '')}](${src})`
}

function replaceLoadingNode(node: LoadingNode, md: MarkdownIt | undefined, raw: string | undefined): ParsedNode[] | null {
  if (!node.loading)
    return null

  if (node.type === 'image') {
    const source = loadingImageSource(node, md)
    return source == null ? null : [textNode(source)]
  }

  if (node.type === 'link') {
    // `<url>` delimits its own destination, so an autolink is never unfinished:
    // its label is the href by definition. A container parse can still hand it
    // over marked as loading with the label lost, and rewriting that to source
    // text would mangle a valid link; keep the link and supply the implied label.
    if (node.markup === 'autolink' && node.href) {
      const href = String(node.href)
      const label = String(node.text ?? '') || href
      const autolinkChildren = Array.isArray(node.children) && node.children.length
        ? node.children
        : [textNode(label)]
      return [{ ...node, children: autolinkChildren, loading: false, text: label } as ParsedNode]
    }
    const children = Array.isArray(node.children) ? node.children : []
    if (children.some(child => child?.type !== 'text')) {
      // LinkNode renders only `text` while loading, so the children (for
      // example a real image) are invisible today. Keep them and rebuild the
      // surrounding syntax instead of flattening the whole link away.
      return [
        textNode('['),
        ...children,
        textNode(`](${String(node.href ?? '')}${titleSuffix(node.title)}`),
      ]
    }
    return [textNode(loadingLinkSource(node, raw))]
  }

  return null
}

function unwrap(list: ParsedNode[], md: MarkdownIt | undefined, raw: string | undefined): ParsedNode[] {
  let changed = false
  const out: ParsedNode[] = []
  const pushText = (node: TextNode) => {
    const previous = out[out.length - 1]
    if (previous?.type === 'text') {
      // Replace rather than mutate: these node objects can be reused across
      // parses, and mutating one would append its own content again.
      out[out.length - 1] = textNode(`${previous.content}${node.content}`)
      return
    }
    out.push(node)
  }

  for (const original of list) {
    let node = original as LoadingNode
    const children = node.children
    if (Array.isArray(children) && children.length) {
      const next = unwrap(children, md, raw)
      if (next !== children) {
        changed = true
        node = { ...node, children: next } as LoadingNode
      }
    }

    const replaced = replaceLoadingNode(node, md, raw)
    if (replaced) {
      changed = true
      for (const replacement of replaced) {
        if (replacement.type === 'text')
          pushText(replacement as TextNode)
        else
          out.push(replacement)
      }
      continue
    }

    if (node.type === 'text') {
      pushText(node as TextNode)
      continue
    }
    out.push(node)
  }

  return changed ? out : list
}

/**
 * A final parse has nothing left to arrive, so no node may stay `loading`: image
 * and link placeholders exist for a stream that is still growing, and any that
 * survive the last chunk would show a spinner (or an empty shimmer) that never
 * resolves. Links are rebuilt as their markdown source; images only when they
 * are recovery artifacts — a target that markdown-it accepts but a link
 * validator rejects stays a real image.
 */
export function unwrapFinalLoadingNodes(nodes: ParsedNode[], options: ParseContext, raw?: string): ParsedNode[] {
  if (options.final !== true)
    return nodes
  return unwrap(nodes, options.markdownIt, raw)
}
