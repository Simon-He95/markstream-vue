import type { ParsedNode, TextNode } from '../../types'
import type { ParseContext } from '../parse-context'

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
  titleClosed?: boolean
}

const URL_MARKUP = new Set(['autolink', 'linkify'])

function textNode(content: string): TextNode {
  return { type: 'text', content, raw: content } as TextNode
}

/**
 * The source's title, with a closing quote only when the source had one: a title
 * that was still streaming in must not gain a quote it never had.
 *
 * The folded link token records the quote (`titleClosed`). `raw` is only a
 * fallback: a fragment parse — a container child or an emphasis child — does not
 * receive the inline source, so it cannot answer this question.
 */
function titleSuffix(title: unknown, raw: string | undefined, titleClosed?: boolean) {
  const value = title == null ? '' : String(title)
  if (!value)
    return ''
  const quoted = ` "${value}"`
  if (typeof titleClosed === 'boolean')
    return titleClosed ? quoted : ` "${value}`
  return raw?.includes(quoted) ? quoted : ` "${value}`
}

/**
 * Rebuilds the source of a folded link token. The token can already contain the
 * source's closing paren (linkify folds it into the href), so prefer the shape
 * the inline source actually had.
 */
function loadingLinkSource(node: LoadingNode, raw: string | undefined) {
  const base = `[${String(node.text ?? '')}](${String(node.href ?? '')}${titleSuffix(node.title, raw, node.titleClosed)}`
  return raw?.endsWith(`${base})`) ? `${base})` : base
}

/**
 * A link that only wraps a complete URL can stay a link: its label is the URL
 * itself, so clearing `loading` cannot misrepresent where it leads.
 *
 * `markup` alone is not proof of that. The recovery also stamps `autolink` on a
 * folded `[label](` tail and appends the trailing text to the href; there the
 * label comes from the source and can disagree with the destination. Keeping
 * such a node clickable would let a trusted-looking label point at another
 * origin, so the label has to be empty or identical to the destination — which
 * is what markdown-it and linkify produce for a real URL.
 */
function keepUrlLink(node: LoadingNode): ParsedNode[] | null {
  const href = String(node.href ?? '')
  const text = String(node.text ?? '')
  if (!URL_MARKUP.has(String(node.markup ?? '')) || !href || /\s/.test(href) || node.title)
    return null
  if (text && text !== href)
    return null

  const label = text || href
  const children = Array.isArray(node.children) && node.children.length
    ? node.children
    : [textNode(label)]
  const kept = { ...node, children, loading: false, text: label } as LoadingNode
  // The flag is a fold-time hint for rebuilding a placeholder, not part of the
  // node shape a final parse hands to consumers.
  delete kept.titleClosed
  return [kept as ParsedNode]
}

/**
 * Source text for an image that is still loading at `final`. A target that
 * markdown-it accepts but the link validator rejects keeps `src: ''`; there is
 * nothing to load, and markdown-it renders such an image as its source, which
 * `raw` already holds (it can also carry a trailing text that got swallowed).
 */
function loadingImageSource(node: LoadingNode) {
  const raw = typeof node.raw === 'string' ? node.raw : ''
  const src = String(node.src ?? '')
  if (!src && raw.startsWith('!['))
    return raw
  return `![${String(node.alt ?? '')}](${src})`
}

function replaceLoadingNode(node: LoadingNode, raw: string | undefined): ParsedNode[] | null {
  if (!node.loading)
    return null

  if (node.type === 'image')
    return [textNode(loadingImageSource(node))]

  if (node.type === 'link') {
    const urlLink = keepUrlLink(node)
    if (urlLink)
      return urlLink
    const children = Array.isArray(node.children) ? node.children : []
    if (children.some(child => child?.type !== 'text')) {
      // LinkNode renders only `text` while loading, so the children (for
      // example a real image) are invisible today. Keep them and rebuild the
      // surrounding syntax instead of flattening the whole link away.
      return [
        textNode('['),
        ...children,
        textNode(`](${String(node.href ?? '')}${titleSuffix(node.title, raw, node.titleClosed)}`),
      ]
    }
    return [textNode(loadingLinkSource(node, raw))]
  }

  return null
}

/**
 * A `[` in front of this node is already in the source when the text before it
 * has one that nothing closed yet; adding another would double it.
 */
function hasOpenBracket(out: ParsedNode[]) {
  const previous = out[out.length - 1]
  if (previous?.type !== 'text')
    return false
  const content = String(previous.content ?? '')
  return content.lastIndexOf('[') > content.lastIndexOf(']')
}

function unwrap(list: ParsedNode[], raw: string | undefined): ParsedNode[] {
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
      const next = unwrap(children, raw)
      if (next !== children) {
        changed = true
        node = { ...node, children: next } as LoadingNode
      }
    }

    const replaced = replaceLoadingNode(node, raw)
    if (replaced) {
      changed = true
      let first = true
      for (const replacement of replaced) {
        if (replacement.type === 'text') {
          const content = String((replacement as TextNode).content ?? '')
          if (first && content === '[' && hasOpenBracket(out)) {
            first = false
            continue
          }
          pushText(replacement as TextNode)
        }
        else {
          out.push(replacement)
        }
        first = false
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
 * resolves. Links are rebuilt as their markdown source, except a link that only
 * wraps a complete URL; images become their source when there is no src to load.
 */
export function unwrapFinalLoadingNodes(nodes: ParsedNode[], options: ParseContext, raw?: string): ParsedNode[] {
  if (options.final !== true)
    return nodes
  return unwrap(nodes, raw)
}
