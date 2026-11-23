import type { ParsedNode } from '../src'
import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

// Expected node shapes from issue #838. `shape` prints a node the same way the
// issue's reproducer does, so the assertions read like the issue's table.
function shape(node: any): string {
  if (node?.type === 'text')
    return JSON.stringify(node.content)
  if (node?.type === 'math_inline')
    return `math(${node.raw})`
  const children = [...(node?.children ?? []), ...(node?.items ?? [])]
  return `${node?.type}[${children.map(shape).join(' ')}]`
}

function finalShape(markdown: string, options: { customHtmlTags?: string[] } = {}) {
  const md = getMarkdown(`issue-838-${markdown}`, options as any)
  const nodes = parseMarkdownToStructure(markdown, md, { final: true } as any) as ParsedNode[]
  return nodes.map(shape).join(' ')
}

function collectByType(value: any, type: string, out: any[] = []): any[] {
  if (!value)
    return out
  if (Array.isArray(value)) {
    value.forEach(item => collectByType(item, type, out))
    return out
  }
  if (typeof value !== 'object')
    return out
  if (value.type === type)
    out.push(value)
  if (Array.isArray(value.children))
    value.children.forEach((child: any) => collectByType(child, type, out))
  if (Array.isArray(value.items))
    value.items.forEach((item: any) => collectByType(item, type, out))
  return out
}

function visibleText(value: any): string {
  return collectByType(value, 'text').map(node => String(node.content ?? '')).join('')
}

const issueCases: Array<[string, string]> = [
  [
    'See [the $x_1$ term](https://example.com) here.',
    'paragraph["See " link["the " math($x_1$) " term"] " here."]',
  ],
  [
    '- *Example: in $\\mathbb{R}^3$ (full rank).*',
    'list[list_item[paragraph[emphasis["Example: in " math($\\mathbb{R}^3$) " (full rank)."]]]]',
  ],
  [
    '*Note*: when \\(n\\) is large',
    'paragraph[emphasis["Note"] ": when " math(\\(n\\)) " is large"]',
  ],
  [
    'Price $5 **expensive** up to $x$',
    'paragraph["Price $5 " strong["expensive"] " up to " math($x$)]',
  ],
  [
    '100$ and $x$',
    'paragraph["100$ and " math($x$)]',
  ],
  [
    '[$a](https://example.com) $b$',
    'paragraph[link["$a"] " " math($b$)]',
  ],
  [
    '$x$  \nnext line',
    'paragraph[math($x$) hardbreak[] "next line"]',
  ],
  [
    'like $ x $ this',
    'paragraph["like $ x $ this"]',
  ],
]

