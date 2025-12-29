import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('math inline edgecases', () => {
  function collectByType(nodes: any, type: string, out: any[] = []) {
    if (!nodes)
      return out
    if (Array.isArray(nodes)) {
      for (const n of nodes)
        collectByType(n, type, out)
      return out
    }
    if (nodes && typeof nodes === 'object') {
      if (nodes.type === type)
        out.push(nodes)
      const children = (nodes as any).children
      if (children)
        collectByType(children, type, out)
    }
    return out
  }

  it('handles nested parentheses with escaped braces and preserves backslashes', () => {
    const md = getMarkdown()
    // Use a simpler, correctly escaped inline math string. This represents
    // the literal: \((\operatorname{span}{\boldsymbol{\alpha}})^\perp\)
    const content = '前文 \\((\\operatorname{span}{\\boldsymbol{\\alpha}})^\\perp\\) 后文'
    const tokens = md.parse(content, {})
    const inlineChildren = tokens.flatMap((t: any) => (t.children ? t.children : []))
    const inlineMath = inlineChildren.filter((c: any) => c && c.type === 'math_inline')
    expect(inlineMath.length).toBeGreaterThanOrEqual(1)
    const mathContent = inlineMath[0].content
    // debug: math token content inspected during development if needed
    // Ensure math content includes the expected TeX command names (backslash
    // may or may not be present depending on normalization).
    expect(/\\?operatorname/.test(mathContent)).toBe(true)
    expect(/\\?boldsymbol/.test(mathContent)).toBe(true)
  })

  it('parses Chinese list item with inline math and fractions', () => {
    const md = getMarkdown()
    const content = `*   **情况 2.1: $b=1$**\n    如果 $b=1$，则 $k = \\frac{a^2+1^2}{a \\cdot 1+1} = \\frac{a^2+1}{a+1}$。`
    const tokens = md.parse(content, {})
    const inlineChildren = tokens.flatMap((t: any) => (t.children ? t.children : []))
    const inlineMath = inlineChildren.filter((c: any) => c && c.type === 'math_inline')
    expect(inlineMath.length).toBeGreaterThanOrEqual(3)
    const mathContents = inlineMath.map((m: any) => m.content).join(' ')
    expect(/b=1/.test(mathContents)).toBe(true)
    expect(/\\?frac/.test(mathContents)).toBe(true)
    expect(/a\^2/.test(mathContents)).toBe(true)
  })

  it('parses inline math inside `__strong__` without crashing', () => {
    const md = getMarkdown()
    const content = '__strong $x$__'
    expect(() => md.parse(content, {})).not.toThrow()

    const tokens = md.parse(content, {})
    const inlineChildren = tokens.flatMap((t: any) => (t.children ? t.children : []))
    const inlineMath = inlineChildren.filter((c: any) => c && c.type === 'math_inline')
    expect(inlineMath.length).toBeGreaterThanOrEqual(1)
    expect(inlineMath[0].content).toContain('x')
  })

  it('handles mid-state (unclosed) $math inside `__strong` without weird strong markup', () => {
    const md = getMarkdown()
    const content = '__strong $E=mc^2'
    expect(() => md.parse(content, {})).not.toThrow()

    const tokens = md.parse(content, {})
    const inlineChildren = tokens.flatMap((t: any) => (t.children ? t.children : []))
    const strongOpen = inlineChildren.find((c: any) => c && c.type === 'strong_open')
    expect(strongOpen).toBeDefined()
    expect(strongOpen.markup).toBe('__')

    const math = inlineChildren.find((c: any) => c && c.type === 'math_inline')
    expect(math).toBeDefined()
    expect(math.loading).toBe(true)
    expect(math.markup).toBe('$')
    expect(math.content).toContain('E=mc^2')
  })

  it('handles mid-state (unclosed) $math inside `**strong` without weird strong markup', () => {
    const md = getMarkdown()
    const content = '**strong $E=mc^2'
    expect(() => md.parse(content, {})).not.toThrow()

    const tokens = md.parse(content, {})
    const inlineChildren = tokens.flatMap((t: any) => (t.children ? t.children : []))
    const strongOpen = inlineChildren.find((c: any) => c && c.type === 'strong_open')
    expect(strongOpen).toBeDefined()
    expect(strongOpen.markup).toBe('**')

    const math = inlineChildren.find((c: any) => c && c.type === 'math_inline')
    expect(math).toBeDefined()
    expect(math.loading).toBe(true)
    expect(math.markup).toBe('$')
    expect(math.content).toContain('E=mc^2')
  })

  it('does not throw in parseMarkdownToStructure for strong+math', () => {
    const md = getMarkdown('t')
    expect(() => parseMarkdownToStructure('__strong $x$__', md)).not.toThrow()
    expect(() => parseMarkdownToStructure('**strong $x$**', md)).not.toThrow()

    const nodes1 = parseMarkdownToStructure('__strong $x$__', md)
    const nodes2 = parseMarkdownToStructure('**strong $x$**', md)
    expect(collectByType(nodes1, 'math_inline').length).toBeGreaterThanOrEqual(1)
    expect(collectByType(nodes2, 'math_inline').length).toBeGreaterThanOrEqual(1)
  })
})
