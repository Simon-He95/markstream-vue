import { describe, expect, it } from 'vitest'
import { collect } from '../../../test/utils/midstate-utils'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import { applyMath } from '../src/plugins/math'

const cases = [
  'United - **$312** nonstop, Alaska - **$289** with a stop.',
  'The October range is **$130–$375**, so you are above the market.',
  'The Alaska round trip is roughly $210 + $98 = $308. Cheaper than $460.',
  'A $10,000 deposit at 4%: $A = P(1 + r)^t$ grows to about $12,209.',
]

describe.each([false, true])('issue #793 currency pairs (strict=%s)', (strictDelimiters) => {
  function createMarkdown() {
    const md = getMarkdown('issue-793', { enableMath: false })
    applyMath(md, { strictDelimiters })
    return md
  }

  it.each(cases)('preserves final text, formatting, and real math: %s', (markdown) => {
    const md = createMarkdown()
    const nodes = parseMarkdownToStructure(markdown, md, { final: true })
    const math = collect(nodes, 'math_inline')
    expect(math.map(node => node.content)).toEqual(markdown === cases[3] ? ['A = P(1 + r)^t'] : [])
    const strong = collect(nodes, 'strong')
    expect(strong.map(node => collect([node], 'text').map(text => text.content).join('')))
      .toEqual(markdown === cases[0] ? ['$312', '$289'] : markdown === cases[1] ? ['$130–$375'] : [])
    expect(collect(nodes, 'text').map(node => node.content).join(''))
      .toBe(markdown.replace(/\*\*/g, '').replace('$A = P(1 + r)^t$', ''))
  })

  it.each(cases)('does not turn currency into math at any streamed prefix: %s', (markdown) => {
    const md = createMarkdown()
    const coldMd = createMarkdown()
    for (let end = 1; end <= markdown.length; end++) {
      const prefix = markdown.slice(0, end)
      const nodes = parseMarkdownToStructure(prefix, md, { final: false, streamParse: true, reuseStableTopLevelNodes: true })
      expect(nodes, prefix).toEqual(parseMarkdownToStructure(prefix, coldMd, { final: false, streamParse: false }))
      const math = collect(nodes, 'math_inline')
      expect(math.every(node => 'A = P(1 + r)^t'.startsWith(node.content)), prefix).toBe(true)
      if (markdown !== cases[3])
        expect(math, prefix).toHaveLength(0)
      if (prefix.includes('$A = P(1 + r)^t$'))
        expect(math, prefix).toMatchObject([{ content: 'A = P(1 + r)^t', loading: false }])
    }
    expect(parseMarkdownToStructure(markdown, md, { final: true, streamParse: true }))
      .toEqual(parseMarkdownToStructure(markdown, coldMd, { final: true, streamParse: false }))
  })

  it.each(['$H$', '$1$', '$2 + 3 = 5$', '$1,000 + x$', '$1-2$', '$2x$', '$5\\%$', '$CO_2$'])('keeps explicit math working: %s', (markdown) => {
    const nodes = parseMarkdownToStructure(markdown, createMarkdown(), { final: true })
    expect(collect(nodes, 'math_inline')).toMatchObject([{ content: markdown.slice(1, -1), loading: false }])
  })

  it.each([
    'Prices $312 and $289; $$x^2$$ then $H$.',
    'Prices **$312** and **$289**; $$x^2$$ then $H$.',
    'Before $$x^2$$ then prices $312 and $289; $H$.',
  ])('handles currency alongside other delimiters: %s', (markdown) => {
    const nodes = parseMarkdownToStructure(markdown, createMarkdown(), { final: true })
    expect(collect(nodes, 'math_inline').map(node => node.content)).toEqual(['x^2', 'H'])
    expect(collect(nodes, 'text').map(node => node.content).join('')).toContain('$312')
    expect(collect(nodes, 'text').map(node => node.content).join('')).toContain('$289')
  })

  it('keeps explicit paren math after currency', () => {
    const nodes = parseMarkdownToStructure('Prices $312 and $289; \\(x^2\\).', createMarkdown(), { final: true })
    expect(collect(nodes, 'math_inline')).toMatchObject([{ content: 'x^2', markup: '\\(\\)' }])
    expect(collect(nodes, 'text').map(node => node.content).join('')).toContain('$289')
  })

  it('preserves escaped dollars and code spans alongside prices and math', () => {
    const nodes = parseMarkdownToStructure('Escaped \\$5, code `$312 and $289`, prices $210 + $98; real $x^2$.', createMarkdown(), { final: true })
    expect(collect(nodes, 'math_inline')).toMatchObject([{ content: 'x^2', loading: false }])
    expect(collect(nodes, 'inline_code')).toMatchObject([{ code: '$312 and $289' }])
    const text = collect(nodes, 'text').map(node => node.content).join('')
    expect(text).toContain('$5, code ')
    expect(text).toContain('prices $210 + $98; real .')
  })
})
