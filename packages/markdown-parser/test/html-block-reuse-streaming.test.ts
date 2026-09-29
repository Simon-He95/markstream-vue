import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

/**
 * html_block top-level reuse safety: the streaming incremental path (reusing
 * stable top-level html_block nodes) must produce a node tree identical to a
 * cold full parse of the same source, at every append step.
 */

function stripSourceMap(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(stripSourceMap)
  if (!value || typeof value !== 'object')
    return value

  const object = value as Record<string, unknown>
  const copy: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(object)) {
    if (key === 'sourceMap')
      continue
    copy[key] = stripSourceMap(entry)
  }
  return copy
}

function parseCold(source: string) {
  const md = getMarkdown(`html-reuse-cold-${Math.random()}`)
  return stripSourceMap(parseMarkdownToStructure(source, md, {
    final: false,
    streamParse: false,
  }))
}

function parseStreaming(
  source: string,
  md: ReturnType<typeof getMarkdown>,
  parserMetrics?: { processTokensReusedTopLevelNodes?: number },
) {
  return stripSourceMap(parseMarkdownToStructure(source, md, {
    final: false,
    parserMetrics,
    reuseStableTopLevelNodes: true,
    streamParse: true,
  }))
}

function expectStreamingMatchesCold(fullSource: string, chunkBoundaries: number[]) {
  const md = getMarkdown(`html-reuse-stream-${Math.random()}`)
  let prefix = ''
  for (const end of chunkBoundaries) {
    prefix = fullSource.slice(0, end)
    const streamed = parseStreaming(prefix, md)
    expect(streamed).toEqual(parseCold(prefix))
  }
  expect(parseStreaming(fullSource, md)).toEqual(parseCold(fullSource))
}

