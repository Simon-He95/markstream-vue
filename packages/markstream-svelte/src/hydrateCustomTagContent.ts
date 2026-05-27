import type { BaseNode } from 'stream-markdown-parser'
import { normalizeCustomHtmlTags, normalizeCustomHtmlTagName as normalizeTagName } from 'stream-markdown-parser'

interface CustomTagSegment {
  tag: string
  start: number
  end: number
  innerContent: string
  raw: string
  loading: boolean
}

interface CustomTagOpen {
  tag: string
  start: number
  openEnd: number
}

type HydratableNode = BaseNode & {
  tag?: string
  content?: string
  [key: string]: unknown
}

const TAG_TOKEN_RE = /<\/?([A-Z][\w:-]*)(?:\s[^<>]*)?>/gi

export function hydrateCustomTagContent<T extends BaseNode>(
  nodes: readonly T[] | null | undefined,
  source: string,
  customHtmlTags?: readonly string[],
): T[] {
  const normalizedTags = normalizeCustomHtmlTags(customHtmlTags)
  const tagSet = new Set(normalizedTags)
  if (!source || tagSet.size === 0 || !Array.isArray(nodes) || nodes.length === 0)
    return Array.isArray(nodes) ? nodes.slice() : []

  const segments = collectCustomTagSegments(source, tagSet)
  if (segments.length === 0)
    return nodes.slice()

  let segmentIndex = 0
  const cloned = nodes.map(node => cloneNodeTree(node))

  const visitNode = (node: HydratableNode) => {
    if (!node || typeof node !== 'object')
      return

    const tag = resolveCustomTagName(node, tagSet)
    if (tag) {
      const segment = consumeNextSegment(segments, tag, () => segmentIndex, nextIndex => (segmentIndex = nextIndex))
      if (segment) {
        node.tag = tag
        node.type = tag
        node.content = segment.innerContent
        node.raw = segment.raw
        if (typeof node.loading !== 'boolean')
          node.loading = segment.loading
      }
    }

    for (const value of Object.values(node)) {
      if (!Array.isArray(value))
        continue
      for (const child of value) {
        if (child && typeof child === 'object')
          visitNode(child as HydratableNode)
      }
    }
  }

  for (const node of cloned)
    visitNode(node)

  return cloned
}

function collectCustomTagSegments(source: string, tagSet: Set<string>) {
  const stack: CustomTagOpen[] = []
  const segments: CustomTagSegment[] = []
  let match: RegExpExecArray | null

  TAG_TOKEN_RE.lastIndex = 0
  while ((match = TAG_TOKEN_RE.exec(source)) !== null) {
    const raw = match[0]
    const tag = normalizeTagName(match[1])
    if (!tag || !tagSet.has(tag))
      continue

    const isClosing = raw.startsWith('</')
    if (!isClosing) {
      stack.push({
        tag,
        start: match.index,
        openEnd: TAG_TOKEN_RE.lastIndex,
      })
      continue
    }

    const openIndex = findLastOpenIndex(stack, tag)
    if (openIndex < 0)
      continue

    const [open] = stack.splice(openIndex, 1)
    const closeStart = match.index
    const closeEnd = TAG_TOKEN_RE.lastIndex
    segments.push({
      tag,
      start: open.start,
      end: closeEnd,
      innerContent: source.slice(open.openEnd, closeStart),
      raw: source.slice(open.start, closeEnd),
      loading: false,
    })
  }

  for (const open of stack) {
    segments.push({
      tag: open.tag,
      start: open.start,
      end: source.length,
      innerContent: source.slice(open.openEnd),
      raw: source.slice(open.start),
      loading: true,
    })
  }

  return segments.sort((left, right) => {
    if (left.start !== right.start)
      return left.start - right.start
    return right.end - left.end
  })
}

function findLastOpenIndex(stack: CustomTagOpen[], tag: string) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]?.tag === tag)
      return index
  }
  return -1
}

function consumeNextSegment(
  segments: CustomTagSegment[],
  tag: string,
  getIndex: () => number,
  setIndex: (value: number) => void,
) {
  let index = getIndex()
  while (index < segments.length) {
    const segment = segments[index]
    index += 1
    if (segment.tag !== tag)
      continue
    setIndex(index)
    return segment
  }
  setIndex(index)
  return null
}

function resolveCustomTagName(node: Record<string, unknown>, tagSet: Set<string>) {
  const byTag = normalizeTagName(node.tag)
  if (byTag && tagSet.has(byTag))
    return byTag

  const byType = normalizeTagName(node.type)
  return byType && tagSet.has(byType) ? byType : ''
}

function cloneNodeTree<T extends BaseNode>(node: T): T {
  if (!node || typeof node !== 'object')
    return node

  const cloned = Array.isArray(node)
    ? node.map(item => cloneNodeTree(item)) as unknown as T
    : { ...node }

  if (!Array.isArray(cloned)) {
    for (const [key, value] of Object.entries(cloned as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        (cloned as Record<string, unknown>)[key] = value.map(item => cloneNodeTree(item as BaseNode))
      }
    }
  }

  return cloned
}
