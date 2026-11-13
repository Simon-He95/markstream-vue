import type { NodeRendererProps } from '../src/types/node-renderer-props'
import assert from 'node:assert/strict'
import { clearRegisteredMarkdownPlugins, registerMarkdownPlugin } from 'stream-markdown-parser'
import { describe, it, vi } from 'vitest'
import { computed, effectScope, reactive, ref } from 'vue'
import { createChunkParserPrototype } from '../packages/markdown-parser/src/chunk-prototype'
import { useMarkdownParsing } from '../src/components/NodeRenderer/composables/useMarkdownParsing'

function setup(createChunkParser?: typeof createChunkParserPrototype, initialProps: Partial<NodeRendererProps> = {}) {
  const content = ref('')
  const final = ref(false)
  const props = reactive({ ...initialProps } as NodeRendererProps)
  const scope = effectScope()
  const state = scope.run(() => useMarkdownParsing(props, {
    instanceMsgId: 'vue-chunk',
    renderContent: computed(() => content.value),
    effectiveFinal: computed(() => final.value),
    debugPerformanceEnabled: computed(() => false),
    logPerf() {},
  }, createChunkParser))!
  return { content, final, props, state, stop: () => scope.stop() }
}

const mixed = '# Intro\n\n[late][ref] and note[^x].\n\n- item\n  - nested\n\n| one | two |\n| --- | --- |\n| A | B |\n\n```mermaid\ngraph TD; A-->B\n```\n\n<details>\n<summary>title</summary>\n\n**Body**\n\n</details>\n\n$$\nx+y\n$$\n\n[ref]: https://example.com\n\n[^x]: note\n'
const long = Array.from({ length: 80 }, (_, i) => `## Entry ${i}\n\nText with **strong** and [a link](https://example.com/${i}).\n\n`).join('')
const cases = [['mixed', mixed, 1], ['long', long, 32]] as const

describe('experimental Vue chunk parser', () => {
  it.each(cases)('preserves ASTs, snapshots and dirty indices for %s', (id, source, size) => {
    const current = setup()
    const starts: number[] = []
    const create = vi.fn((md: Parameters<typeof createChunkParserPrototype>[0]) => {
      const parser = createChunkParserPrototype(md)
      return {
        ...parser,
        append(text: string) {
          const patch = parser.append(text)
          starts.push(patch.start)
          return patch
        },
      }
    })
    const chunk = setup(create)
    const retained: Array<[typeof chunk.state.parsedNodes.value, string]> = []
    let oldCurrent = current.state.parsedNodes.value
    let oldChunk = chunk.state.parsedNodes.value
    const append = vi.spyOn(chunk.state.mdInstance.value.stream!, 'append')
    try {
      for (let offset = 0; offset < source.length; offset += size) {
        current.content.value = chunk.content.value = source.slice(0, offset + size)
        const next = chunk.state.parsedNodes.value
        const expected = current.state.parsedNodes.value
        assert.deepEqual(next, expected, `AST at ${offset}`)
        const dirty = chunk.state.getParsedNodesDirtyStartIndex()
        assert.equal(dirty, current.state.getParsedNodesDirtyStartIndex(), `dirty index at ${offset}`)
        if (dirty < 0)
          assert.equal(next, oldChunk, 'no-op retains the published array')
        for (let i = 0; i < Math.min(oldChunk.length, next.length); i++)
          assert.equal(next[i] === oldChunk[i], expected[i] === oldCurrent[i], `identity at ${offset}, node ${i}`)
        if (offset % (size * 19) === 0)
          retained.push([next, JSON.stringify(next)])
        oldCurrent = expected
        oldChunk = next
      }
      current.final.value = chunk.final.value = true
      assert.deepEqual(chunk.state.parsedNodes.value, current.state.parsedNodes.value)
      assert.equal(create.mock.calls.length, 1)
      assert.ok(append.mock.calls.length > 0)
      assert.ok(starts.some(start => start > 0), 'uses a tokenizer-confirmed stable prefix')
      if (id === 'mixed')
        assert.ok(starts.slice(1).includes(0), 'handles full invalidation after the first update')
      for (const [nodes, snapshot] of retained)
        assert.equal(JSON.stringify(nodes), snapshot, 'later patches changed a retained snapshot')
    }
    finally {
      current.stop()
      chunk.stop()
    }
  })

  it('restores the same text after supplied nodes and starts a fresh session after edits', () => {
    const current = setup()
    const create = vi.fn(createChunkParserPrototype)
    const chunk = setup(create)
    const text = '# Intro\n\nFirst\n\nSecond'
    function compare() {
      assert.deepEqual(chunk.state.parsedNodes.value, current.state.parsedNodes.value)
    }
    try {
      current.final.value = chunk.final.value = true
      current.content.value = chunk.content.value = text
      compare()
      assert.equal(create.mock.calls.length, 0)
      current.final.value = chunk.final.value = false
      current.content.value = chunk.content.value = `${text} grows`
      compare()
      const supplied = current.state.parsedNodes.value.slice(0, 1)
      current.props.nodes = chunk.props.nodes = supplied
      compare()
      current.props.nodes = chunk.props.nodes = undefined
      compare()
      assert.equal(create.mock.calls.length, 2)
      current.props.parseOptions = chunk.props.parseOptions = { includeSourceMap: true }
      compare()
      assert.ok(chunk.state.parsedNodes.value[0]?.sourceMap)
      assert.equal(create.mock.calls.length, 2)
      current.props.parseOptions = chunk.props.parseOptions = undefined
      compare()
      assert.equal(create.mock.calls.length, 3)
      current.content.value = chunk.content.value = text.replace('First', 'Edited')
      compare()
      assert.equal(create.mock.calls.length, 3)
      current.content.value = chunk.content.value = ''
      compare()
      current.content.value = chunk.content.value = text
      compare()
      assert.equal(create.mock.calls.length, 4)
    }
    finally {
      current.stop()
      chunk.stop()
    }
  })

  it('honors parser options and globally registered core rules on the string path', () => {
    registerMarkdownPlugin((md) => {
      md.core.ruler.push('observe_full_source', (state) => {
        const child = state.tokens.find(token => token.type === 'inline')?.children?.[0]
        if (child?.type === 'text')
          child.content += state.src.includes('Second') ? ' [whole document]' : ' [first update]'
      })
    })
    const create = vi.fn(createChunkParserPrototype)
    const current = setup(undefined, { parseOptions: { includeSourceMap: true } })
    const chunk = setup(create, { parseOptions: { includeSourceMap: true } })
    try {
      for (const text of ['First', 'First\n\nSecond']) {
        current.content.value = chunk.content.value = text
        assert.deepEqual(chunk.state.parsedNodes.value, current.state.parsedNodes.value)
        assert.ok(chunk.state.parsedNodes.value[0]?.sourceMap)
      }
      assert.equal(create.mock.calls.length, 0)
    }
    finally {
      current.stop()
      chunk.stop()
      clearRegisteredMarkdownPlugins()
    }
  })
})
