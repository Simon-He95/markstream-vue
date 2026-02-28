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

function collectByType(nodes: unknown, type: string) {
  const out: any[] = []
  walk(nodes, (node) => {
    if (node.type === type)
      out.push(node)
  })
  return out
}

describe('math inline - currency dollars should not be parsed as math', () => {
  const md = getMarkdown('math-currency-dollar-regression')
  const input = `**$2000~$5000美元**

等价于 $...$，但更推荐在现代 LaTeX 编译器中使用 \`$...$\` 与 \`\\(...\\)\` 以提高可读性和安全性。`

  it('keeps currency and placeholder dollars as text; only backticked variants are code', () => {
    const nodes = parseMarkdownToStructure(input, md, { final: true })

    const paragraphs = nodes.filter((n: any) => n?.type === 'paragraph') as any[]
    expect(paragraphs.length).toBeGreaterThanOrEqual(2)

    const strong = (paragraphs[0]?.children ?? []).find((c: any) => c?.type === 'strong')
    expect(strong).toBeDefined()
    expect(JSON.stringify(strong)).toContain('$2000~$5000美元')
    expect(collectByType(strong, 'math_inline')).toHaveLength(0)

    const p2Math = collectByType(paragraphs[1], 'math_inline')
    expect(p2Math).toHaveLength(0)

    const p2Text = JSON.stringify(collectByType(paragraphs[1], 'text'))
    expect(p2Text.includes('$...$') || p2Text.includes('$…$')).toBe(true)

    const p2Codes = collectByType(paragraphs[1], 'inline_code')
    expect(p2Codes).toHaveLength(2)
    expect(String(p2Codes[0]?.code ?? '')).toBe('$...$')
    const code2 = String(p2Codes[1]?.code ?? '')
    expect(code2.startsWith('\\(')).toBe(true)
    expect(code2.endsWith('\\)')).toBe(true)
  })
})
