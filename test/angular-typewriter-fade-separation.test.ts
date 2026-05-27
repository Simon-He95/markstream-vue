/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Minimal harness that replicates the Angular NodeRenderer's smooth streaming
 * eligibility logic to verify that fade is not part of the auto condition.
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
    typewriter = false,
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

describe('markstream-angular typewriter/fade separation', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('default typewriter=false and maxLiveNodes>0 means auto mode is off', () => {
    const harness = createHarness({
      typewriter: false,
      maxLiveNodes: 320,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(false)
  })

  it('typewriter=true auto-enables smooth streaming', () => {
    const harness = createHarness({
      typewriter: true,
      maxLiveNodes: 320,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(true)
  })

  it('maxLiveNodes<=0 auto-enables smooth streaming regardless of typewriter', () => {
    const harness = createHarness({
      typewriter: false,
      maxLiveNodes: 0,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(true)
  })

  it('smoothStreaming=false overrides typewriter and maxLiveNodes', () => {
    const harness = createHarness({
      smoothStreaming: false,
      typewriter: true,
      maxLiveNodes: 0,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(false)
  })

  it('smoothStreaming=true forces eligibility regardless of typewriter', () => {
    const harness = createHarness({
      smoothStreaming: true,
      typewriter: false,
      maxLiveNodes: 320,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(true)
  })

  it('nodes mode disables smooth streaming', () => {
    const harness = createHarness({
      typewriter: true,
      maxLiveNodes: 0,
      hasNodes: true,
    })

    expect(harness.getSmoothStreamingEligible()).toBe(false)
  })
})
