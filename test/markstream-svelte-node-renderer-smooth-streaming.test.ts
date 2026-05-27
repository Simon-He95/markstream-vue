/**
 * @vitest-environment jsdom
 */

import { createSmoothMarkdownStream } from 'markstream-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Minimal harness that replicates the Svelte NodeRenderer's smooth streaming
 * logic (smoothStreamingEnabled gate, renderContent, effectiveFinal, baseline sync)
 * so we can test the contract without Svelte's test utilities.
 */
function createHarness(options: {
  smoothStreaming?: boolean | 'auto'
  typewriter?: boolean
  maxLiveNodes?: number
  hasNodes?: boolean
  parentSmoothStreamingEnabled?: boolean
}) {
  const {
    smoothStreaming = 'auto',
    typewriter = true,
    maxLiveNodes = 320,
    hasNodes = false,
    parentSmoothStreamingEnabled = false,
  } = options

  const controller = createSmoothMarkdownStream({})
  let source = ''
  let visible = ''
  let caughtUp = true
  let hasMountedForSmoothStreaming = typeof window === 'undefined' || smoothStreaming === true

  const syncSnapshot = () => {
    const snapshot = controller.getSnapshot()
    source = snapshot.source
    visible = snapshot.visible
    caughtUp = snapshot.caughtUp
  }

  let content = ''
  let requestedFinal: boolean | undefined

  function getSmoothStreamingEligible(): boolean {
    if (smoothStreaming === false)
      return false
    if (hasNodes)
      return false
    if (smoothStreaming !== true && parentSmoothStreamingEnabled)
      return false
    if (smoothStreaming === true)
      return true
    return typewriter === true || maxLiveNodes <= 0
  }

  function getSmoothStreamingEnabled(): boolean {
    return hasMountedForSmoothStreaming && getSmoothStreamingEligible()
  }

  function getRenderContent(): string {
    return getSmoothStreamingEnabled() ? visible : (content ?? '')
  }

  function getEffectiveFinal(): boolean | undefined {
    const requested = requestedFinal
    if (getSmoothStreamingEnabled() && requested != null) {
      const smoothSourceSynced = hasNodes || source === (content ?? '')
      return Boolean(requested && smoothSourceSynced && caughtUp)
    }
    return requested
  }

  // Baseline sync: in auto mode with initial content, ensure source/visible
  // are already synced before smooth streaming activates.
  // This mirrors the Svelte component's top-level baseline sync:
  //   if (smoothStreaming !== true && !Array.isArray(nodes) && content) {
  //     smoothStream.reset(content)
  //   }
  function baselineSync() {
    if (smoothStreaming !== true && !hasNodes && content) {
      controller.reset(content)
      syncSnapshot()
    }
  }

  // Simulate Svelte's $effect that syncs content to the stream
  function syncContent() {
    const nextContent = content ?? ''

    if (hasNodes) {
      controller.reset('')
      syncSnapshot()
      return
    }

    if (!getSmoothStreamingEnabled()) {
      controller.reset(nextContent)
      if (requestedFinal) {
        controller.finish({ flush: true })
      }
      syncSnapshot()
      return
    }

    if (!nextContent) {
      controller.reset('')
    }
    else if (nextContent === source) {
      // no-op
    }
    else if (nextContent.startsWith(source)) {
      controller.enqueue(nextContent.slice(source.length))
    }
    else {
      controller.reset(nextContent)
    }

    if (requestedFinal)
      controller.finish()

    syncSnapshot()
  }

  function onMount() {
    hasMountedForSmoothStreaming = true
  }

  function destroy() {
    controller.destroy()
  }

  return {
    setContent(c: string) { content = c },
    setFinal(f: boolean | undefined) { requestedFinal = f },
    getSmoothStreamingEnabled,
    getRenderContent,
    getEffectiveFinal,
    syncContent,
    baselineSync,
    onMount,
    destroy,
    get source() { return source },
    get visible() { return visible },
    get caughtUp() { return caughtUp },
    get controller() { return controller },
  }
}

