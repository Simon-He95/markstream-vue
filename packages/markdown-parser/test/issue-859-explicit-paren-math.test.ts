import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

// Compact view: text as a JSON string, formulas as `math(content,loading)` or
// `block(content)`, images by src, and containers as `paragraph[...]`.
function shape(nodes: any[]): string {
  return nodes.map((node) => {
    if (node.type === 'text')
      return JSON.stringify(node.content ?? '')
    if (node.type === 'math_inline')
      return `math(${JSON.stringify(node.content)}${node.loading ? ',loading' : ''})`
    if (node.type === 'math_block')
      return `block(${JSON.stringify(node.content)}${node.loading ? ',loading' : ''})`
    if (node.type === 'image')
      return `image(${node.loading ? 'loading' : node.src})`
    if (node.type === 'paragraph' || node.type === 'strong')
      return `${node.type}[${shape(node.children ?? [])}]`
    return node.type
  }).join(' ')
}

function parse(markdown: string, final: boolean) {
  const md = getMarkdown(`issue-859-${final ? 'final' : 'stream'}-${markdown.length}`)
  return shape(parseMarkdownToStructure(markdown, md, { final }) as any[])
}

describe('issue #859 - an explicit \\(...\\) pair is math', () => {
  it.each([
    ['\\(3\\)', '3'],
    ['\\(0.5\\)', '0.5'],
    ['\\(10\\%\\)', '10\\%'],
    ['\\((1, 2)\\)', '(1, 2)'],
    ['\\([0, 1]\\)', '[0, 1]'],
    ['\\(dx\\)', 'dx'],
    ['\\(n!\\)', 'n!'],
  ])('renders %j using the delimiter, not the content', (markdown, content) => {
    expect(parse(markdown, true)).toBe(`paragraph[math(${JSON.stringify(content)})]`)
  })

  it('predicts at the opener instead of waiting for math-like content', () => {
    expect(parse('极大值为 \\(3', false)).toBe('paragraph["极大值为 " math("3",loading)]')
    expect(parse('value \\(dx', false)).toBe('paragraph["value " math("dx",loading)]')
    expect(parse('value \\(dx\\)', false)).toBe('paragraph["value " math("dx")]')
  })

  it('does not withdraw the prediction for a half-typed closer', () => {
    expect(parse('value \\(x\\', false)).toBe('paragraph["value " math("x",loading)]')
  })

  it('does not merge a stray opener with the next formula', () => {
    expect(parse('text \\( a = b, see \\(x\\) end', true))
      .toBe('paragraph["text ( a = b, see " math("x") " end"]')
  })

  it('does not swallow an image after an unclosed opener', () => {
    expect(parse('$$![image](https://example.com/a.png)', false))
      .toBe('paragraph["$$" image(https://example.com/a.png)]')
  })

  it('reads a multi-line \\[...\\] block as math but keeps single-line escapes', () => {
    expect(parse('\\[\n3\n\\]', true)).toBe('block("3")')
    expect(parse('\\[1\\]', true)).toBe('paragraph["[1]"]')
    expect(parse('\\[!NOTE\\]', true)).toBe('paragraph["[!NOTE]"]')
  })

  it('reads \\(...\\) as math in strict mode too', () => {
    const md = getMarkdown('issue-859-strict', { mathOptions: { strictDelimiters: true } })
    expect(shape(parseMarkdownToStructure('\\(dx\\)', md, { final: true }) as any[]))
      .toBe('paragraph[math("dx")]')
  })

  it('can opt back into CommonMark escaped parentheses', () => {
    const md = getMarkdown('issue-859-escape', { mathOptions: { inlineParenDelimiter: 'escape' } })
    expect(shape(parseMarkdownToStructure('value \\(dx\\) here', md, { final: false }) as any[]))
      .toBe('paragraph["value (dx) here"]')
    expect(shape(parseMarkdownToStructure('value \\(3\\) here', md, { final: true }) as any[]))
      .toBe('paragraph["value (3) here"]')
  })

  it('keeps price tiers as text but reads short inline double-dollar math', () => {
    const D = '$'.repeat(2)
    // Two price tiers in one paragraph must not pair up as math.
    for (const markdown of [
      `Cafe Luna (${D}) and Bistro Max (${D})`,
      `Price tiers: ${D}, ${D}, and ${D}$.`,
    ]) {
      expect(parse(markdown, true)).toBe(`paragraph[${JSON.stringify(markdown)}]`)
      expect(parse(markdown, false)).toBe(`paragraph[${JSON.stringify(markdown)}]`)
    }
    // A short formula is still math: the delimiter gate keeps `isMathLike`
    // and only widens it to bare tokens inside explicit `$$`.
    for (const content of ['3', 'xx', 'dx', 'n!', '60\u00b0', '(0,1]', 'x + y']) {
      const markdown = `inline ${D} ${content} ${D} here`
      expect(parse(markdown, true)).toBe(`paragraph["inline " math(${JSON.stringify(` ${content} `)}) " here"]`)
    }
  })
})
