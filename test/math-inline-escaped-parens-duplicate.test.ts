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

function collectText(nodes: unknown) {
  const parts: string[] = []
  walk(nodes, (node) => {
    if (node.type === 'text' && typeof node.content === 'string')
      parts.push(node.content)
  })
  return parts.join('')
}

describe('math inline - avoid duplicated text around \\( \\)', () => {
  const md = getMarkdown('math-inline-escaped-parens-duplicate')

  it('does not duplicate the text span around an explicit \\( \\) pair', () => {
    const input = String.raw`计算\( (\complement_{\text{R}}P)\cap M \)
求两个集合的交集，即取同时属于\( [0,1] \)和\( \left( \frac{1}{2},+\infty \right) \)的部分，得\\( \left( \frac{1}{2},1 \right] \\)，对应选项A。`

    const nodes = parseMarkdownToStructure(input, md)
    const text = collectText(nodes)
    // `\( [0,1] \)` is math now (#859), so the prose around it must appear
    // exactly once instead of being repeated as a literal fallback.
    const needle = '求两个集合的交集，即取同时属于'
    expect(text.split(needle).length - 1).toBe(1)

    const maths: string[] = []
    walk(nodes, (node) => {
      if (node.type === 'math_inline')
        maths.push(String(node.content ?? ''))
    })
    expect(maths).toHaveLength(3)
    expect(maths).toContain(' [0,1] ')
  })
})
