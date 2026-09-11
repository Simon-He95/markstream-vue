/**
 * @vitest-environment jsdom
 */

import type { StreamSliceMode, StreamTransportMode } from '../src/shared/useStreamSimulator'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../src/pages/HomePage'
import { clearTrackedRaf, RESOURCE_COVERAGE, trackedRaf } from '../src/shared/resourceTracker'

function stubMatchMedia() {
  if (typeof window.ResizeObserver !== 'function') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver
  }
  if (typeof window.matchMedia === 'function')
    return
  window.matchMedia = query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false
    },
  })
}

function HomeHarness() {
  const [isDark, setIsDark] = createSignal(false)
  const [theme, setTheme] = createSignal('vitesse-dark')
  const [delayMin, setDelayMin] = createSignal(8)
  const [delayMax, setDelayMax] = createSignal(8)
  const [sizeMin, setSizeMin] = createSignal(24)
  const [sizeMax, setSizeMax] = createSignal(24)
  const [burst, setBurst] = createSignal(0)
  const [transport, setTransport] = createSignal<StreamTransportMode>('scheduler')
  const [slice, setSlice] = createSignal<StreamSliceMode>('pure-random')
  return (
    <HomePage
      isDark={isDark()}
      setIsDark={setIsDark}
      selectedTheme={theme()}
      setSelectedTheme={setTheme}
      streamChunkDelayMin={delayMin()}
      setStreamChunkDelayMin={setDelayMin}
      streamChunkDelayMax={delayMax()}
      setStreamChunkDelayMax={setDelayMax}
      streamChunkSizeMin={sizeMin()}
      setStreamChunkSizeMin={setSizeMin}
      streamChunkSizeMax={sizeMax()}
      setStreamChunkSizeMax={setSizeMax}
      streamBurstiness={burst()}
      setStreamBurstiness={setBurst}
      streamTransportMode={transport()}
      setStreamTransportMode={setTransport}
      streamSliceMode={slice()}
      setStreamSliceMode={setSlice}
      onGoTest={() => {}}
      onGoMigration={() => {}}
    />
  )
}

describe('solid playground observation', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('updates HomePage observation timeout and rAF counts on create, fire, cancel, and unmount', async () => {
    vi.useFakeTimers()
    stubMatchMedia()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = render(() => <HomeHarness />, host)
    await Promise.resolve()
    const timeouts = () => Number(host.querySelector('[data-obs-timeouts]')?.textContent)
    const rafs = () => Number(host.querySelector('[data-obs-rafs]')?.textContent)
    expect(timeouts()).toBeGreaterThan(0)
    const rafBefore = rafs()
    const rafId = trackedRaf(() => {})
    expect(rafs()).toBe(rafBefore + 1)
    clearTrackedRaf(rafId)
    expect(rafs()).toBe(rafBefore)
    await vi.advanceTimersByTimeAsync(8)
    expect(timeouts()).toBeGreaterThan(0)
    ;(host.querySelector('[data-stream-reset]') as HTMLButtonElement).click()
    expect(timeouts()).toBe(0)
    dispose()
    expect(host.querySelector('[data-obs-timeouts]')).toBeNull()
  })

  it('marks subscriptions as uncovered instead of a fake zero', () => {
    expect(RESOURCE_COVERAGE.subscriptions).toBe('uncovered')
    expect(RESOURCE_COVERAGE.codeBlockRuntimes).toBe('uncovered')
    stubMatchMedia()
    const host = document.createElement('div')
    const dispose = render(() => <HomeHarness />, host)
    const cell = host.querySelector('[data-obs-subscriptions]')
    expect(cell?.textContent).toBe('uncovered')
    expect(cell?.getAttribute('data-obs-coverage')).toBe('uncovered')
    expect(host.querySelector('[data-obs-runtimes]')?.textContent).toBe('uncovered')
    dispose()
  })

  it('does not treat pause as complete or stop-reveal as catch-up', async () => {
    vi.useFakeTimers()
    stubMatchMedia()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = render(() => <HomeHarness />, host)
    await vi.advanceTimersByTimeAsync(16)
    const pause = host.querySelector('[data-stream-pause]') as HTMLButtonElement
    pause.click()
    expect(host.querySelector('[data-obs-paused]')?.textContent).toBe('true')
    expect(host.querySelector('[data-obs-transport-complete]')?.textContent).toBe('false')
    expect(host.querySelector('[data-obs-transport-state]')?.textContent).toBe('paused')
    expect(host.querySelector('[data-obs-streaming]')?.textContent).toBe('paused')
    const stop = host.querySelector('[data-stream-stop]') as HTMLButtonElement
    stop.click()
    expect(host.querySelector('[data-obs-stop-reveal]')?.textContent).toBe('true')
    expect(host.querySelector('[data-obs-transport-complete]')?.textContent).toBe('false')
    expect(host.querySelector('[data-obs-transport-state]')?.textContent).toBe('stopped-full-source')
    expect(host.querySelector('[data-obs-display-note]')?.textContent).toContain('not renderer catch-up')
    const rendererInput = Number(host.querySelector('[data-obs-renderer-input-length]')?.textContent)
    const transported = Number(host.querySelector('[data-obs-transported-length]')?.textContent)
    const source = Number(host.querySelector('[data-obs-source-length]')?.textContent)
    expect(rendererInput).toBe(source)
    expect(transported).toBeLessThan(source)
    dispose()
  })

  it('drops old task data on reset and sample switch', async () => {
    vi.useFakeTimers()
    stubMatchMedia()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = render(() => <HomeHarness />, host)
    await vi.advanceTimersByTimeAsync(16)
    const reset = host.querySelector('[data-stream-reset]') as HTMLButtonElement
    reset.click()
    expect(host.querySelector('[data-obs-transported-length]')?.textContent).toBe('0')
    expect(host.querySelector('[data-obs-renderer-input-length]')?.textContent).toBe('0')
    expect(host.querySelector('[data-obs-transport-state]')?.textContent).toBe('idle')
    expect(host.querySelector('[data-obs-stop-reveal]')?.textContent).toBe('false')
    const diagrams = host.querySelector('[data-demo-chip="diagrams"]') as HTMLButtonElement
    diagrams.click()
    expect(host.querySelector('[data-obs-demo]')?.textContent).toBe('diagrams')
    expect(host.querySelector('[data-obs-stop-reveal]')?.textContent).toBe('false')
    dispose()
  })

  it('returns HomePage observation timeout counts to baseline after repeated enter/exit', async () => {
    vi.useFakeTimers()
    stubMatchMedia()
    const host = document.createElement('div')
    document.body.appendChild(host)
    for (let index = 0; index < 3; index += 1) {
      const dispose = render(() => <HomeHarness />, host)
      await Promise.resolve()
      expect(Number(host.querySelector('[data-obs-timeouts]')?.textContent)).toBeGreaterThan(0)
      dispose()
      expect(host.querySelector('[data-obs-timeouts]')).toBeNull()
    }
  })
})
