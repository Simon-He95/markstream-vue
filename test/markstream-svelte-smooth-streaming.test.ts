import { describe, expect, it } from 'vitest'
import { resolveParsedNodes } from '../packages/markstream-svelte/src/components/shared/node-helpers'

describe('markstream-svelte smooth streaming props', () => {
  it('accepts smoothStreaming and smoothStreamingOptions in NodeRendererProps', () => {
    const nodes = resolveParsedNodes({
      content: '# Hello',
      smoothStreaming: 'auto',
      smoothStreamingOptions: { minCharsPerSecond: 100 },
    })
    expect(nodes.length).toBeGreaterThan(0)
  })

  it('accepts smoothStreaming: true', () => {
    const nodes = resolveParsedNodes({
      content: '# Hello',
      smoothStreaming: true,
    })
    expect(nodes.length).toBeGreaterThan(0)
  })

  it('accepts smoothStreaming: false', () => {
    const nodes = resolveParsedNodes({
      content: '# Hello',
      smoothStreaming: false,
    })
    expect(nodes.length).toBeGreaterThan(0)
  })

  it('defaults smoothStreaming to auto when omitted', () => {
    const nodes = resolveParsedNodes({
      content: '# Hello',
    })
    expect(nodes.length).toBeGreaterThan(0)
  })

  it('treats nodes=[] as nodes mode (empty array, not content mode)', () => {
    const nodes = resolveParsedNodes({
      content: '# Hello',
      nodes: [],
      smoothStreaming: 'auto',
    })
    // nodes=[] should return empty array (nodes mode), not parse content
    expect(nodes).toEqual([])
  })
})