describe('issue #838 - inline math is position-local', () => {
  it.each(issueCases)('parses %j as the issue expects', (markdown, expected) => {
    expect(finalShape(markdown)).toBe(expected)
  })

  it('keeps currency, ranges and unclosed prices as text', () => {
    expect(finalShape('United - **$312** nonstop, Alaska - **$289** with a stop.'))
      .toBe('paragraph["United - " strong["$312"] " nonstop, Alaska - " strong["$289"] " with a stop."]')
    expect(finalShape('The Alaska round trip is roughly $210 + $98 = $308. Cheaper than $460.'))
      .toBe('paragraph["The Alaska round trip is roughly $210 + $98 = $308. Cheaper than $460."]')
    expect(finalShape('The limit is $450,000 or communication preference'))
      .toBe('paragraph["The limit is $450,000 or communication preference"]')
    expect(finalShape('A $10,000 deposit at 4%: $A = P(1 + r)^t$ grows to about $12,209.'))
      .toBe('paragraph["A $10,000 deposit at 4%: " math($A = P(1 + r)^t$) " grows to about $12,209."]')
  })

  it('keeps escaped dollars and code spans literal', () => {
    expect(finalShape('Escaped \\$5, code `$312 and $289`, prices $210 + $98; real $x^2$.'))
      .toBe('paragraph["Escaped $5, code " inline_code[] ", prices $210 + $98; real " math($x^2$) "."]')
  })

  it('does not pair a dollar with a closing dollar of a display run', () => {
    expect(finalShape('Prices $312 and $289; $$x^2$$ then $H$.'))
      .toBe('paragraph["Prices $312 and $289; " math($$x^2$$) " then " math($H$) "."]')
    expect(finalShape('a $$$ b')).toBe('paragraph["a $$$ b"]')
  })

  describe('streaming mid-states', () => {
    it('keeps an incomplete image alt whole instead of splitting the math out of it', () => {
      const md = getMarkdown('issue-838-image-alt-mid-state')
      const chunks = [
        String.raw`![caption $X[v,d]$](`,
        String.raw`![caption $X[v,d]$](https://example.com/a.png`,
        String.raw`![caption $X[v,d]$](https://example.com/a.png)`,
      ]
      for (const chunk of chunks) {
        const nodes = parseMarkdownToStructure(chunk, md, { final: false } as any) as any[]
        const children = nodes[0]?.children ?? []
        // One image node, not `image` + `math_inline` + text: the pending alt is
        // rebuilt from text by the renderer, so the formula stays inside it.
        expect(children.map((child: any) => child.type), chunk).toEqual(['image'])
        expect(collectByType(children, 'math_inline'), chunk).toHaveLength(0)
      }
      const complete = parseMarkdownToStructure(chunks[2]!, md, { final: false } as any) as any[]
      expect(String(complete[0]?.children?.[0]?.alt)).toBe('caption $X[v,d]$')
    })

    it('keeps the streaming loading math of an unclosed strong prefix', () => {
      const md = getMarkdown('issue-838-strong-mid-state')

      const bold = parseMarkdownToStructure('**strong $E=mc^2', md, { final: false } as any) as any[]
      expect(visibleText(bold)).toContain('strong ')
      expect(collectByType(bold, 'math_inline')).toMatchObject([
        { content: 'E=mc^2', loading: true, markup: '$' },
      ])

      // `__` never closes, so it stays literal text like any other unclosed
      // emphasis marker while the formula streams in.
      const underscore = parseMarkdownToStructure('__strong $E=mc^2', md, { final: false } as any) as any[]
      expect(collectByType(underscore, 'strong')).toHaveLength(0)
      expect(visibleText(underscore)).toBe('__strong ')
      expect(collectByType(underscore, 'math_inline')).toMatchObject([
        { content: 'E=mc^2', loading: true, markup: '$' },
      ])
    })

    it('leaves an escaped literal paren in front of loading paren math', () => {
      const md = getMarkdown('issue-838-literal-paren-mid-state')
      const nodes = parseMarkdownToStructure(String.raw`literal \(\(x`, md, { final: false } as any) as any[]

      expect(visibleText(nodes)).toBe('literal (')
      expect(collectByType(nodes, 'math_inline')).toMatchObject([
        { content: 'x', loading: true, markup: '\\(\\)' },
      ])
    })

    it('never lets a currency prefix turn into a formula at any prefix', () => {
      const md = getMarkdown('issue-838-currency-prefixes')
      const source = 'Prices $312 and $289; then $H$.'
      for (let end = 1; end <= source.length; end++) {
        const prefix = source.slice(0, end)
        const cold = parseMarkdownToStructure(prefix, getMarkdown(`issue-838-cold-${end}`), { final: false, streamParse: false } as any)
        const streamed = parseMarkdownToStructure(prefix, md, { final: false, streamParse: true } as any)
        expect(streamed, prefix).toEqual(cold)
        for (const math of collectByType(streamed, 'math_inline')) {
          // A price never becomes the payload of a formula, so no formula may
          // contain the `$` that opened it.
          expect(String(math.content).includes('$'), `${prefix} -> ${math.content}`).toBe(false)
        }
      }
    })
  })

  it('parses the same structure at every streamed prefix of the issue inputs', () => {
    for (const [markdown] of issueCases) {
      const md = getMarkdown(`issue-838-prefixes-${markdown}`)
      for (let end = 1; end <= markdown.length; end++) {
        const prefix = markdown.slice(0, end)
        const cold = parseMarkdownToStructure(prefix, getMarkdown(`issue-838-cold-${markdown}-${end}`), { final: false, streamParse: false } as any)
        const streamed = parseMarkdownToStructure(prefix, md, { final: false, streamParse: true } as any)
        expect(streamed, `${markdown} @${end}`).toEqual(cold)
      }
    }
  })
})
