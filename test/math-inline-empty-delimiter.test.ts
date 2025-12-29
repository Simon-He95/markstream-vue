import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

function walk(value: unknown, visit: (node: any) => void, seen = new WeakSet<object>()) {
  if (!value)
    return
  if (typeof value !== 'object')
    return
  if (seen.has(value))
    return
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value)
      walk(item, visit, seen)
    return
  }

  const node = value as any
  if (typeof node.type === 'string')
    visit(node)

  for (const child of Object.values(node))
    walk(child as any, visit, seen)
}

function countNodes(nodes: unknown, type: string) {
  let count = 0
  walk(nodes, (node) => {
    if (node.type === type)
      count++
  })
  return count
}

describe('math inline - ignore empty "$$" delimiter', () => {
  const md = getMarkdown('math-empty-delim')

  it('keeps "$$" as text to avoid perpetual loading spinners', () => {
    const input = 'adasd $$ dasdsa\ndasdsad'
    const nodes = parseMarkdownToStructure(input, md)
    expect(countNodes(nodes, 'math_inline')).toBe(0)
    expect(JSON.stringify(nodes)).toContain('$$')
  })
})
