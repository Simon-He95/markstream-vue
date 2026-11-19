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
 * The URL `value` names, with the scheme defaulted, or `null` when it names
 * none. `URL` applies the same normalization a browser does — lowercases the
 * scheme and host, drops a default port, and IDNA-encodes a non-ASCII host — so
 * two strings that spell one URL compare equal while a label that spells a
 * different host never does.
 */
function urlShape(value: string) {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `http://${value}`)
    if (url.protocol === 'mailto:')
      return `mailto:${url.pathname}`
    return `${url.username}:${url.password}@${url.host}${url.pathname}${url.search}${url.hash}`
  }
  catch {
    return null
  }
}

/**
 * Whether `text` is the source spelling of `href`. Linkify writes the URL the
 * source had into the label and the normalized one into the href: a bare domain
 * gains `http://`, an address gains `mailto:`, and a non-ASCII host is punycode
 * in the href. Those differences describe the same URL, so keeping the link
 * cannot point the label at another origin.
 */
function isUrlSpelling(text: string, href: string) {
  if (text === href)
    return true
  // A control character in the label means a malformed punycode host was
  // decoded into unprintable text; never make that clickable.
  if (/\p{Cc}/u.test(text))
    return false
  if (href === `http://${text}` || href === `mailto:${text}`)
    return true
  // A non-ASCII label and a punycode href only describe one URL when the label's
  // own host encodes to the href's host; `例子.com` ↔ `xn--fsqu00a.com` passes,
  // `登录` → `xn--evil.com` does not.
  const label = urlShape(text)
  return label !== null && label === urlShape(href)
}

/**
 * A link that only wraps a complete URL can stay a link: its label is the URL
 * itself, so clearing `loading` cannot misrepresent where it leads.
 *
 * `markup` alone is not proof of that. The recovery also stamps `autolink` on a
 * folded `[label](` tail and appends the trailing text to the href; there the
 * label comes from the source and can disagree with the destination. Keeping
 * such a node clickable would let a trusted-looking label point at another
 * origin, so the label has to be empty or spell the destination itself, which is
 * what markdown-it and linkify produce for a real URL. Rebuilding the markdown
 * source instead (`[www.e.com](http://www.e.com`) would print the URL twice and
 * leak the brackets, which is not what markdown-it renders either.
 */
function keepUrlLink(node: LoadingNode): ParsedNode[] | null {
  const href = String(node.href ?? '')
  const text = String(node.text ?? '')
  if (!URL_MARKUP.has(String(node.markup ?? '')) || !href || /\s/.test(href) || node.title)
    return null
  if (text && !isUrlSpelling(text, href))
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

function unwrap(list: ParsedNode[], raw: string | undefined): ParsedNode[] {
  let changed = false
  const out: ParsedNode[] = []
  // Adjacent text is concatenated once, when the run ends. Replacing the
  // previous node on every append recopies the whole accumulated string, which
  // is quadratic for a paragraph that holds many recovered placeholders.
  let pendingNodes: TextNode[] = []
  let pendingContents: string[] = []
  let pendingLength = 0
  let lastOpenBracket = -1
  let lastCloseBracket = -1

  const flushText = () => {
    if (!pendingNodes.length)
      return
    // A lone node keeps its identity; a merged run becomes one fresh node, the
    // same shape the previous merge produced. Never mutate: these node objects
    // can be reused across parses, and mutating one appends its content again.
    out.push(pendingNodes.length === 1 ? pendingNodes[0]! : textNode(pendingContents.join('')))
    pendingNodes = []
    pendingContents = []
    pendingLength = 0
    lastOpenBracket = -1
    lastCloseBracket = -1
  }

  const appendText = (node: TextNode) => {
    const content = String(node.content ?? '')
    const open = content.lastIndexOf('[')
    if (open !== -1)
      lastOpenBracket = pendingLength + open
    const close = content.lastIndexOf(']')
    if (close !== -1)
      lastCloseBracket = pendingLength + close
    pendingNodes.push(node)
    pendingContents.push(content)
    pendingLength += content.length
  }

  /**
   * A `[` in front of this node is already in the source when the text before it
   * has one that nothing closed yet; adding another would double it.
   */
  const hasOpenBracket = () => pendingLength > 0 && lastOpenBracket > lastCloseBracket

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
          if (first && content === '[' && hasOpenBracket()) {
            first = false
            continue
          }
          appendText(replacement as TextNode)
        }
        else {
          flushText()
          out.push(replacement)
        }
        first = false
      }
      continue
    }

    if (node.type === 'text') {
      appendText(node as TextNode)
      continue
    }
    flushText()
    out.push(node)
  }

  flushText()
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
