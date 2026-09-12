/**
 * @vitest-environment jsdom
 */

import { NodeRenderer } from 'markstream-solid'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { ThinkingNode } from '../src/components/ThinkingNode'
import { PLAYGROUND_CUSTOM_HTML_TAGS } from '../src/shared/markstreamPlayground'
import { resourceCounts } from '../src/shared/resourceTracker'
import { useStreamSimulator } from '../src/shared/useStreamSimulator'

describe('solid playground scoped components and cleanup', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps two renderer custom-component mappings isolated', () => {
    const host = document.createElement('div')
    const dispose = render(() => (
      <>
        <NodeRenderer
          content="<thinking>nested **md**</thinking>"
          customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
          customComponents={{ thinking: () => <aside data-left>left</aside> }}
          final
        />
        <NodeRenderer
          content="<thinking>other</thinking>"
          customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
          customComponents={{ thinking: () => <aside data-right>right</aside> }}
          final
        />
      </>
    ), host)
    expect(host.querySelector('[data-left]')?.textContent).toBe('left')
    expect(host.querySelector('[data-right]')?.textContent).toBe('right')
    expect(host.querySelector('[data-left]')?.closest('[data-right]')).toBeNull()
    dispose()
  })

  it('renders nested markdown through ThinkingNode without losing the nested renderer', () => {
    const host = document.createElement('div')
    const dispose = render(() => (
      <NodeRenderer
        content={'<thinking>\n**bold inside**\n</thinking>'}
        customComponents={{ thinking: ThinkingNode }}
        customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
        final
      />
    ), host)
    expect(host.querySelector('.thinking-node')).toBeTruthy()
    expect(host.querySelector('.content-area strong')?.textContent).toBe('bold inside')
    dispose()
  })

  it('does not accumulate simulator timers after unmount', async () => {
    const host = document.createElement('div')
    const Owner = () => {
      const simulator = useStreamSimulator(() => ({
        source: 'abcdefghi',
        chunkDelayMin: 20,
        chunkDelayMax: 20,
        chunkSizeMin: 1,
        chunkSizeMax: 1,
        burstiness: 0,
        sliceMode: 'pure-random',
        transportMode: 'scheduler',
        random: () => 0,
      }))
      simulator.start()
      return <span>{simulator.content()}</span>
    }
    const dispose = render(() => <Owner />, host)
    const during = resourceCounts().timeouts
    expect(during).toBeGreaterThan(0)
    dispose()
    expect(resourceCounts().timeouts).toBe(0)
  })

  it('keeps a code-block shell across ordinary append', () => {
    const host = document.createElement('div')
    const [content, setContent] = createSignal('```ts\nconst a = 1\n```')
    const dispose = render(() => <NodeRenderer content={content()} final />, host)
    const first = host.querySelector('[data-markstream-code-block="1"]')
    expect(first).toBeTruthy()
    setContent('```ts\nconst a = 1\nconst b = 2\n```')
    expect(host.querySelector('[data-markstream-code-block="1"]')).toBe(first)
    dispose()
  })
})
