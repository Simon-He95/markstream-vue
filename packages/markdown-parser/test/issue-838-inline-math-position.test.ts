import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

// Compact view of the parsed nodes: text as a JSON string, formulas as
// `math(raw)` (with `,loading` while they stream), links with their href, and
// every other node as `type[children]`.
function shape(node: any): string {
  if (node.type === 'text')
    return JSON.stringify(node.content)
  if (node.type === 'math_inline')
    return `math(${node.raw}${node.loading ? ',loading' : ''})`
  if (node.type === 'link')
    return `link(${node.href})[${(node.children ?? []).map(shape).join(' ')}]`
  if (node.type === 'image')
    return `image(${node.loading ? 'loading' : node.src})`
  return `${node.type}[${[...(node.children ?? []), ...(node.items ?? [])].map(shape).join(' ')}]`
}

function parse(markdown: string, final: boolean) {
  const md = getMarkdown(`issue-838-${final ? 'final' : 'stream'}`)
  return (parseMarkdownToStructure(markdown, md, { final }) as any[]).map(shape).join(' ')
}

describe('issue #838 - inline math opens only where it starts', () => {
  it.each([
    ['See [the $x_1$ term](https://example.com) here.', 'paragraph["See " link(https://example.com)["the " math($x_1$) " term"] " here."]'],
    ['- *Example: in $\\mathbb{R}^3$ (full rank).*', 'list[list_item[paragraph[emphasis["Example: in " math($\\mathbb{R}^3$) " (full rank)."]]]]'],
    ['*Note*: when \\(n\\) is large', 'paragraph[emphasis["Note"] ": when " math(\\(n\\)) " is large"]'],
    ['Price $5 **expensive** up to $x$', 'paragraph["Price $5 " strong["expensive"] " up to " math($x$)]'],
    ['100$ and $x$', 'paragraph["100$ and " math($x$)]'],
    ['[$a](https://example.com) $b$', 'paragraph[link(https://example.com)["$a"] " " math($b$)]'],
    ['$x$  \nnext line', 'paragraph[math($x$) hardbreak[] "next line"]'],
    ['like $ x $ this', 'paragraph["like $ x $ this"]'],
    ['\\(\\alpha\\) and $\\beta$', 'paragraph[math(\\(\\alpha\\)) " and " math($\\beta$)]'],
    ['see `$x$` and $y$', 'paragraph["see " inline_code[] " and " math($y$)]'],
  ])('leaves the text around the formula to the other rules: %j', (markdown, expected) => {
    expect(parse(markdown, true)).toBe(expected)
    expect(parse(markdown, false)).toBe(expected)
  })

  it.each([
    'Price: $5, $10, and $15',
    '$2000~$5000',
    'costs $5.',
  ])('keeps currency text as text: %j', (markdown) => {
    const expected = `paragraph[${JSON.stringify(markdown)}]`
    expect(parse(markdown, true)).toBe(expected)
    expect(parse(markdown, false)).toBe(expected)
  })

  it('keeps a placeholder between dollars as text', () => {
    // The typographer turns `...` into an ellipsis; the dollars stay text.
    expect(parse('$...$ placeholder', true)).toBe('paragraph["$…$ placeholder"]')
    expect(parse('$...$ placeholder', false)).toBe('paragraph["$…$ placeholder"]')
  })

  it('keeps image syntax the image rule rejects as text', () => {
    // A space makes the destination invalid; the alt still is not parsed as math.
    expect(parse('![a $x$](b c)', true)).toBe('paragraph["![a $x$](b c)"]')
    expect(parse('![a $x$](b c)', false)).toBe('paragraph["![a $x$](b c)"]')
  })

  it('does not close a single `$` that a digit follows', () => {
    expect(parse('$x$5 apples', true)).toBe('paragraph["$x$5 apples"]')
  })

  it('draws an unclosed formula as loading only at the end of a streaming source', () => {
    expect(parse('sum $x + y', false)).toBe('paragraph["sum " math($x + y$,loading)]')
    expect(parse('sum $x + y', true)).toBe('paragraph["sum $x + y"]')
    // Only the last opener of its kind can still be closed by what arrives next.
    expect(parse('\\(a \\(b', false)).toBe('paragraph["(a " math(\\(b\\),loading)]')
    expect(parse('\\(a \\(b', true)).toBe('paragraph["(a (b"]')
    // Inside link text it is not at the end of the source, even when the label
    // is scanned token by token (here because of the code span).
    expect(parse('[a `c` $x^2](https://e.com) tail', false)).toBe('paragraph[link(https://e.com)["a " inline_code[] " $x^2"] " tail"]')
  })

  // Streaming mid-states keep the structure the previous rule produced. The
  // token-level side of the two strong cases is in test/math-inline-edgecases.test.ts.
  it.each([
    ['![caption $X[v,d]$](', 'paragraph[image(loading)]'],
    ['**strong $E=mc^2', 'paragraph[strong["strong "] strong[math($E=mc^2$,loading)]]'],
    ['__strong $E=mc^2', 'paragraph["__strong " strong[math($E=mc^2$,loading)]]'],
    ['literal \\(\\(x', 'paragraph["literal (" math(\\(x\\),loading)]'],
  ])('keeps the streaming mid-state of %j', (markdown, expected) => {
    expect(parse(markdown, false)).toBe(expected)
  })
})

describe('issue #838 - a `\\(` formula ends at its first unescaped `\\)`', () => {
  it.each([
    // The `(` of a half-open interval has no `)` and must not take the formula's
    // `\)`, or the formula runs on into the next one.
    ['for \\(x \\in (0, 1]\\) we have \\(f(x) > 0\\)', 'paragraph["for " math(\\(x \\in (0, 1]\\)) " we have " math(\\(f(x) > 0\\))]'],
    // `(0, 1]` alone is not math-like and stays text; the formula after it still parses.
    ['the set \\((0, 1]\\) and \\(x + y\\) here', 'paragraph["the set ((0, 1]) and " math(\\(x + y\\)) " here"]'],
    ['range \\((0, \\pi]\\) here', 'paragraph["range " math(\\((0, \\pi]\\)) " here"]'],
    // An escaped backslash before `)` is a TeX line break, not the closer.
    ['\\(\\alpha \\\\) b\\) here', 'paragraph[math(\\(\\alpha \\\\) b\\)) " here"]'],
  ])('closes %j at its own `\\)`', (markdown, expected) => {
    expect(parse(markdown, true)).toBe(expected)
    expect(parse(markdown, false)).toBe(expected)
  })
})
