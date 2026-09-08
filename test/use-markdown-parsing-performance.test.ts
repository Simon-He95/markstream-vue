import type { Ref } from 'vue'
import type { NodeRendererProps } from '../src/types/node-renderer-props'
import { clearRegisteredMarkdownPlugins, getMarkdown, parseMarkdownToStructure, registerMarkdownPlugin } from 'stream-markdown-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, reactive, ref, watch } from 'vue'
import { streamContent } from '../playground/src/const/markdown'
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

function findCodeBlocks(nodes: any[]) {
  const result: any[] = []
  const visit = (items: any[]) => {
    for (const node of items) {
      if (node?.type === 'code_block')
        result.push(node)
      if (Array.isArray(node?.children))
        visit(node.children)
    }
  }
  visit(nodes)
  return result
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
    clearRegisteredMarkdownPlugins()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('never reclassifies markdown after a streamed diagram fence as plain code', () => {
    const markdown = [
      '```mermaid',
      'graph LR',
      '  A --> B',
      '```',
      '',
      '```infographic',
      'infographic list-row-simple-horizontal-arrow',
      'data',
      '  items',
      '    - label 步骤 3',
      '      desc 完成',
      '```',
      '',
      '---',
      '# 复杂数学公式',
      '',
      '### 1. **理解 \\(\\boldsymbol{\\alpha}^T \\boldsymbol{\\beta} = 0\\) 的含义**',
      '普通正文。',
      '',
    ].join('\n')
    const content = ref('')
    const { scope, state } = createParsingState(content)

    for (let end = 1; end <= markdown.length; end++) {
      content.value = markdown.slice(0, end)
      for (const block of findCodeBlocks(state.parsedNodes.value)) {
        expect(block.code, `prefix length ${end}`).not.toContain('复杂数学公式')
        expect(block.code, `prefix length ${end}`).not.toContain('boldsymbol')
      }
    }

    scope.stop()
  })

  it('keeps the real playground diagram chain closed while its math section streams', () => {
    const diagramStart = streamContent.indexOf('```mermaid\ngraph TD')
    const mathEnd = streamContent.indexOf('### 2.', streamContent.indexOf('# 复杂数学公式'))
    const streamedSection = streamContent.slice(diagramStart, mathEnd)
    const content = ref(streamContent.slice(0, diagramStart))
    const { scope, state } = createParsingState(content)

    for (let end = 1; end <= streamedSection.length; end++) {
      content.value = streamContent.slice(0, diagramStart + end)
      for (const block of findCodeBlocks(state.parsedNodes.value)) {
        expect(block.code, `playground prefix length ${diagramStart + end}`).not.toContain('复杂数学公式')
        expect(block.code, `playground prefix length ${diagramStart + end}`).not.toContain('boldsymbol')
      }
    }

    scope.stop()
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

  it('reuses unchanged prefix when final flushes coalesced smooth-streaming content', () => {
    vi.useFakeTimers()

    const firstParagraph = 'alpha '.repeat(20).trim()
    const secondParagraph = 'beta '.repeat(20).trim()
    const initial = `${firstParagraph}\n\n${secondParagraph}`
    const next = `${initial} gamma`
    const content = ref(initial)
    const smooth = ref(true)
    const { final, scope, state } = createParsingState(content, smooth, {
      parseCoalesceMs: 1000,
    })
    const first = state.parsedNodes.value
    const reset = vi.spyOn((state.mdInstance.value as any).stream, 'reset')

    expect(first).toHaveLength(2)

    content.value = next

    // Appended text has no block boundary, so smooth parsing should still be
    // coalesced until final forces a flush.
    expect(state.parsedNodes.value).toBe(first)

    final.value = true
    const second = state.parsedNodes.value

    expect(reset).toHaveBeenCalled()
    expect(second[0]).toBe(first[0])
    expect(second[1]).not.toBe(first[1])
    expect(second[1]?.raw).toBe(`${secondParagraph} gamma`)

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

  it('flushes pending coalesced content when enabling source maps', () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const next = `${initial} world`
    const content = ref(initial)
    const smooth = ref(true)
    const { props, scope, state } = createParsingState(content, smooth)

    expect(state.parsedNodes.value[0]?.raw).toBe(initial)
    expect(state.parsedNodes.value[0]?.sourceMap).toBeUndefined()

    content.value = next
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    props.parseOptions = { includeSourceMap: true }

    expect(state.parsedNodes.value[0]?.raw).toBe(next)
    expect(state.parsedNodes.value[0]?.sourceMap).toEqual({ startLine: 0, endLine: 1 })

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

  it('coalesces table row pipes until a delimiter line appears', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const content = ref(initial)
    const smooth = ref(true)
    const { scope, state } = createParsingState(content, smooth, { parseCoalesceMs: 1000 })

    content.value = `${initial}\n| A | B |`
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    content.value = `${content.value}\n| - | - |`
    expect(state.parsedNodes.value[0]?.type).toBe('paragraph')
    expect(state.parsedNodes.value[1]?.type).toBe('table')

    await vi.advanceTimersByTimeAsync(1000)
    expect(state.parsedNodes.value[1]?.type).toBe('table')

    scope.stop()
  })

  it('coalesces a table header row with trailing newline until a delimiter line appears', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const content = ref(initial)
    const smooth = ref(true)
    const { scope, state } = createParsingState(content, smooth, { parseCoalesceMs: 1000 })

    content.value = `${initial}\n| A | B |\n`
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    content.value = `${content.value}| - | - |`
    expect(state.parsedNodes.value[0]?.type).toBe('paragraph')
    expect(state.parsedNodes.value[1]?.type).toBe('table')

    scope.stop()
  })

  it('flushes immediately on a Setext heading underline', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const content = ref(initial)
    const smooth = ref(true)
    const { scope, state } = createParsingState(content, smooth, { parseCoalesceMs: 1000 })

    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    // A Setext underline is a structural boundary: the previous line is
    // re-rendered as a heading immediately, without waiting for the coalesce
    // window (unlike a bare trailing newline).
    content.value = `${initial}\n===`
    expect(state.parsedNodes.value[0]?.type).toBe('heading')
    expect(state.parsedNodes.value[0]?.level).toBe(1)

    scope.stop()
  })

  it('flushes immediately on a thematic break line', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const content = ref(initial)
    const smooth = ref(true)
    const { scope, state } = createParsingState(content, smooth, { parseCoalesceMs: 1000 })

    content.value = `${initial}\n\n---`
    expect(state.parsedNodes.value[0]?.type).toBe('paragraph')
    expect(state.parsedNodes.value[1]?.type).toBe('thematic_break')

    scope.stop()
  })

  it('coalesces a plain hard line break until the parse interval elapses', async () => {
    vi.useFakeTimers()
    const initial = 'hello '.repeat(18).trim()
    const content = ref(initial)
    const smooth = ref(true)
    const { scope, state } = createParsingState(content, smooth, { parseCoalesceMs: 1000 })

    // A bare trailing newline (soft break inside a paragraph) is NOT an
    // immediate-flush trigger: the parse waits for the coalesce window. This
    // is the accepted performance trade-off — final rendering is unaffected.
    content.value = `${initial}\nworld`
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(999)
    expect(state.parsedNodes.value[0]?.raw).toBe(initial)

    await vi.advanceTimersByTimeAsync(1)
    expect(state.parsedNodes.value[0]?.raw).toBe(`${initial}\nworld`)

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

  it('reuses unchanged ParsedNode references with source maps enabled after append parses', () => {
    const content = ref('# alpha\n\nbeta')
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        includeSourceMap: true,
        streamParse: false,
      },
    })
    const first = state.parsedNodes.value

    expect(first[0]?.sourceMap).toEqual({ startLine: 0, endLine: 1 })
    expect(first[1]?.sourceMap).toEqual({ startLine: 2, endLine: 3 })

    content.value = '# alpha\n\nbeta\n\ngamma'
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

  it('reuses unchanged ParsedNode references across final-only transitions', () => {
    const content = ref('alpha\n\nbeta')
    const { final, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value
    const reset = vi.spyOn((state.mdInstance.value as any).stream, 'reset')

    final.value = true
    const second = state.parsedNodes.value

    expect(reset).toHaveBeenCalled()
    expect(second).toBe(first)
    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])

    scope.stop()
  })

  it('does not notify parsedNodes watchers when final-only output is identical', () => {
    const content = ref('alpha\n\nbeta')
    const { final, scope, state } = createParsingState(content)
    const first = state.parsedNodes.value
    const parsedNodesChanged = vi.fn()
    const stop = watch(state.parsedNodes, parsedNodesChanged, { flush: 'sync' })

    final.value = true

    expect(state.parsedNodes.value).toBe(first)
    expect(parsedNodesChanged).not.toHaveBeenCalled()

    stop()
    scope.stop()
  })

  it('reuses unchanged ParsedNode references across final-only transitions with streamParse auto', () => {
    const content = ref('alpha\n\nbeta')
    const { final, scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        streamParse: 'auto',
      },
    })
    const first = state.parsedNodes.value
    const reset = vi.spyOn((state.mdInstance.value as any).stream, 'reset')

    final.value = true
    const second = state.parsedNodes.value

    expect(reset).toHaveBeenCalled()
    expect(second).toBe(first)
    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])

    scope.stop()
  })

  it('reuses unchanged prefix but replaces final-sensitive nodes when final changes', () => {
    const content = ref([
      'alpha',
      '',
      '<details>',
      '<summary>Steps</summary>',
      'body',
    ].join('\n'))
    const { final, scope, state } = createParsingState(content)

    const first = state.parsedNodes.value
    const firstPrefix = first[0]
    const firstDetails = first[1] as any

    expect(firstPrefix?.raw).toBe('alpha')
    expect(firstDetails?.type).toBe('html_block')
    expect(firstDetails?.loading).toBe(true)

    final.value = true
    const second = state.parsedNodes.value
    const secondDetails = second[1] as any

    expect(second[0]).toBe(firstPrefix)
    expect(secondDetails).not.toBe(firstDetails)
    expect(secondDetails?.type).toBe('html_block')
    expect(secondDetails?.loading).toBe(false)

    scope.stop()
  })

  it('replaces final-sensitive tail but reuses prefix with streamParse auto', () => {
    const content = ref([
      'alpha',
      '',
      '<details>',
      '<summary>Steps</summary>',
      'body',
    ].join('\n'))
    const { final, scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        streamParse: 'auto',
      },
    })

    const first = state.parsedNodes.value
    const firstPrefix = first[0]
    const firstDetails = first[1] as any

    expect(firstPrefix?.raw).toBe('alpha')
    expect(firstDetails?.type).toBe('html_block')
    expect(firstDetails?.loading).toBe(true)

    final.value = true
    const second = state.parsedNodes.value
    const secondDetails = second[1] as any

    expect(second[0]).toBe(firstPrefix)
    expect(secondDetails).not.toBe(firstDetails)
    expect(secondDetails?.type).toBe('html_block')
    expect(secondDetails?.loading).toBe(false)

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

  it('does not reuse stale ParsedNode references when postTransformNodes changes', () => {
    const content = ref('hello')
    const { props, scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        postTransformNodes: nodes => nodes.map(node => ({ ...node, data: { marker: 'first' } })),
      },
    })
    const first = state.parsedNodes.value[0] as any
    const reset = vi.spyOn((state.mdInstance.value as any).stream, 'reset')

    props.parseOptions = {
      postTransformNodes: nodes => nodes.map(node => ({ ...node, data: { marker: 'second' } })),
    }
    const second = state.parsedNodes.value[0] as any

    expect(second).not.toBe(first)
    expect(second?.data).toEqual({ marker: 'second' })
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

  it('keeps a previously customized markdown-it instance on the sync parser path', () => {
    const headings = (count: number) => `${Array.from({ length: count }, (_, index) => `# Heading ${index + 1}`).join('\n\n')}\n\n`
    const content = ref(headings(40))
    const { props, scope, state } = createParsingState(content, ref(false), {
      customMarkdownIt: (md: any) => {
        if (md.__headingCountInstalled)
          return md
        md.__headingCountInstalled = true
        md.core.ruler.push('test_heading_count', (parserState: any) => {
          const headingTokens = (parserState.tokens ?? []).filter((token: any) => token.type === 'heading_open')
          for (const token of headingTokens)
            setTokenAttr(token, 'data-total', String(headingTokens.length))
        })
        return md
      },
    })

    expect((state.parsedNodes.value[0] as any)?.attrs?.['data-total']).toBe('40')

    props.customMarkdownIt = undefined
    content.value += '# Heading 41\n\n'

    expect((state.parsedNodes.value[0] as any)?.attrs?.['data-total']).toBe('41')
    expect((state.mdInstance.value as any).stream.stats().total).toBe(0)

    scope.stop()
  })

  it('does not reuse renderer-owned parser nodes across custom component mutation boundaries', () => {
    const content = ref(`${buildParagraphs(40)}\n\n`)
    const customComponents = ref<Record<string, unknown>>({ paragraph: {} })
    const props = reactive({
      parseOptions: { reuseStableTopLevelNodes: true } as any,
    } as NodeRendererProps)
    const scope = effectScope()
    const state = scope.run(() => useMarkdownParsing(props, {
      instanceMsgId: 'custom-component-mutation-boundary',
      renderContent: computed(() => content.value),
      effectiveFinal: computed(() => false),
      debugPerformanceEnabled: computed(() => false),
      customComponentsMap: computed(() => customComponents.value),
      logPerf: vi.fn(),
    }))

    if (!state) {
      throw new Error('failed to create parsing state')
    }

    ;(state.parsedNodes.value[0] as any).raw = 'caller mutation'
    ;(state.parsedNodes.value[0] as any).children[0].content = 'caller mutation'
    customComponents.value = {}
    content.value += 'Appended paragraph.\n\n'

    expect(state.parsedNodes.value[0]?.raw).toContain('Paragraph 1')
    expect((state.parsedNodes.value[0] as any).children[0].content).toContain('Paragraph 1')

    scope.stop()
  })

  it('reuses settled built-in nodes alongside custom component mutation boundaries', () => {
    const content = ref([
      'Custom paragraph.',
      '',
      '```diff',
      '- old',
      '+ new',
      '```',
      '',
      'Streaming tail',
    ].join('\n'))
    const customComponents = ref<Record<string, unknown>>({ paragraph: {} })
    const props = reactive({} as NodeRendererProps)
    const scope = effectScope()
    const state = scope.run(() => useMarkdownParsing(props, {
      instanceMsgId: 'selective-custom-component-boundary',
      renderContent: computed(() => content.value),
      effectiveFinal: computed(() => false),
      debugPerformanceEnabled: computed(() => false),
      customComponentsMap: computed(() => customComponents.value),
      logPerf: vi.fn(),
    }))

    if (!state)
      throw new Error('failed to create parsing state')

    const firstParagraph = state.parsedNodes.value[0]
    const firstCodeBlock = state.parsedNodes.value[1]
    ;(firstParagraph as any).raw = 'caller mutation'
    content.value += ' chunk'

    expect(state.parsedNodes.value[0]).not.toBe(firstParagraph)
    expect(state.parsedNodes.value[0]?.raw).toBe('Custom paragraph.')
    expect(state.parsedNodes.value[1]).toBe(firstCodeBlock)

    scope.stop()
  })

  it('retains a custom boundary after the renderer mutates the node type', () => {
    const content = ref('Custom paragraph.\n\nStreaming tail')
    const props = reactive({} as NodeRendererProps)
    const scope = effectScope()
    const state = scope.run(() => useMarkdownParsing(props, {
      instanceMsgId: 'mutated-custom-component-type',
      renderContent: computed(() => content.value),
      effectiveFinal: computed(() => false),
      debugPerformanceEnabled: computed(() => false),
      customComponentsMap: computed(() => ({ paragraph: {} })),
      logPerf: vi.fn(),
    }))

    if (!state)
      throw new Error('failed to create parsing state')

    const previous = state.parsedNodes.value[0] as any
    previous.type = 'heading'
    previous.raw = 'caller mutation'
    content.value += ' chunk'

    expect(state.parsedNodes.value[0]).not.toBe(previous)
    expect(state.parsedNodes.value[0]?.type).toBe('paragraph')
    expect(state.parsedNodes.value[0]?.raw).toBe('Custom paragraph.')

    scope.stop()
  })

  it('keeps structured parser reuse for custom renderers absent from the document', () => {
    const content = ref(`${buildParagraphs(200)}\n\n`)
    const logPerf = vi.fn()
    const props = reactive({} as NodeRendererProps)
    const scope = effectScope()
    const state = scope.run(() => useMarkdownParsing(props, {
      instanceMsgId: 'custom-component-without-boundary',
      renderContent: computed(() => content.value),
      effectiveFinal: computed(() => false),
      debugPerformanceEnabled: computed(() => true),
      customComponentsMap: computed(() => ({ code_block: {} })),
      logPerf,
    }))

    if (!state)
      throw new Error('failed to create parsing state')

    const previous = state.parsedNodes.value
    content.value += 'Appended paragraph.\n\n'
    void state.parsedNodes.value
    content.value += 'Second appended paragraph.\n\n'
    const next = state.parsedNodes.value

    expect(next.slice(0, previous.length)).toEqual(previous)
    expect(next.slice(0, previous.length).every((node, index) => node === previous[index])).toBe(true)
    expect(logPerf.mock.calls.at(-1)?.[1]?.processTokensReusedTopLevelNodes).toBeGreaterThan(0)

    scope.stop()
  })

  it('does not reuse aggregate nodes containing custom-rendered descendants', () => {
    const content = ref([
      '| Column |',
      '| --- |',
      '| Value |',
      '',
      'Streaming tail',
    ].join('\n'))
    const props = reactive({} as NodeRendererProps)
    const scope = effectScope()
    const state = scope.run(() => useMarkdownParsing(props, {
      instanceMsgId: 'nested-custom-component-boundary',
      renderContent: computed(() => content.value),
      effectiveFinal: computed(() => false),
      debugPerformanceEnabled: computed(() => false),
      customComponentsMap: computed(() => ({ text: {} })),
      logPerf: vi.fn(),
    }))

    if (!state)
      throw new Error('failed to create parsing state')

    const firstTable = state.parsedNodes.value[0] as any
    firstTable.header.cells[0].children[0].content = 'caller mutation'
    content.value += ' chunk'

    expect(state.parsedNodes.value[0]).not.toBe(firstTable)
    expect((state.parsedNodes.value[0] as any).header.cells[0].children[0].content).toBe('Column')

    scope.stop()
  })

  it('treats a custom d2 renderer as the boundary for d2lang fences', () => {
    const content = ref([
      '```d2lang',
      'a -> b',
      '```',
      '',
      'Streaming tail',
    ].join('\n'))
    const props = reactive({} as NodeRendererProps)
    const scope = effectScope()
    const state = scope.run(() => useMarkdownParsing(props, {
      instanceMsgId: 'd2lang-custom-component-boundary',
      renderContent: computed(() => content.value),
      effectiveFinal: computed(() => false),
      debugPerformanceEnabled: computed(() => false),
      customComponentsMap: computed(() => ({ d2: {} })),
      logPerf: vi.fn(),
    }))

    if (!state)
      throw new Error('failed to create parsing state')

    const firstCodeBlock = state.parsedNodes.value[0] as any
    firstCodeBlock.code = 'caller mutation'
    content.value += ' chunk'

    expect(state.parsedNodes.value[0]).not.toBe(firstCodeBlock)
    expect((state.parsedNodes.value[0] as any).code).toBe('a -> b\n')

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

  it('does not reuse a custom node when long same-length string content changes after the old sampled prefix', () => {
    let dynamicContent = `${'a'.repeat(9000)}MID-A${'z'.repeat(5000)}`
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

    expect(firstChart?.content).toContain('MID-A')

    dynamicContent = `${'a'.repeat(9000)}MID-B${'z'.repeat(5000)}`
    content.value = `${content.value}\n\nAppended paragraph.`

    const secondParagraph = state.parsedNodes.value[0] as any
    const secondChart = secondParagraph.children?.[0]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(secondChart).not.toBe(firstChart)
    expect(secondChart?.content).toContain('MID-B')

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

  it('does not prime stable prefix signatures for unchanged large string fields', () => {
    const largeLine = 'x'.repeat(100_000)
    const content = ref([
      '```ts',
      largeLine,
      '```',
      '',
      'tail',
    ].join('\n'))
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)
    const firstCode = state.parsedNodes.value[0]

    try {
      logPerf.mockClear()
      content.value = `${content.value}\n\nappend`

      expect(state.parsedNodes.value[0]).toBe(firstCode)

      const data = logPerf.mock.calls.at(-1)?.[1]
      expect(data?.dirtyStartIndex).toBeGreaterThanOrEqual(1)
      expect(data?.stabilizeSignatureCallCount).toBeLessThanOrEqual(data?.dirtyStartIndex)
      expect(data?.primeSignatureCallCount).toBeLessThanOrEqual(2)
    }
    finally {
      scope.stop()
    }
  })

  it('logs stream stats deltas when debug performance is enabled', () => {
    const content = ref('alpha')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(1)

    const data = logPerf.mock.calls.at(-1)?.[1]
    expect(data).toMatchObject({
      nodeReuseMs: expect.any(Number),
      signatureMs: expect.any(Number),
      stabilizeSignatureMs: expect.any(Number),
      primeSignatureMs: expect.any(Number),
      signatureCallCount: expect.any(Number),
      stabilizeSignatureCallCount: expect.any(Number),
      primeSignatureCallCount: expect.any(Number),
      stabilizeMs: expect.any(Number),
      reusedNodeCount: 0,
      dirtyStartIndex: 0,
      stablePrefixNodeCount: 0,
      dirtyTailNodeCount: 1,
      streamDelta: expect.objectContaining({
        total: expect.any(Number),
      }),
      streamStats: expect.any(Object),
    })
    expect(data?.nodeReuseMs).toBeGreaterThanOrEqual(0)
    expect(data?.signatureMs).toBeGreaterThanOrEqual(0)
    expect(data?.stabilizeSignatureMs).toBe(0)
    expect(data?.primeSignatureMs).toBeGreaterThanOrEqual(0)
    expect(data?.signatureMs).toBe(data?.stabilizeSignatureMs + data?.primeSignatureMs)
    expect(data?.stabilizeSignatureCallCount).toBe(0)
    expect(data?.primeSignatureCallCount).toBe(1)
    expect(data?.signatureCallCount).toBe(data?.stabilizeSignatureCallCount + data?.primeSignatureCallCount)
    expect(data?.stabilizeMs).toBeGreaterThanOrEqual(0)
    expect(typeof data?.streamMode === 'string' || data?.streamMode == null).toBe(true)

    scope.stop()
  })

  it('logs stabilize dirty range metrics for append reuse', () => {
    const content = ref(buildParagraphs(3))
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(3)
    logPerf.mockClear()

    content.value = `${content.value}\n\nAppended paragraph.`
    expect(state.parsedNodes.value.length).toBe(4)

    const data = logPerf.mock.calls.at(-1)?.[1]
    expect(data).toMatchObject({
      parseCommitCount: 2,
      nodeReuseMs: expect.any(Number),
      signatureMs: expect.any(Number),
      stabilizeSignatureMs: expect.any(Number),
      primeSignatureMs: expect.any(Number),
      signatureCallCount: expect.any(Number),
      stabilizeSignatureCallCount: expect.any(Number),
      primeSignatureCallCount: expect.any(Number),
      stabilizeMs: expect.any(Number),
      reusedNodeCount: 3,
      dirtyStartIndex: 3,
      stablePrefixNodeCount: 3,
      dirtyTailNodeCount: 1,
    })
    expect(data?.nodeReuseMs).toBeGreaterThanOrEqual(0)
    expect(data?.signatureMs).toBeGreaterThanOrEqual(0)
    expect(data?.stabilizeSignatureMs).toBeGreaterThanOrEqual(0)
    expect(data?.primeSignatureMs).toBeGreaterThanOrEqual(0)
    expect(data?.signatureMs).toBe(data?.stabilizeSignatureMs + data?.primeSignatureMs)
    expect(data?.stabilizeSignatureCallCount).toBeGreaterThan(0)
    expect(data?.primeSignatureCallCount).toBeGreaterThan(0)
    expect(data?.signatureCallCount).toBe(data?.stabilizeSignatureCallCount + data?.primeSignatureCallCount)
    expect(data?.stabilizeMs).toBeGreaterThanOrEqual(0)

    scope.stop()
  })

  it('primes signatures only for the dirty tail after append reuse', () => {
    const content = ref(buildParagraphs(6))
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(6)
    logPerf.mockClear()

    content.value = `${content.value}\n\nAppended paragraph.`
    expect(state.parsedNodes.value.length).toBe(7)

    const data = logPerf.mock.calls.at(-1)?.[1]
    expect(data).toMatchObject({
      reusedNodeCount: 6,
      dirtyStartIndex: 6,
      stablePrefixNodeCount: 6,
      dirtyTailNodeCount: 1,
      primeSignatureCallCount: 1,
    })

    scope.stop()
  })

  it('skips repeated signature scans for a previously stable append prefix', () => {
    const content = ref(buildParagraphs(20))
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(20)

    content.value = `${content.value}\n\nFirst appended paragraph.`
    expect(state.parsedNodes.value.length).toBe(21)

    const firstAppendData = logPerf.mock.calls.at(-1)?.[1]
    expect(firstAppendData).toMatchObject({
      dirtyStartIndex: 20,
      stablePrefixNodeCount: 20,
    })

    logPerf.mockClear()
    content.value = `${content.value}\n\nSecond appended paragraph.`
    expect(state.parsedNodes.value.length).toBe(22)

    const secondAppendData = logPerf.mock.calls.at(-1)?.[1]
    expect(secondAppendData).toMatchObject({
      dirtyStartIndex: 21,
      stablePrefixNodeCount: 21,
    })
    expect(secondAppendData?.stabilizeSignatureCallCount).toBeLessThanOrEqual(2)

    scope.stop()
  })

  it('scans only the appended delta after priming global reference detection', () => {
    const content = ref(buildParagraphs(20))
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    content.value += '\n\nFirst appended paragraph.'
    expect(state.parsedNodes.value).toHaveLength(21)

    content.value += '\n\nSecond appended paragraph.'
    expect(state.parsedNodes.value).toHaveLength(22)

    logPerf.mockClear()
    const appended = '\n\nThird appended paragraph.'
    content.value += appended
    expect(state.parsedNodes.value).toHaveLength(23)

    expect(logPerf.mock.calls.at(-1)?.[1]).toMatchObject({
      dirtyStartIndex: 22,
      stablePrefixNodeCount: 22,
      referenceDefinitionScanChars: appended.length,
    })

    scope.stop()
  })

  it('does not let an old reference definition force every later append to rescan the prefix', () => {
    const content = ref('[foo][bar] and [new][baz]\n\n[bar]: https://example.com\n\nstable tail')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(paragraphChildren(state.parsedNodes.value[0]).some(child => child.type === 'link')).toBe(true)

    content.value += '\n\nFirst appended paragraph.'
    expect(state.parsedNodes.value.at(-1)?.raw).toBe('First appended paragraph.')

    content.value += '\n\nSecond appended paragraph.'
    expect(state.parsedNodes.value.at(-1)?.raw).toBe('Second appended paragraph.')

    logPerf.mockClear()
    content.value += '\n\nThird appended paragraph.'
    expect(state.parsedNodes.value.at(-1)?.raw).toBe('Third appended paragraph.')

    expect(logPerf.mock.calls.at(-1)?.[1]).toMatchObject({
      dirtyStartIndex: 4,
      stablePrefixNodeCount: 4,
    })

    logPerf.mockClear()
    content.value += '\n\n[baz]: https://example.com\n'
    expect(state.parsedNodes.value.at(-1)?.raw).toBe('Third appended paragraph.')
    const resolvedLinks = paragraphChildren(state.parsedNodes.value[0])
      .filter(child => child.type === 'link') as Array<{ href?: string }>
    expect(resolvedLinks).toHaveLength(2)
    expect(resolvedLinks[1]?.href).toBe('https://example.com')
    expect(logPerf.mock.calls.at(-1)?.[1]).toMatchObject({
      dirtyStartIndex: 0,
      stablePrefixNodeCount: 0,
    })

    scope.stop()
  })

  it('does not skip prefix scans when appended reference definitions can affect earlier nodes', () => {
    const content = ref('[foo][bar]\n\nstable tail')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    const firstParagraph = state.parsedNodes.value[0]
    expect(paragraphChildren(firstParagraph).some(child => child.type === 'link')).toBe(false)

    content.value = `${content.value}\n\nappend`
    expect(state.parsedNodes.value.at(-1)?.raw).toBe('append')

    logPerf.mockClear()
    content.value = `${content.value}\n\n[bar]: https://example.com\n`
    const secondParagraph = state.parsedNodes.value[0]
    const data = logPerf.mock.calls.at(-1)?.[1]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(paragraphChildren(secondParagraph).some(child => child.type === 'link')).toBe(true)
    expect(data).toMatchObject({
      dirtyStartIndex: 0,
      stablePrefixNodeCount: 0,
    })

    scope.stop()
  })

  it('tracks reference labels and separators across append boundaries', () => {
    for (const chunks of [
      ['[bar', ']', ': https://example.com\n'],
      ['[foo\\', ']bar]', ': https://example.com\n'],
    ]) {
      const reference = chunks[0].startsWith('[bar') ? 'bar' : 'foo\\]bar'
      const content = ref(`[x][${reference}]\n\nstable tail\n\n`)
      const logPerf = vi.fn()
      const { scope, state } = createParsingState(content, ref(false), {
        parseOptions: { streamParse: false },
      }, ref(true), logPerf)
      const firstParagraph = state.parsedNodes.value[0]

      for (const chunk of chunks) {
        content.value += chunk
        void state.parsedNodes.value
      }

      expect(state.parsedNodes.value[0]).not.toBe(firstParagraph)
      expect(paragraphChildren(state.parsedNodes.value[0]).some(child => child.type === 'link')).toBe(true)
      expect(logPerf.mock.calls.at(-1)?.[1]).toMatchObject({
        dirtyStartIndex: 0,
        stablePrefixNodeCount: 0,
      })
      scope.stop()
    }
  })

  it('tracks CRLF reference states across append boundaries', () => {
    const scenarios = [
      {
        initial: '[x][foo bar]\r\nstable tail\r\n\r\n',
        chunks: ['[foo\r', '\nbar]', ': https://example.com\r', '\n'],
        href: 'https://example.com',
      },
      {
        initial: '[x][bar]\r\nstable tail\r\n\r\n',
        chunks: ['[bar]', ':', '\r', '\n https://example.com\r', '\n'],
        href: 'https://example.com',
      },
    ]

    for (const scenario of scenarios) {
      const content = ref(scenario.initial)
      const logPerf = vi.fn()
      const { scope, state } = createParsingState(content, ref(false), {
        parseOptions: { streamParse: false },
      }, ref(true), logPerf)
      const firstParagraph = state.parsedNodes.value[0]

      for (const chunk of scenario.chunks) {
        content.value += chunk
        void state.parsedNodes.value
      }

      const link = paragraphChildren(state.parsedNodes.value[0])
        .find(child => child.type === 'link') as { href?: string } | undefined
      const performedFullPrefixScan = logPerf.mock.calls.some(([, data]) => (
        data.dirtyStartIndex === 0 && data.stablePrefixNodeCount === 0
      ))
      expect(state.parsedNodes.value[0]).not.toBe(firstParagraph)
      expect(link?.href).toBe(scenario.href)
      expect(performedFullPrefixScan).toBe(true)
      scope.stop()
    }
  })

  it('clears pending reference state after a CRLF blank line', () => {
    const content = ref(`${buildParagraphs(4)}\r\n\r\n[unused]: https://example.com\r`)
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: { streamParse: false },
    }, ref(true), logPerf)

    content.value += '\n\r'
    void state.parsedNodes.value
    content.value += '\n'
    void state.parsedNodes.value
    content.value += 'ordinary tail'
    void state.parsedNodes.value

    logPerf.mockClear()
    const appended = ' continues'
    content.value += appended
    void state.parsedNodes.value

    expect(logPerf.mock.calls.at(-1)?.[1]).toMatchObject({
      referenceDefinitionScanChars: appended.length,
    })
    expect(logPerf.mock.calls.at(-1)?.[1]?.dirtyStartIndex).toBeGreaterThan(0)
    scope.stop()
  })

  it('does not skip prefix scans when escaped reference definitions can affect earlier nodes', () => {
    const content = ref('[x][foo\\]bar]\n\nstable tail')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    const firstParagraph = state.parsedNodes.value[0]
    expect(paragraphChildren(firstParagraph).some(child => child.type === 'link')).toBe(false)

    content.value = `${content.value}\n\nappend`
    expect(state.parsedNodes.value.at(-1)?.raw).toBe('append')

    logPerf.mockClear()
    content.value = `${content.value}\n\n[foo\\]bar]: https://example.com\n`
    const secondParagraph = state.parsedNodes.value[0]
    const data = logPerf.mock.calls.at(-1)?.[1]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(paragraphChildren(secondParagraph).some(child => child.type === 'link')).toBe(true)
    expect(data).toMatchObject({
      dirtyStartIndex: 0,
      stablePrefixNodeCount: 0,
    })

    scope.stop()
  })

  it('does not skip prefix scans when multiline reference definitions can affect earlier nodes', () => {
    const content = ref('[x][foo bar]\n\nstable tail')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        streamParse: false,
      },
    }, ref(true), logPerf)

    const firstParagraph = state.parsedNodes.value[0]
    expect(paragraphChildren(firstParagraph).some(child => child.type === 'link')).toBe(false)

    content.value = `${content.value}\n\nappend`
    expect(state.parsedNodes.value.at(-1)?.raw).toBe('append')

    logPerf.mockClear()
    content.value = `${content.value}\n\n[foo\nbar]: https://example.com\n`
    const secondParagraph = state.parsedNodes.value[0]
    const data = logPerf.mock.calls.at(-1)?.[1]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(paragraphChildren(secondParagraph).some(child => child.type === 'link')).toBe(true)
    expect(data).toMatchObject({
      dirtyStartIndex: 0,
      stablePrefixNodeCount: 0,
    })

    scope.stop()
  })

  it('does not skip prefix scans when an append completes a pending reference definition', () => {
    for (const [partialDefinition, completion] of [
      ['[bar]: <https://example.com', '>'],
      [`[bar]:${' '.repeat(5000)}`, 'https://example.com'],
    ]) {
      const content = ref('[foo][bar]\n\nstable tail')
      const logPerf = vi.fn()
      const { scope, state } = createParsingState(content, ref(false), {
        parseOptions: {
          streamParse: false,
        },
      }, ref(true), logPerf)

      const firstParagraph = state.parsedNodes.value[0]
      expect(paragraphChildren(firstParagraph).some(child => child.type === 'link')).toBe(false)

      content.value = `${content.value}\n\n${partialDefinition}`
      expect(paragraphChildren(state.parsedNodes.value[0]).some(child => child.type === 'link')).toBe(false)

      logPerf.mockClear()
      content.value = `${content.value}${completion}`
      const secondParagraph = state.parsedNodes.value[0]
      const data = logPerf.mock.calls.at(-1)?.[1]

      expect(secondParagraph).not.toBe(firstParagraph)
      expect(paragraphChildren(secondParagraph).some(child => child.type === 'link')).toBe(true)
      expect(data).toMatchObject({
        dirtyStartIndex: 0,
        stablePrefixNodeCount: 0,
      })

      scope.stop()
    }
  })

  it('does not skip prefix scans when chunked container reference definitions can affect earlier nodes', () => {
    for (const chunks of [
      ['\n\n> [bar', ']', ': https://example.com\n'],
      ['\n\n- [bar', ']', ': https://example.com\n'],
      ['\n\n1. [bar', ']', ': https://example.com\n'],
    ]) {
      const content = ref('[foo][bar]\n\nstable tail\n\nappend')
      const logPerf = vi.fn()
      const { scope, state } = createParsingState(content, ref(false), {
        parseOptions: {
          streamParse: false,
        },
      }, ref(true), logPerf)

      const firstParagraph = state.parsedNodes.value[0]
      expect(paragraphChildren(firstParagraph).some(child => child.type === 'link')).toBe(false)

      for (const chunk of chunks) {
        content.value += chunk
        void state.parsedNodes.value
      }
      const secondParagraph = state.parsedNodes.value[0]
      const data = logPerf.mock.calls.at(-1)?.[1]

      expect(secondParagraph).not.toBe(firstParagraph)
      expect(paragraphChildren(secondParagraph).some(child => child.type === 'link')).toBe(true)
      expect(data).toMatchObject({
        dirtyStartIndex: 0,
        stablePrefixNodeCount: 0,
      })

      scope.stop()
    }
  })

  it('matches fresh parsing while reference definitions stream across scanner boundaries', () => {
    const fixtures = [
      {
        initial: '[x][bar]\n\nstable tail\n\n',
        chunks: ['[bar', ']', ': https://example.com\n'],
      },
      {
        initial: '[x][bar]\r\n\r\nstable tail\r\n\r\n',
        chunks: ['[bar]\r', '\n:', ' https://example.com\r', '\n'],
      },
      {
        initial: String.raw`[x][foo\]bar]

stable tail

`,
        chunks: ['[foo\\', ']bar]', ': https://example.com\n'],
      },
      {
        initial: String.raw`[x][foo\\bar]

stable tail

`,
        chunks: [String.raw`[foo\\`, 'bar]', ': https://example.com\n'],
      },
      {
        initial: '[x][foo bar]\n\nstable tail\n\n',
        chunks: ['[foo\n', 'bar]', ': https://example.com\n'],
      },
      {
        initial: '[x][bar]\n\nstable tail\n\n',
        chunks: ['[bar]:', ' https://example.com\n', '  "title"\n'],
      },
      {
        initial: '[x][bar]\n\nstable tail',
        chunks: ['\n\n> [bar', ']', ': https://example.com\n'],
      },
      {
        initial: '[x][missing]\n\nstable tail\n\n',
        chunks: ['[missing]', '\n', '\n', ': https://example.com\n'],
      },
    ]

    fixtures.forEach((fixture, fixtureIndex) => {
      const content = ref(fixture.initial)
      const { scope, state } = createParsingState(content, ref(false), {
        parseOptions: { streamParse: false },
      })

      fixture.chunks.forEach((chunk, chunkIndex) => {
        content.value += chunk
        const fresh = parseMarkdownToStructure(
          content.value,
          getMarkdown(`reference-differential-${fixtureIndex}-${chunkIndex}`),
          { streamParse: false },
        )
        expect(state.parsedNodes.value).toEqual(fresh)
      })

      scope.stop()
    })
  })

  it('does not skip prefix scans when final parsing can change earlier nodes', () => {
    const content = ref('alpha *open\n\nstable tail')
    const logPerf = vi.fn()
    const { final, scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    const firstParagraph = state.parsedNodes.value[0]
    expect(paragraphChildren(firstParagraph).some(child => child.type === 'emphasis')).toBe(true)

    content.value = `${content.value}\n\nappend`
    expect(state.parsedNodes.value.at(-1)?.raw).toBe('append')

    logPerf.mockClear()
    final.value = true
    const secondParagraph = state.parsedNodes.value[0]
    const data = logPerf.mock.calls.at(-1)?.[1]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(paragraphChildren(secondParagraph).some(child => child.type === 'emphasis')).toBe(false)
    expect(data).toMatchObject({
      dirtyStartIndex: 0,
      stablePrefixNodeCount: 0,
    })

    scope.stop()
  })

  it('does not skip prefix scans when registered markdown plugins can affect earlier nodes', () => {
    registerMarkdownPlugin((md: any) => {
      md.core.ruler.push('test_global_prefix_mutation', (parserState: any) => {
        if (!String(parserState.src ?? '').includes('mutate-prefix'))
          return

        for (const token of parserState.tokens ?? []) {
          if (token.type === 'inline' && token.content === 'alpha') {
            token.content = 'alpha changed'
            token.children = [{ type: 'text', content: 'alpha changed' }]
            break
          }
        }
      })
    })

    const content = ref('alpha\n\nstable tail')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        streamParse: false,
      },
    }, ref(true), logPerf)

    const firstParagraph = state.parsedNodes.value[0]
    expect(firstParagraph?.raw).toBe('alpha')

    content.value = `${content.value}\n\nappend`
    expect(state.parsedNodes.value.at(-1)?.raw).toBe('append')

    logPerf.mockClear()
    content.value = `${content.value}\n\nmutate-prefix`
    const secondParagraph = state.parsedNodes.value[0]
    const data = logPerf.mock.calls.at(-1)?.[1]

    expect(secondParagraph).not.toBe(firstParagraph)
    expect(secondParagraph?.raw).toBe('alpha changed')
    expect(data).toMatchObject({
      dirtyStartIndex: 0,
      stablePrefixNodeCount: 0,
    })

    scope.stop()
  })

  it('logs dirty tail range when appending into the last existing paragraph', () => {
    const content = ref('one\n\ntwo\n\nthree')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(3)
    logPerf.mockClear()

    content.value += ' appended tail'
    expect(state.parsedNodes.value.length).toBe(3)

    const data = logPerf.mock.calls.at(-1)?.[1]
    expect(data).toMatchObject({
      reusedNodeCount: 2,
      dirtyStartIndex: 2,
      stablePrefixNodeCount: 2,
      dirtyTailNodeCount: 1,
    })

    scope.stop()
  })

  it('reports dirty tail range including unchanged suffix nodes', () => {
    const content = ref('| Link |\n| - |\n| [x][ref] |\n\nlater\n\n')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(2)
    logPerf.mockClear()

    content.value += '[ref]: https://example.com\n'
    expect(state.parsedNodes.value.length).toBe(2)

    const data = logPerf.mock.calls.at(-1)?.[1]
    expect(data).toMatchObject({
      reusedNodeCount: 1,
      dirtyStartIndex: 0,
      stablePrefixNodeCount: 0,
      dirtyTailNodeCount: 2,
    })

    scope.stop()
  })

  it('reports dirty tail range when append parsing shrinks node count', () => {
    const content = ref('one\n\ntwo')
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {
      parseOptions: {
        postTransformTokens: tokens => tokens.some(token => token.content === 'drop-tail')
          ? tokens.slice(0, 3)
          : tokens,
      },
    }, ref(true), logPerf)

    expect(state.parsedNodes.value.length).toBe(2)
    logPerf.mockClear()

    content.value += '\n\ndrop-tail'
    expect(state.parsedNodes.value.length).toBe(1)

    const data = logPerf.mock.calls.at(-1)?.[1]
    expect(data).toMatchObject({
      reusedNodeCount: 1,
      dirtyStartIndex: 1,
      stablePrefixNodeCount: 1,
      dirtyTailNodeCount: 1,
    })

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
      signatureMs: expect.any(Number),
      stabilizeSignatureMs: expect.any(Number),
      primeSignatureMs: expect.any(Number),
      signatureCallCount: expect.any(Number),
      stabilizeSignatureCallCount: expect.any(Number),
      primeSignatureCallCount: expect.any(Number),
      stabilizeMs: expect.any(Number),
      reusedNodeCount: expect.any(Number),
      dirtyStartIndex: expect.any(Number),
      stablePrefixNodeCount: expect.any(Number),
      dirtyTailNodeCount: expect.any(Number),
      streamDelta: expect.any(Object),
    })
    expect(data?.parseCoalescedCount).toBeGreaterThan(0)
    expect(data?.nodeReuseMs).toBeGreaterThanOrEqual(0)
    expect(data?.signatureMs).toBeGreaterThanOrEqual(0)
    expect(data?.stabilizeSignatureMs).toBeGreaterThanOrEqual(0)
    expect(data?.primeSignatureMs).toBeGreaterThanOrEqual(0)
    expect(data?.signatureMs).toBe(data?.stabilizeSignatureMs + data?.primeSignatureMs)
    expect(data?.stabilizeSignatureCallCount).toBeGreaterThan(0)
    expect(data?.primeSignatureCallCount).toBeGreaterThan(0)
    expect(data?.signatureCallCount).toBe(data?.stabilizeSignatureCallCount + data?.primeSignatureCallCount)
    expect(data?.stabilizeMs).toBeGreaterThanOrEqual(0)
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

    parseMarkdownToStructure(content, md, { streamParse: true, parserMetrics: timing } as any)
    const before = md.stream?.stats?.() as {
      appendHits?: number
      tailHits?: number
      cacheHits?: number
      fullParses?: number
    } | undefined

    parseMarkdownToStructure(`${content}Appended paragraph with [tail](https://example.com/tail) and **strong** text.\n\n`, md, {
      streamParse: true,
      parserMetrics: timing,
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

  it('reuses stable parser nodes inside the renderer-owned parse pipeline', () => {
    const content = ref(`${buildParagraphs(40)}\n\n`)
    const logPerf = vi.fn()
    const { scope, state } = createParsingState(content, ref(false), {}, ref(true), logPerf)

    expect(state.parsedNodes.value).toHaveLength(40)
    logPerf.mockClear()

    content.value += 'Appended paragraph.\n\n'
    expect(state.parsedNodes.value).toHaveLength(41)

    const data = logPerf.mock.calls.at(-1)?.[1]
    expect(data?.processTokensReusedTopLevelNodes).toBeGreaterThanOrEqual(40)
    expect(data?.processTokensInputTokens).toBeLessThanOrEqual(3)

    scope.stop()
  })

  it('preserves unchanged list items while appending to a growing list', () => {
    const content = ref('- **first** item\n- second item')
    const { scope, state } = createParsingState(content)
    const before = (state.parsedNodes.value[0] as any).items[0]
    content.value += ' grows\n- third item'
    const after = (state.parsedNodes.value[0] as any).items
    expect(after[0]).toBe(before)
    expect(after[1].raw).toContain('grows')
    expect(after).toHaveLength(3)
    scope.stop()
  })

  it.each([
    '- **first** item\n- second with [link](https://example.com)\n  - nested `code`\n\n  extra paragraph\n- last',
    '| Name | Value |\n| --- | --- |\n| A | **one** |\n| B | [two](https://example.com) |',
    '> **first** paragraph\n>\n> second _paragraph_\n>\n> - list one\n> - list two',
    '- [reference][target]\n- second\n\n[target]: https://example.com "title"',
  ])('matches fresh parsing at every structural streaming prefix: %s', (markdown) => {
    const content = ref('')
    const { final, scope, state } = createParsingState(content)
    const md = getMarkdown('descendant-differential')
    for (let end = 1; end <= markdown.length; end++) {
      content.value = markdown.slice(0, end)
      expect(state.parsedNodes.value, `prefix ${end}`).toEqual(
        parseMarkdownToStructure(content.value, md, { final: false, streamParse: false }),
      )
    }
    final.value = true
    expect(state.parsedNodes.value).toEqual(
      parseMarkdownToStructure(content.value, md, { final: true, streamParse: false }),
    )
    content.value = '- replacement'
    expect(state.parsedNodes.value).toEqual(
      parseMarkdownToStructure(content.value, md, { final: true, streamParse: false }),
    )
    scope.stop()
  })
})
