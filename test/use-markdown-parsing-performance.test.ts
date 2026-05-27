import type { Ref } from 'vue'
import type { NodeRendererProps } from '../src/types/node-renderer-props'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, reactive, ref } from 'vue'
import { useMarkdownParsing } from '../src/components/NodeRenderer/composables/useMarkdownParsing'

function createParsingState(
  content: Ref<string>,
  smooth = ref(false),
  initialProps: Partial<NodeRendererProps> = {},
  debugPerformance = ref(false),
  logPerf = vi.fn(),
) {
  const props = reactive({ ...initialProps } as NodeRendererProps)
  const final = ref(false)
  const scope = effectScope()
  const state = scope.run(() => useMarkdownParsing(props, {
    instanceMsgId: `test-${Math.random().toString(36).slice(2)}`,
    renderContent: computed(() => content.value),
    effectiveFinal: computed(() => final.value),
    smoothStreamingEnabled: computed(() => smooth.value),
    debugPerformanceEnabled: computed(() => debugPerformance.value),
    logPerf,
  }))

  if (!state)
    throw new Error('failed to create parsing state')

  return { props, final, scope, state }
}

function paragraphChildren(node: unknown) {
  return ((node as { children?: unknown[] } | undefined)?.children ?? []) as Array<{ type?: string }>
}

function buildParagraphs(count: number) {
  return Array.from(
    { length: count },
    (_, index) => `Paragraph ${index + 1} with enough text to exercise large append parsing.`,
  ).join('\n\n')
}

function buildTokenHeavyMarkdown(count: number) {
  const sections = Array.from({ length: count }, (_, index) => {
    const n = index + 1
    return [
      `### Section ${n}`,
      `Paragraph ${n} with [a link](https://example.com/${n}) and **strong** plus _emphasis_.`,
      '',
      `- item ${n}.1 with \`inline code\``,
      `- item ${n}.2 with [inline reference ${n}](https://example.com/ref-${n})`,
      '',
      `| Name | Value |`,
      `| - | - |`,
      `| row ${n} | ${n} |`,
    ].join('\n')
  }).join('\n\n')

  return `${sections}\n\n`
}

function setTokenAttr(token: { attrs?: [string, string][] | null }, name: string, value: string) {
  const attrs = token.attrs ?? []
  const existing = attrs.find(attr => attr[0] === name)
  if (existing)
    existing[1] = value
  else
    attrs.push([name, value])
  token.attrs = attrs
}

function findNode(nodes: any[], type: string) {
  return nodes.find(node => node?.type === type)
}

function createDefinitionListTokens(definition: string) {
  return [
    { type: 'dl_open' },
    { type: 'dt_open' },
    { type: 'inline', content: 'Term', children: [{ type: 'text', content: 'Term' }] },
    { type: 'dt_close' },
    { type: 'dd_open' },
    { type: 'paragraph_open' },
    { type: 'inline', content: definition, children: [{ type: 'text', content: definition }] },
    { type: 'paragraph_close' },
    { type: 'dd_close' },
    { type: 'dl_close' },
  ] as any[]
}

function createFootnoteAndAdmonitionTokens(text: string) {
  const inline = { type: 'inline', content: text, children: [{ type: 'text', content: text }] }
  return [
    { type: 'container_note_open', info: 'note Title' },
    { type: 'paragraph_open' },
    inline,
    { type: 'paragraph_close' },
    { type: 'container_note_close' },
    { type: 'footnote_open', meta: { label: '1' } },
    { type: 'paragraph_open' },
    { type: 'inline', content: text, children: [{ type: 'text', content: text }] },
    { type: 'paragraph_close' },
    { type: 'footnote_close' },
  ] as any[]
}

