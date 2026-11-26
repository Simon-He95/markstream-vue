import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

// A math prediction is only useful if it survives the next chunk. These tests
// lock that property for explicit delimiters (#859): once an opener has been
// read as math, a longer prefix may extend its content or settle it, but must
// not turn it back into text. The two allowed exceptions are new information
// that genuinely invalidates the guess: a later `\(` supersedes the opener,
// and a backtick turns the tail into a code span.

interface MathNode {
  type: string
  content: string
  loading: boolean
}

function collectMath(nodes: any[], out: MathNode[] = []) {
  for (const node of nodes) {
    if (node.type === 'math_inline' || node.type === 'math_block')
      out.push({ type: node.type, content: String(node.content ?? ''), loading: node.loading === true })
    if (node.children)
      collectMath(node.children, out)
    if (node.items)
      collectMath(node.items, out)
  }
  return out
}

// Half-typed closers are trimmed from loading content on purpose, so compare
// the readable content only.
function readable(content: string) {
  return content.replace(/[\s\\$]+$/, '')
}

function key(node: MathNode) {
  return `${node.type}\u0000${readable(node.content)}`
}

function parse(prefix: string, md: ReturnType<typeof getMarkdown>) {
  return collectMath(parseMarkdownToStructure(prefix, md, { final: false }) as any[])
}

function expectMonotonic(source: string) {
  const md = getMarkdown(`math-monotonic-${source.length}-${source.charCodeAt(1)}`)
  let previous = parse('', md)
  for (let end = 1; end <= source.length; end++) {
    const prefix = source.slice(0, end)
    const current = parse(prefix, md)
    const remaining = new Map<string, number>()
    for (const node of current)
      remaining.set(key(node), (remaining.get(key(node)) ?? 0) + 1)

    const superseded = prefix.endsWith('\\(')
    const codeSpan = prefix.endsWith('`')
    for (const node of previous) {
      const exact = remaining.get(key(node)) ?? 0
      if (exact > 0) {
        remaining.set(key(node), exact - 1)
        continue
      }
      if (node.loading && !superseded && !codeSpan) {
        const extended = current.find(candidate =>
          candidate.type === node.type
          && readable(candidate.content).startsWith(readable(node.content)),
        )
        if (extended)
          continue
      }
      if (node.loading && (superseded || codeSpan))
        continue
      throw new Error(`math prediction was withdrawn at ${JSON.stringify(prefix)}: ${JSON.stringify(node)}`)
    }
    previous = current
  }
}

describe('streaming math predictions (#859)', () => {
  it.each([
    'The maximum is \\(3\\) at \\(x=-1\\).',
    '极大值为 \\(3\\)，最小值为 \\(-1\\)。',
    'value \\(dx\\) and \\(n!\\) and \\(xy\\) here',
    'inline \\(10\\%\\) of \\((1, 2)\\) and \\([0, 1]\\)',
    'formula \\(\\frac{a}{b}\\) plus \\(\\sqrt{3}\\)',
    '$3$ and \\(4\\) and $x$',
    '$$\n3\n$$',
    '\\[\n3\n\\]',
    'prefix\n\n\\[\nf(x)\n\\]',
    'text \\( a = b, see \\(x\\) end',
  ])('keeps math math while %j streams', (source) => {
    expectMonotonic(source)
  })

  it.each([
    'The maximum is \\(3\\)',
    'value \\(dx\\)',
    'value \\(n!\\)',
    '极大值为 \\(3\\)',
  ])('starts the formula at the opener: %j', (source) => {
    const md = getMarkdown(`math-opener-${source.length}-${source.charCodeAt(0)}`)
    const opener = source.indexOf('\\(')
    for (let end = opener + 2; end <= source.length; end++) {
      const maths = parse(source.slice(0, end), md)
      expect(maths.length).toBeGreaterThanOrEqual(1)
      expect(maths[0]!.type).toBe('math_inline')
    }
  })
})
