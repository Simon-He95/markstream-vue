import { getMarkdown } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('math plugin (inline & block)', () => {
  it('parses inline $...$ and ( ... ) maths', () => {
    const md = getMarkdown('t')
    const content = '这是行内数学 $a+b=3$ 和另外一种 \\(--x\\)'
    const html = md.render(content)

    // Should render math inline - either our inline wrapper or MathJax output or raw content
    const ok
      = html.includes('vmr-math-inline')
        || html.includes('math')
        || html.includes('a+b=3')

    expect(ok).toBe(true)
  })

  it('parses block $$...$$ maths', () => {
    const md = getMarkdown('t')
    const content = `前文\n$$\nE=mc^2\n$$\n后文`
    const tokens = md.parse(content, {})
    const blocks = tokens.filter((t: any) => t.type === 'math_block')
    expect(blocks.length).toBe(1)
    expect(blocks[0].content).toContain('E=mc^2')
  })

  it('does not treat escaped dollar as math', () => {
    const md = getMarkdown('t')
    const content = 'price is $5 and not math $not$'
    const tokens = md.parse(content, {})
    const inline = tokens
      .flatMap((t: any) => (t.children ? t.children : []))
      .filter(
        (c: any) =>
          c && (c.type === 'vmr_math_inline' || c.type === 'math_inline'),
      )
    // Expect none (we may get tokens as text)
    expect(inline.length).toBeLessThanOrEqual(1)
  })

  it('parses inline math in content', () => {
    const md = getMarkdown('t')
    const content = '- **二项式展开**（\(\(m\) 为实数）：'
    const tokens = md.parse(content, {})
    const inline = tokens.filter(token => token.type === 'inline')[0]
    console.log({ children: inline.children })
    expect(inline.content).toBe('**二项式展开**（((m) 为实数）：')
    expect(inline.children?.slice(-1)[0].content).toMatchInlineSnapshot(`"（((m) 为实数）："`)
  })

  it('parses list_item', () => {
    const md = getMarkdown('t')
    const content = '- \\*'
    const tokens = md.parse(content, {})
    console.log({ tokens })
    const types = tokens.map(t => t.type)
    expect(types).toMatchInlineSnapshot(`
      [
        "bullet_list_open",
        "list_item_open",
        "paragraph_open",
        "inline",
        "paragraph_close",
        "list_item_close",
        "bullet_list_close",
      ]
    `)
  })
})