describe('html_block top-level reuse streaming', () => {
  it('preserves structured children when a completed wrapper becomes reusable', () => {
    const md = getMarkdown(`html-reuse-completed-wrapper-${Math.random()}`)
    const prefix = '<div>\n\n- item\n\n</div>\n\n'
    parseStreaming(prefix, md)
    parseStreaming(`${prefix}growing`, md)

    const source = `${prefix}growing tail`
    const parserMetrics: { processTokensReusedTopLevelNodes?: number } = {}
    expect(parseStreaming(source, md, parserMetrics)).toEqual(parseCold(source))
    expect(parserMetrics.processTokensReusedTopLevelNodes).toBe(1)
  })

  it('keeps streamed and cold output identical for an unclosed <div> that grows', () => {
    const full = [
      '# Title',
      '',
      '<div class="box">',
      'content line one',
      'content line two',
      '',
      '## Heading inside div',
      '',
      '- list item',
      '',
      'tail paragraph',
      '',
      '</div>',
      '',
      'after close',
    ].join('\n')

    const boundaries: number[] = []
    for (let i = 1; i <= full.length; i += Math.ceil(full.length / 12))
      boundaries.push(Math.min(i, full.length))

    expectStreamingMatchesCold(full, boundaries)
  })

  it('keeps streamed and cold output identical with multiple sibling html blocks and markdown between', () => {
    const full = [
      '<table>',
      '<tr><td>a</td></tr>',
      '</table>',
      '',
      'paragraph in between',
      '',
      '<div>',
      'inside',
      '</div>',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
      '<section>tail section</section>',
    ].join('\n')

    const boundaries: number[] = []
    for (let i = 1; i <= full.length; i += Math.ceil(full.length / 10))
      boundaries.push(Math.min(i, full.length))

    expectStreamingMatchesCold(full, boundaries)
  })

  it('keeps streamed and cold output identical for a self-contained <details> block', () => {
    const full = [
      'before',
      '',
      '<details>',
      '<summary>open me</summary>',
      '',
      'hidden *markdown* content',
      '',
      '- one',
      '- two',
      '</details>',
      '',
      'after',
    ].join('\n')

    const boundaries: number[] = []
    for (let i = 1; i <= full.length; i += Math.ceil(full.length / 10))
      boundaries.push(Math.min(i, full.length))

    expectStreamingMatchesCold(full, boundaries)
  })

  it('handles details appended after a reusable generic html prefix', () => {
    const md = getMarkdown(`html-reuse-appended-details-${Math.random()}`)
    const prefix = '<div>stable prefix</div>\n\ntrailing paragraph\n\n'
    parseStreaming(prefix, md)

    const source = `${prefix}<details>\n<summary>open me</summary>\n\nbody\n</details>\n`
    const parserMetrics: { processTokensReusedTopLevelNodes?: number } = {}
    expect(parseStreaming(source, md, parserMetrics)).toEqual(parseCold(source))
    expect(parserMetrics.processTokensReusedTopLevelNodes).toBe(1)
  })

  it('keeps streamed and cold output identical when an unclosed <details> grows then closes', () => {
    const full = [
      '<details open>',
      '<summary>summary</summary>',
      '',
      'first paragraph inside details',
      '',
      'second paragraph inside details',
      '',
      'third paragraph inside details',
      '</details>',
    ].join('\n')

    const boundaries: number[] = []
    for (let i = 1; i <= full.length; i += Math.ceil(full.length / 10))
      boundaries.push(Math.min(i, full.length))

    expectStreamingMatchesCold(full, boundaries)
  })

  it('keeps streamed and cold output identical when an unclosed wrapper swallows a details block', () => {
    // An unclosed `<div>` consumes everything after it, the nested list raw
    // (`p2\nq2`) has no literal counterpart at its own position, and a later
    // paragraph repeats that text verbatim. That combination is what used to
    // make the merge pass scan the rest of the document for every node.
    const full = [
      '<div class="same">',
      'BETA',
      '',
      '<details>',
      '<summary>Summary 2</summary>',
      '',
      '- p2',
      '- q2',
      '',
      '</details>',
      '',
      'trailing copy:',
      'p2',
      'q2',
    ].join('\n')

    const boundaries: number[] = []
    for (let i = 1; i <= full.length; i += Math.ceil(full.length / 12))
      boundaries.push(Math.min(i, full.length))

    expectStreamingMatchesCold(full, boundaries)
  })

  it('keeps merged details raw faithful to the source instead of degrading nested lists', () => {
    // Regression guard for the merge-cursor anchoring: with the unanchored
    // search, the list raw (`x1\ny1`) matched a later paragraph by coincidence,
    // which advanced the merge cursor past the real position and made the
    // merged wrapper lose its authored markers. The nested list then degraded
    // into a plain paragraph and the html_block raw stopped being a literal
    // slice of the source.
    const source = [
      '<details>',
      '<summary>Summary 2</summary>',
      '',
      '- x1',
      '- y1',
      '',
      '</details>',
      '',
      '<div class="same">',
      'BETA',
      '',
      '',
      '<details>',
      '<summary>Summary 2</summary>',
      '',
      '- p2',
      '- q2',
      '',
      '</details>',
      '',
      '<div class="same">',
      'DELTA',
      '</div>',
      '',
      'trailing copy:',
      'x1',
      'y1',
    ].join('\n')

    const nodes = parseCold(source) as Array<Record<string, any>>
    const wrapper = nodes.find(node => node.type === 'html_block' && node.tag === 'div')
    expect(wrapper).toBeTruthy()

    const details = (wrapper!.children as Array<Record<string, any>>).find(child => child.tag === 'details')
    expect(details).toBeTruthy()

    // An html_block raw is a slice of the document source; losing the list
    // markers breaks that invariant.
    expect(String(details!.raw)).toContain('- p2\n- q2')
    expect(source.includes(String(details!.raw))).toBe(true)
    expect(source.includes(String(wrapper!.raw))).toBe(true)

    const body = (details!.children as Array<Record<string, any>>).find(child => child.type === 'list')
    expect(body, 'nested list must not degrade to a paragraph').toBeTruthy()
    expect((body as Record<string, any>).raw).toBe('p2\nq2')
  })
})
