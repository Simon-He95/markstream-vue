/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Minimal harness that replicates the Svelte NodeRenderer's smooth streaming
 * eligibility logic (after the fix: fade is no longer part of auto condition).
 */
function createHarness(options: {
  smoothStreaming?: boolean | 'auto'
  typewriter?: boolean
  fade?: boolean
  maxLiveNodes?: number
  hasNodes?: boolean
  parentSmoothStreamingEnabled?: boolean
}) {
  const {
    smoothStreaming = 'auto',
    typewriter = false,
    fade: _fade = true,
    maxLiveNodes = 320,
    hasNodes = false,
    parentSmoothStreamingEnabled = false,
  } = options

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

  return { getSmoothStreamingEligible }
}

describe('svelte typewriter/fade separation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('smoothStreaming=auto does NOT enable because fade=true (default)', () => {
    const harness = createHarness({
      typewriter: false,
      fade: true,
      maxLiveNodes: 320,
    })

    // With fade=true but typewriter=false and normal maxLiveNodes,
    // auto mode should NOT enable smooth streaming.
    expect(harness.getSmoothStreamingEligible()).toBe(false)
  })

  it('smoothStreaming=auto enables when typewriter=true', () => {
    const harness = createHarness({
      typewriter: true,
      fade: true,
      maxLiveNodes: 320,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(true)
  })

  it('smoothStreaming=auto enables when maxLiveNodes <= 0', () => {
    const harness = createHarness({
      typewriter: false,
      fade: true,
      maxLiveNodes: 0,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(true)
  })

  it('smoothStreaming=auto does not enable with fade=true and typewriter=false', () => {
    const harness = createHarness({
      typewriter: false,
      fade: true,
      maxLiveNodes: 320,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(false)
  })

  it('smoothStreaming=false overrides everything', () => {
    const harness = createHarness({
      smoothStreaming: false,
      typewriter: true,
      fade: true,
      maxLiveNodes: 0,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(false)
  })

  it('smoothStreaming=true forces eligibility regardless of fade/typewriter', () => {
    const harness = createHarness({
      smoothStreaming: true,
      typewriter: false,
      fade: false,
      maxLiveNodes: 320,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(true)
  })

  it('fade=false does not make smoothStreaming=auto eligible', () => {
    const harness = createHarness({
      typewriter: false,
      fade: false,
      maxLiveNodes: 320,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(false)
  })
})
