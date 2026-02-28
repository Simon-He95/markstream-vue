import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

function walk(value: unknown, visit: (node: any) => void, seen = new WeakSet<object>()) {
  if (!value || typeof value !== 'object')
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
    walk(child, visit, seen)
}

describe('math inline should not break inline code spans', () => {
  const md = getMarkdown('math-inline-code-span-regression')
  const input = '`$...$`， `\\(...\\)`'

  it('keeps markdown-it inline tokens as code_inline', () => {
    const tokens = md.parse(input, {})
    const inline = tokens.find((t: any) => t.type === 'inline')
    const children = (inline?.children ?? []) as any[]

    const mathChildren = children.filter(c => c.type === 'math_inline')
    const codeChildren = children.filter(c => c.type === 'code_inline')

    expect(mathChildren).toHaveLength(0)
    expect(codeChildren).toHaveLength(2)
    expect(codeChildren[0].content).toBe('$...$')
    expect(codeChildren[1].content).toBe('\\(...\\)')
  })

  it('keeps structured nodes as inline_code and preserves backslashes', () => {
    const nodes = parseMarkdownToStructure(input, md)
    const codes: string[] = []
    let mathCount = 0

    walk(nodes, (node) => {
      if (node.type === 'inline_code')
        codes.push(String(node.code ?? ''))
      if (node.type === 'math_inline')
        mathCount++
    })

    expect(mathCount).toBe(0)
    expect(codes).toEqual(['$...$', '\\(...\\)'])
  })
})
