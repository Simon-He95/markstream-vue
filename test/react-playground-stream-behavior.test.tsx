/**
 * @vitest-environment jsdom
 */

import React, { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStreamSimulator } from '../playground-react18/src/shared/useStreamSimulator'

interface HarnessProps {
  chunkDelayMax: number
  chunkDelayMin: number
  chunkSizeMax: number
  chunkSizeMin: number
  onContent: (content: string) => void
}

function StreamHarness(props: HarnessProps) {
  const { content, start, stop } = useStreamSimulator({
    source: 'abcdefghi',
    chunkDelayMax: props.chunkDelayMax,
    chunkDelayMin: props.chunkDelayMin,
    chunkSizeMax: props.chunkSizeMax,
    chunkSizeMin: props.chunkSizeMin,
    burstiness: 0,
    sliceMode: 'pure-random',
    transportMode: 'scheduler',
    random: () => 0,
  })

  useEffect(() => {
    props.onContent(content)
  }, [content, props])

  useEffect(() => {
    start()
    return () => {
      stop()
    }
  }, [start, stop])

  return null
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('react playground stream behavior', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
    vi.useRealTimers()
  })

  it('keeps the current stream alive when settings change mid-stream', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    let latestContent = ''
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(StreamHarness, {
        chunkDelayMax: 10,
        chunkDelayMin: 10,
        chunkSizeMax: 1,
        chunkSizeMin: 1,
        onContent: (content: string) => {
          latestContent = content
        },
      }))
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    await flushReact()

    expect(latestContent).toBe('ab')

    await act(async () => {
      root.render(React.createElement(StreamHarness, {
        chunkDelayMax: 10,
        chunkDelayMin: 10,
        chunkSizeMax: 2,
        chunkSizeMin: 2,
        onContent: (content: string) => {
          latestContent = content
        },
      }))
    })
    await flushReact()

    expect(latestContent).toBe('ab')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    await flushReact()

    expect(latestContent).toBe('abcd')

    await act(async () => {
      root.unmount()
    })
  })
})