describe('useMarkdownParsing performance behavior', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('coalesces smooth streaming character updates until the parse interval elapses', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const next = `${initial} world`
    const content = ref(initial)
    const smooth = ref(true)
    const { scope, state } = createParsingState(content, smooth)

    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    content.value = next
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(79)
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(1)
    expect(state.parsedNodes.value[0]?.raw).toBe(next)

    content.value = `${next}\n\nnext`
    expect(state.parsedNodes.value.length).toBe(2)

    scope.stop()
  })

  it('flushes pending coalesced content immediately when final becomes true', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const next = `${initial} world`
    const content = ref(initial)
    const smooth = ref(true)
    const { final, scope, state } = createParsingState(content, smooth, { parseCoalesceMs: 1000 })

    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    content.value = next
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    final.value = true
    expect(state.parsedNodes.value[0]?.raw).toBe(next)

    await vi.advanceTimersByTimeAsync(999)
    expect(state.parsedNodes.value[0]?.raw).toBe(next)

    scope.stop()
  })

  it('flushes pending coalesced content before applying parse semantic changes', () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const next = `${initial} world`
    const content = ref(initial)
    const smooth = ref(true)
    const { props, scope, state } = createParsingState(content, smooth)

    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    content.value = next
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    props.parseOptions = { requireClosingStrong: true }
    expect(state.parsedNodes.value[0]?.raw).toBe(next)

    scope.stop()
  })

  it('uses parseCoalesceMs to pace smooth streaming parse commits', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const next = `${initial} world`
    const content = ref(initial)
    const smooth = ref(true)
    const { scope, state } = createParsingState(content, smooth, { parseCoalesceMs: 20 })

    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    content.value = next
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(19)
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(1)
    expect(state.parsedNodes.value[0]?.raw).toBe(next)

    scope.stop()
  })

  it('reuses unchanged ParsedNode references after append parses', () => {
    const content = ref('alpha\n\nbeta')
    const { scope, state } = createParsingState(content)
    const first = state.parsedNodes.value

    content.value = 'alpha\n\nbeta\n\ngamma'
    const second = state.parsedNodes.value

    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])
    expect(second[2]).not.toBe(first[2])

    scope.stop()
  })

  it('reuses unchanged list ParsedNode references after append parses', () => {
    const content = ref('- alpha\n- beta')
    const { scope, state } = createParsingState(content)
    const firstList = state.parsedNodes.value[0]

    content.value = `${content.value}\n\nAppended paragraph.`
    const second = state.parsedNodes.value

    expect(second[0]).toBe(firstList)
    expect(second[1]).not.toBe(firstList)

    scope.stop()
  })

  it('reuses unchanged table ParsedNode references after append parses', () => {
    const content = ref('| A | B |\n| - | - |\n| x | y |')
    const { scope, state } = createParsingState(content)
    const firstTable = state.parsedNodes.value[0]

    content.value = `${content.value}\n\nAppended paragraph.`
    const second = state.parsedNodes.value

    expect(second[0]).toBe(firstTable)
    expect(second[1]).not.toBe(firstTable)

    scope.stop()
  })

  it('does not reuse a table when appended references change cell children', () => {
    const content = ref('| Link |\n| - |\n| [x][ref] |\n\n')
    const { scope, state } = createParsingState(content)
    const firstTable = state.parsedNodes.value[0] as any

    expect(firstTable.header?.cells?.[0]?.children?.[0]?.type).toBe('text')

    content.value = `${content.value}[ref]: https://example.com\n`
    const secondTable = state.parsedNodes.value[0] as any

    expect(secondTable).not.toBe(firstTable)
    expect(secondTable.rows?.[0]?.cells?.[0]?.children?.[0]?.type).toBe('link')

    scope.stop()
  })

  it('reuses unchanged definition list ParsedNode references after append parses', () => {
    const content = ref('definition-list')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        streamParse: false,
        preTransformTokens: () => createDefinitionListTokens('Definition'),
      },
    })
    const firstList = state.parsedNodes.value[0]

    content.value = `${content.value}\n\nAppended paragraph.`
    const secondList = state.parsedNodes.value[0]

    expect(secondList).toBe(firstList)

    scope.stop()
  })

  it('does not reuse a definition list when its definition changes', () => {
    let definition = 'First definition'
    const content = ref('definition-list')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        streamParse: false,
        preTransformTokens: () => createDefinitionListTokens(definition),
      },
    })
    const firstList = state.parsedNodes.value[0] as any

    definition = 'Second definition'
    content.value = `${content.value}\n\nAppended paragraph.`
    const secondList = state.parsedNodes.value[0] as any

    expect(secondList).not.toBe(firstList)
    expect(secondList.items?.[0]?.definition?.[0]?.raw).toBe('Second definition')

    scope.stop()
  })

  it('does not reuse footnote and admonition nodes when their children change', () => {
    let nestedText = 'First'
    const content = ref('nested containers')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        streamParse: false,
        preTransformTokens: () => createFootnoteAndAdmonitionTokens(nestedText),
      },
    })
    const firstAdmonition = findNode(state.parsedNodes.value, 'admonition')
    const firstFootnote = findNode(state.parsedNodes.value, 'footnote')

    nestedText = 'Second'
    content.value = `${content.value}\n\nAppended paragraph.`
    const secondAdmonition = findNode(state.parsedNodes.value, 'admonition')
    const secondFootnote = findNode(state.parsedNodes.value, 'footnote')

    expect(secondAdmonition).not.toBe(firstAdmonition)
    expect(secondFootnote).not.toBe(firstFootnote)
    expect(secondAdmonition?.children?.[0]?.raw).toBe('Second')
    expect(secondFootnote?.children?.[0]?.raw).toBe('Second')

    scope.stop()
  })

  it('does not reuse a node when appended reference definitions change inline children', () => {
    const content = ref('[foo][bar]\n\n')
    const { scope, state } = createParsingState(content)

    const first = state.parsedNodes.value[0]
    expect(paragraphChildren(first).some(child => child.type === 'link')).toBe(false)

    content.value = '[foo][bar]\n\n[bar]: https://example.com\n\n'

    const second = state.parsedNodes.value[0]
    expect(second).not.toBe(first)
    expect(paragraphChildren(second).some(child => child.type === 'link')).toBe(true)

    scope.stop()
  })

  it('does not reuse stale ParsedNode references when final changes', () => {
    const content = ref('**hello')
    const { final, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value[0]

    final.value = true
    const second = state.parsedNodes.value[0]

    expect(second).not.toBe(first)

    scope.stop()
  })

  it('renderer default final stream parse equals sync final parse for unfinished constructs', () => {
    const content = ref([
      '```ts',
      'const value = 1',
      '',
      '<details>',
      '<summary>Steps</summary>',
      '- item',
      '',
      '$$',
      'x + y',
    ].join('\n'))
    const { final, scope, state } = createParsingState(content)

    final.value = true

    const rendererFinal = state.parsedNodes.value
    const syncFinal = parseMarkdownToStructure(
      content.value,
      getMarkdown('sync-final'),
      { final: true, streamParse: false },
    )

    expect(rendererFinal).toEqual(syncFinal)

    scope.stop()
  })

  it('does not reuse stale ParsedNode references when parseOptions changes', () => {
    const content = ref('**hello')
    const { props, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value[0]
    const reset = vi.spyOn((state.mdInstance.value as any).stream, 'reset')

    props.parseOptions = { requireClosingStrong: true }
    const second = state.parsedNodes.value[0]

    expect(second).not.toBe(first)
    expect(reset).toHaveBeenCalled()

    scope.stop()
  })

  it('does not reuse stale ParsedNode references when customMarkdownIt changes', () => {
    const content = ref('[x](https://example.com)')
    const { props, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value[0]

    props.customMarkdownIt = (md) => {
      const markdownIt = md as any
      markdownIt.set?.({ validateLink: () => false })
      return md
    }
    const second = state.parsedNodes.value[0]

    expect(second).not.toBe(first)
    expect(paragraphChildren(second).some(child => child.type === 'link')).toBe(false)

    scope.stop()
  })

  it('does not reuse a paragraph when children differ but raw is unchanged', () => {
    const content = ref('[x](https://example.com)')
    const { props, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value[0]

    expect(paragraphChildren(first).some(child => child.type === 'link')).toBe(true)

    props.parseOptions = { validateLink: () => false }
    const second = state.parsedNodes.value[0]

    expect(second).not.toBe(first)
    expect((second as any).raw).toBe((first as any).raw)
    expect(paragraphChildren(second).some(child => child.type === 'link')).toBe(false)

    scope.stop()
  })

  it('does not reuse nodes when only attrs change', () => {
    let attrValue = 'first'
    const content = ref('# Title\n\n[x](https://example.com)')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: { streamParse: false },
      customMarkdownIt: (md: any) => {
        if (md.__testDynamicAttrsInstalled)
          return md

        md.__testDynamicAttrsInstalled = true
        md.core.ruler.push('test_dynamic_attrs', (parserState: any) => {
          for (const token of parserState.tokens ?? []) {
            if (token.type === 'heading_open')
              setTokenAttr(token, 'data-state', attrValue)

            if (token.type === 'inline') {
              for (const child of token.children ?? []) {
                if (child.type === 'link_open')
                  setTokenAttr(child, 'data-state', attrValue)
              }
            }
          }
        })
        return md
      },
    })
    const firstHeading = state.parsedNodes.value[0] as any
    const firstParagraph = state.parsedNodes.value[1]
    const firstLink = paragraphChildren(firstParagraph).find(child => child.type === 'link') as any

    expect(firstHeading.attrs).toMatchObject({ 'data-state': 'first' })
    expect(firstLink.attrs).toContainEqual(['data-state', 'first'])

    attrValue = 'second'
    content.value = `${content.value}\n\nAppended paragraph.`

    const secondHeading = state.parsedNodes.value[0] as any
    const secondParagraph = state.parsedNodes.value[1]
    const secondLink = paragraphChildren(secondParagraph).find(child => child.type === 'link') as any

    expect(secondHeading).not.toBe(firstHeading)
    expect(secondParagraph).not.toBe(firstParagraph)
    expect(secondHeading.attrs).toMatchObject({ 'data-state': 'second' })
    expect(secondLink.attrs).toContainEqual(['data-state', 'second'])

    scope.stop()
  })

  it('does not reuse nodes when a custom object field changes', () => {
    let seriesValue = 1
    const content = ref('chart')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        preTransformTokens(tokens) {
          for (const token of tokens as any[]) {
            if (token.type === 'inline') {
              token.children = [{
                type: 'chart',
                content: 'chart',
                raw: 'chart',
                data: { series: [seriesValue] },
              }]
            }
          }
          return tokens
        },
      },
    })
    const firstParagraph = state.parsedNodes.value[0] as any
    const firstChart = firstParagraph.children?.[0]

    expect(firstChart?.data?.series).toEqual([1])

    seriesValue = 2
    content.value = `${content.value}\n\nAppended paragraph.`

    const secondParagraph = state.parsedNodes.value[0] as any
    const secondChart = secondParagraph.children?.[0]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(secondChart).not.toBe(firstChart)
    expect(secondChart?.data?.series).toEqual([2])

    scope.stop()
  })

  it('does not reuse a custom node when the same data object mutates in place', () => {
    const sharedData = { series: [1] }
    const content = ref('chart')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        preTransformTokens(tokens) {
          for (const token of tokens as any[]) {
            if (token.type === 'inline') {
              token.children = [{
                type: 'chart',
                content: 'chart',
                raw: 'chart',
                data: sharedData,
              }]
            }
          }
          return tokens
        },
      },
    })
    const firstParagraph = state.parsedNodes.value[0] as any
    const firstChart = firstParagraph.children?.[0]

    expect(firstChart?.data?.series).toEqual([1])

    sharedData.series = [2]
    content.value = `${content.value}\n\nAppended paragraph.`

    const secondParagraph = state.parsedNodes.value[0] as any
    const secondChart = secondParagraph.children?.[0]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(secondChart).not.toBe(firstChart)
    expect(secondChart?.data?.series).toEqual([2])

    scope.stop()
  })

  it('does not crash on cyclic custom node data', () => {
    const sharedData: any = { series: [1] }
    sharedData.self = sharedData
    const content = ref('chart')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        preTransformTokens(tokens) {
          for (const token of tokens as any[]) {
            if (token.type === 'inline') {
              token.children = [{
                type: 'chart',
                content: 'chart',
                raw: 'chart',
                data: sharedData,
              }]
            }
          }
          return tokens
        },
      },
    })
    const firstParagraph = state.parsedNodes.value[0] as any
    const firstChart = firstParagraph.children?.[0]

    expect(firstChart?.data?.self).toBe(sharedData)

    sharedData.series = [2]
    content.value = `${content.value}\n\nAppended paragraph.`

    const secondParagraph = state.parsedNodes.value[0] as any
    const secondChart = secondParagraph.children?.[0]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(secondChart).not.toBe(firstChart)
    expect(secondChart?.data?.series).toEqual([2])

    scope.stop()
  })

  it('bounds structural signatures for large custom payloads', () => {
    const rows = Array.from({ length: 10000 }, (_, index) => {
      const row = {}
      Object.defineProperty(row, 'value', {
        enumerable: true,
        get() {
          if (index >= 250)
            throw new Error('large payload row should not be traversed')
          return index
        },
      })
      return row
    })
    const content = ref('chart')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        preTransformTokens(tokens) {
          for (const token of tokens as any[]) {
            if (token.type === 'inline') {
              token.children = [{
                type: 'chart',
                content: 'chart',
                raw: 'chart',
                data: { rows },
              }]
            }
          }
          return tokens
        },
      },
    })

    expect(state.parsedNodes.value[0]).toBeTruthy()

    content.value = `${content.value}\n\nAppended paragraph.`

    expect(state.parsedNodes.value).toHaveLength(2)

    scope.stop()
  })

  it('does not reuse a custom node when content changes but raw stays stable', () => {
    let dynamicContent = 'first'
    const content = ref('custom')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        preTransformTokens(tokens) {
          for (const token of tokens as any[]) {
            if (token.type === 'inline') {
              token.children = [{
                type: 'chart',
                raw: 'chart',
                content: dynamicContent,
              }]
            }
          }
          return tokens
        },
      },
    })
    const firstParagraph = state.parsedNodes.value[0] as any
    const firstChart = firstParagraph.children?.[0]

    expect(firstChart?.content).toBe('first')

    dynamicContent = 'second'
    content.value = `${content.value}\n\nAppended paragraph.`

    const secondParagraph = state.parsedNodes.value[0] as any
    const secondChart = secondParagraph.children?.[0]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(secondChart).not.toBe(firstChart)
    expect(secondChart?.content).toBe('second')

    scope.stop()
  })

  it('does not deep-stringify previous ParsedNodes during large append reuse', () => {
    const stringify = vi.spyOn(JSON, 'stringify')
    const content = ref(buildParagraphs(5000))
    const { scope, state } = createParsingState(content)

    expect(state.parsedNodes.value.length).toBe(5000)
    stringify.mockClear()

    content.value = `${content.value}\n\nAppended paragraph.`
    expect(state.parsedNodes.value.length).toBe(5001)

    expect(stringify.mock.calls.length).toBeLessThan(20)

    scope.stop()
  })

  it('logs stream stats deltas when debug performance is enabled', () => {
    const content = ref('alpha')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(1)

    const data = logPerf.mock.calls.at(-1)?.[1]
    expect(data).toMatchObject({
      nodeReuseMs: expect.any(Number),
      streamDelta: expect.objectContaining({
        total: expect.any(Number),
      }),
      streamStats: expect.any(Object),
    })
    expect(data?.nodeReuseMs).toBeGreaterThanOrEqual(0)
    expect(typeof data?.streamMode === 'string' || data?.streamMode == null).toBe(true)

    scope.stop()
  })

  it('logs parse coalescing and stream hit counters for append parses', async () => {
    vi.useFakeTimers()
    const initial = buildParagraphs(40)
    const next = `${initial} appended tail`
    const content = ref(initial)
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(true), {}, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(40)

    content.value = next
    expect(state.parsedNodes.value.length).toBe(40)

    await vi.advanceTimersByTimeAsync(80)
    expect(state.parsedNodes.value.at(-1)?.raw).toBe(next.split('\n\n').at(-1))

    const data = logPerf.mock.calls.at(-1)?.[1]
    const streamDelta = data?.streamDelta as { appendHits?: number, tailHits?: number, cacheHits?: number } | undefined

    expect(data).toMatchObject({
      parseCommitCount: 2,
      parseCoalescedCount: expect.any(Number),
      nodeReuseMs: expect.any(Number),
      streamDelta: expect.any(Object),
    })
    expect(data?.parseCoalescedCount).toBeGreaterThan(0)
    expect(data?.nodeReuseMs).toBeGreaterThanOrEqual(0)
    expect((streamDelta?.appendHits ?? 0) + (streamDelta?.tailHits ?? 0) + (streamDelta?.cacheHits ?? 0)).toBeGreaterThan(0)

    scope.stop()
  })

  it('keeps synthetic token-heavy append parses on the stream parser budget path', () => {
    const md = getMarkdown('token-heavy-budget')
    const content = buildTokenHeavyMarkdown(160)
    const timing: {
      tokenCloneMs?: number
      parseMarkdownToStructureTotalMs?: number
    } = {}

    parseMarkdownToStructure(content, md, { streamParse: true, __timing: timing } as any)
    const before = md.stream?.stats?.() as {
      appendHits?: number
      tailHits?: number
      cacheHits?: number
      fullParses?: number
    } | undefined

    parseMarkdownToStructure(`${content}Appended paragraph with [tail](https://example.com/tail) and **strong** text.\n\n`, md, {
      streamParse: true,
      __timing: timing,
    } as any)

    const after = md.stream?.stats?.() as typeof before
    const appendHits = (after?.appendHits ?? 0) - (before?.appendHits ?? 0)
    const tailHits = (after?.tailHits ?? 0) - (before?.tailHits ?? 0)
    const cacheHits = (after?.cacheHits ?? 0) - (before?.cacheHits ?? 0)
    const fullParses = (after?.fullParses ?? 0) - (before?.fullParses ?? 0)
    const tokenCloneMs = timing.tokenCloneMs ?? 0
    const totalMs = timing.parseMarkdownToStructureTotalMs ?? 0

    expect(appendHits + tailHits + cacheHits).toBeGreaterThan(0)
    expect(fullParses).toBeLessThanOrEqual(1)
    expect(tokenCloneMs).toBeLessThanOrEqual(totalMs * 0.35)
  })
})