describe('markstream-svelte NodeRenderer smooth streaming contract', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not pace initial content in auto mode (baseline sync)', () => {
    const harness = createHarness({ smoothStreaming: 'auto', typewriter: true })

    harness.setContent('static initial content')

    // Svelte does a baseline sync before smooth streaming activates
    harness.baselineSync()

    // Before mount, smoothStreamingEnabled should be false
    expect(harness.getSmoothStreamingEnabled()).toBe(false)

    // renderContent should return raw content immediately
    expect(harness.getRenderContent()).toBe('static initial content')
  })

  it('paces post-mount appends in auto mode', async () => {
    vi.useFakeTimers()
    const harness = createHarness({ smoothStreaming: 'auto', typewriter: true })

    // Mount with empty content
    harness.onMount()

    // After mount, smoothStreamingEnabled should be true (typewriter=true)
    expect(harness.getSmoothStreamingEnabled()).toBe(true)

    // Append content after mount
    harness.setContent('Hello smooth streaming markdown renderer.')
    harness.syncContent()

    // Content should be enqueued and visible should be behind
    expect(harness.source).toBe('Hello smooth streaming markdown renderer.')
    expect(harness.visible.length).toBeLessThan(
      'Hello smooth streaming markdown renderer.'.length,
    )

    harness.destroy()
  })

  it('shows content immediately when smoothStreaming=false', () => {
    const harness = createHarness({ smoothStreaming: false, typewriter: true })

    harness.setContent('Immediate content')
    harness.onMount()
    harness.syncContent()

    expect(harness.getSmoothStreamingEnabled()).toBe(false)
    expect(harness.getRenderContent()).toBe('Immediate content')

    harness.destroy()
  })

  it('paces initial client content when smoothStreaming=true', () => {
    vi.useFakeTimers()
    const harness = createHarness({ smoothStreaming: true, typewriter: false })

    // smoothStreaming=true sets hasMountedForSmoothStreaming = true from start
    expect(harness.getSmoothStreamingEnabled()).toBe(true)

    harness.setContent('Hello world from initial content')
    harness.syncContent()

    // Content should be enqueued but visible should be behind source
    expect(harness.source).toBe('Hello world from initial content')
    expect(harness.visible.length).toBeLessThan(
      'Hello world from initial content'.length,
    )

    // renderContent should use visible (paced)
    expect(harness.getRenderContent().length).toBeLessThan(
      'Hello world from initial content'.length,
    )

    harness.destroy()
  })

  it('gates final by caughtUp when smooth streaming is active', async () => {
    vi.useFakeTimers()
    const harness = createHarness({ smoothStreaming: true, typewriter: false })

    harness.setContent('Hello world')
    harness.setFinal(true)
    harness.syncContent()

    // Before visible catches up, effectiveFinal should be false
    if (harness.source.length > harness.visible.length) {
      expect(harness.getEffectiveFinal()).toBe(false)
    }

    // Flush to let visible catch up, then sync snapshot
    harness.controller.flush()
    harness.syncContent()

    // After caught up, effectiveFinal should reflect the requested final
    expect(harness.caughtUp).toBe(true)
    expect(harness.getEffectiveFinal()).toBe(true)

    harness.destroy()
  })

  it('suppresses auto mode but not explicit true under parent scope', () => {
    // Auto mode with parent already smoothing → should be suppressed
    const autoHarness = createHarness({
      smoothStreaming: 'auto',
      typewriter: true,
      parentSmoothStreamingEnabled: true,
    })
    autoHarness.onMount()
    expect(autoHarness.getSmoothStreamingEnabled()).toBe(false)
    autoHarness.destroy()

    // Explicit true with parent smoothing → should NOT be suppressed
    const explicitHarness = createHarness({
      smoothStreaming: true,
      typewriter: false,
      parentSmoothStreamingEnabled: true,
    })
    explicitHarness.onMount()
    expect(explicitHarness.getSmoothStreamingEnabled()).toBe(true)
    explicitHarness.destroy()
  })
})
