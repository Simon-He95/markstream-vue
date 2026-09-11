/**
 * @vitest-environment jsdom
 */

import type { StreamSliceMode, StreamTransportMode } from '../src/shared/useStreamSimulator'
import { NodeRenderer, useSmoothMarkdownStream } from 'markstream-solid'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControllerDemo } from '../src/demos/ControllerDemo'
import { ScopedRenderersDemo } from '../src/demos/ScopedRenderersDemo'
import { HYDRATION_APPEND, HYDRATION_FIXTURE_MARKDOWN, HydrationApp } from '../src/hydration/HydrationApp'
import { HomePage } from '../src/pages/HomePage'
import { SMOOTH_SAMPLE } from '../src/shared/demoSamples'

function stubJsdomBrowserApis() {
  if (typeof window.ResizeObserver !== 'function') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver
  }
  if (typeof window.Worker !== 'function') {
    window.Worker = class {
      onmessage: ((event: MessageEvent) => void) | null = null
      onmessageerror: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage() {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return false
      }
    } as unknown as typeof Worker
  }
  const sheet = CSSStyleSheet.prototype as CSSStyleSheet & { replaceSync?: (text: string) => void }
  if (typeof sheet.replaceSync !== 'function')
    sheet.replaceSync = () => {}
}

function stubMatchMedia() {
  stubJsdomBrowserApis()
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

describe('solid playground demos', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('exposes controller accessors and does not double-smooth', () => {
    const host = document.createElement('div')
    const dispose = render(() => <ControllerDemo isDark={false} />, host)
    expect(host.querySelector('[data-demo="controller"]')).toBeTruthy()
    expect(host.querySelector('[data-controller-snapshot]')?.textContent).toContain('source()=')
    expect(host.querySelector('[data-controller-enqueue]')).toBeTruthy()
    const source = host.innerHTML
    expect(source).not.toMatch(/smoothStreaming=\{true\}/)
    dispose()
  })

  it('drives useSmoothMarkdownStream enqueue/finish on the shipped controller', async () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    let enqueue!: (chunk: string) => void
    let finish!: () => void
    const Owner = () => {
      const stream = useSmoothMarkdownStream({ startDelayMs: 0, minCharsPerSecond: 1000, maxCharsPerSecond: 1000 })
      enqueue = stream.enqueue
      finish = stream.finish
      return (
        <output>
          {stream.visible()}
          |
          {String(stream.caughtUp())}
          |
          {String(stream.final())}
          |
          {stream.pendingChars()}
        </output>
      )
    }
    const dispose = render(() => <Owner />, host)
    enqueue('abc')
    finish()
    await vi.advanceTimersByTimeAsync(50)
    expect(host.textContent).toContain('abc')
    expect(host.textContent).toContain('true')
    dispose()
  })

  it('does not re-fade already visible smooth text as a whole block', async () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const [content, setContent] = createSignal('Hello')
    const dispose = render(() => (
      <NodeRenderer
        content={content()}
        fade
        typewriter={false}
        smoothStreaming={false}
        final
      />
    ), host)
    expect(host.textContent).toContain('Hello')
    const paragraph = host.querySelector('p')
    setContent('Hello world')
    await Promise.resolve()
    expect(host.querySelector('p')).toBe(paragraph)
    expect(paragraph?.textContent).toContain('Hello')
    expect(paragraph?.textContent).toContain('world')
    expect(host.textContent?.match(/Hello/g)?.length).toBe(1)
    dispose()
    void SMOOTH_SAMPLE
  })

  it('unmounts the right scoped renderer without removing the left mapping', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = render(() => <ScopedRenderersDemo isDark={false} />, host)
    expect(host.querySelector('[data-scoped-left]')).toBeTruthy()
    expect(host.querySelector('[data-scoped-right]')).toBeTruthy()
    const toggle = host.querySelector('[data-toggle-right-scope]') as HTMLButtonElement
    expect(toggle).toBeTruthy()
    toggle.click()
    expect(host.querySelector('[data-scoped-left]')).toBeTruthy()
    expect(host.querySelector('[data-scoped-right]')).toBeNull()
    dispose()
  })

  it('exposes HydrationApp append controls on the client fixture', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = render(() => <HydrationApp />, host)
    expect(HYDRATION_FIXTURE_MARKDOWN).toContain('Server rendered Solid')
    expect(host.querySelector('[data-hydration-root]')).toBeTruthy()
    const heading = host.querySelector('h1')
    expect(heading?.textContent).toContain('Server rendered Solid')
    const append = host.querySelector('[data-hydration-append]') as HTMLButtonElement
    expect(append).toBeTruthy()
    append.click()
    expect(host.textContent).toContain(HYDRATION_APPEND.trim())
    expect(host.querySelector('h1')).toBe(heading)
    dispose()
  })

  it('switches one-click demos and appends into the same code-block node after the stream ends', async () => {
    stubMatchMedia()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = render(() => <HomeHarness />, host)

    await vi.waitFor(() => {
      expect(host.querySelector('[data-chat-surface]')?.textContent).toContain('markstream-vue playground')
    }, { timeout: 4000 })

    const codeChip = host.querySelector('[data-demo-chip="code-identity"]') as HTMLButtonElement
    expect(codeChip).toBeTruthy()
    codeChip.click()
    await vi.waitFor(() => {
      expect(host.querySelector('[data-chat-surface]')?.textContent).toContain('Code-block identity')
    }, { timeout: 4000 })
    expect(host.querySelector('[data-chat-surface]')?.textContent).not.toContain('markstream-vue playground')
    await vi.waitFor(() => {
      expect(host.querySelector('[data-obs-streaming]')?.textContent).toBe('no')
    }, { timeout: 4000 })

    const codeBlock = host.querySelector('[data-markstream-code-block="1"]')
    expect(codeBlock).toBeTruthy()
    const append = host.querySelector('[data-append-code]') as HTMLButtonElement
    expect(append).toBeTruthy()
    append.click()
    await vi.waitFor(() => {
      expect(host.querySelector('[data-chat-surface]')?.textContent).toContain('Appended line 1')
    })
    expect(host.querySelector('[data-markstream-code-block="1"]')).toBe(codeBlock)
    dispose()
  })
})
