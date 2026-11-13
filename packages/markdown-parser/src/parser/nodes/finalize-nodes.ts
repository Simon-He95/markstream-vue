import type { ParsedNode, ParseOptions } from '../../types'

export function finalizeHtmlBlockLoading(nodes: ParsedNode[]) {
  const seen = new WeakSet<object>()
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object')
      return
    if (seen.has(value as object))
      return
    seen.add(value as object)

    if (Array.isArray(value)) {
      for (const item of value)
        visit(item)
      return
    }

    const node = value as Record<string, unknown>
    if (node.type === 'html_block' && node.loading === true)
      node.loading = false

    for (const key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key))
        continue
      const child = node[key]
      if (child && typeof child === 'object')
        visit(child)
    }
  }

  visit(nodes)
}

export function applyPostTransformNodes<T extends ParsedNode[]>(nodes: T, options: ParseOptions): T | ParsedNode[] {
  const transform = options.postTransformNodes
  if (typeof transform !== 'function')
    return nodes

  const transformed = transform(nodes)
  return Array.isArray(transformed) ? transformed : nodes
}
