/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest'
import { createAutoScrollChaseController } from '../playground/src/utils/autoScrollChase'

describe('playground auto-scroll chase', () => {
  it('keeps chasing new content, stops when the user scrolls up, and resumes at bottom', () => {
    const root = document.createElement('div')
    let scrollHeight = 1000
    const clientHeight = 100
    let rawScrollTop = 0
    let now = 0
    let shouldStick = true
    const frames: FrameRequestCallback[] = []

    Object.defineProperty(root, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })
    Object.defineProperty(root, 'clientHeight', {
      configurable: true,
      get: () => clientHeight,
    })
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get: () => rawScrollTop,
      set: (value: number) => {
        rawScrollTop = Math.max(0, Math.min(value, scrollHeight - clientHeight))
      },
    })

    root.scrollTop = 900

    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => shouldStick,
      setShouldStick: (value) => {
        shouldStick = value
      },
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {},
      now: () => now,
    })

    function runNextFrame() {
      const callback = frames.shift()
      expect(callback).toBeTruthy()
      callback?.(now)
    }

    function expectAtBottom() {
      expect(scrollHeight - root.scrollTop - clientHeight).toBeLessThanOrEqual(24)
    }

    controller.handleScroll()
    expect(shouldStick).toBe(true)

    runNextFrame()
    expectAtBottom()

    scrollHeight = 1200
    controller.schedule()
    runNextFrame()
    expectAtBottom()

    root.scrollTop = 900
    controller.handleScroll()
    expect(shouldStick).toBe(false)

    scrollHeight = 1400
    controller.schedule()
    runNextFrame()
    expect(root.scrollTop).toBe(900)

    root.scrollTop = 1300
    controller.handleScroll()
    expect(shouldStick).toBe(true)

    now = 1
    runNextFrame()
    expectAtBottom()
  })

  it('does not reclaim the scrollbar after a small upward scroll near the bottom', () => {
    const root = document.createElement('div')
    let rawScrollTop = 900
    let shouldStick = true
    const frames: FrameRequestCallback[] = []

    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => 1000 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => 100 })
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get: () => rawScrollTop,
      set: (value: number) => {
        rawScrollTop = Math.max(0, Math.min(value, 900))
      },
    })

    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => shouldStick,
      setShouldStick: (value) => {
        shouldStick = value
      },
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {},
    })

    controller.handleWheel(-8)
    root.scrollTop = 892
    controller.handleScroll()
    frames.shift()?.(0)

    expect(shouldStick).toBe(false)
    expect(root.scrollTop).toBe(892)
  })

  it('keeps an explicit upward scroll detached until the user returns to the bottom', () => {
    const root = document.createElement('div')
    let rawScrollTop = 900
    let shouldStick = true
    const frames: FrameRequestCallback[] = []

    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => 1000 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => 100 })
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get: () => rawScrollTop,
      set: (value: number) => {
        rawScrollTop = Math.max(0, Math.min(value, 900))
      },
    })

    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => shouldStick,
      setShouldStick: (value) => {
        shouldStick = value
      },
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {},
    })

    controller.handleWheel(-8)
    controller.handleScroll()
    frames.shift()?.(0)
    expect(shouldStick).toBe(false)
    expect(root.scrollTop).toBe(900)

    root.scrollTop = 892
    controller.handleScroll()
    expect(shouldStick).toBe(false)

    root.scrollTop = 900
    controller.handleScroll()
    expect(shouldStick).toBe(true)
  })

  it('ignores programmatic scroll events while following high-frequency content', () => {
    const root = document.createElement('div')
    let scrollHeight = 1000
    const clientHeight = 100
    let rawScrollTop = 900
    let shouldStick = true
    const frames: FrameRequestCallback[] = []

    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => clientHeight })
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get: () => rawScrollTop,
      set: (value: number) => {
        rawScrollTop = Math.max(0, Math.min(value, scrollHeight - clientHeight))
      },
    })

    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => shouldStick,
      setShouldStick: (value) => {
        shouldStick = value
      },
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {},
      now: () => 0,
    })

    controller.schedule()
    for (let i = 0; i < 500; i++) {
      scrollHeight += 1
      controller.schedule()
      frames.shift()?.(i)
      controller.handleScroll()
    }

    expect(shouldStick).toBe(true)
    expect(root.scrollTop).toBe(scrollHeight - clientHeight)
  })

  it('re-arms the chase when a programmatic scroll event is stale after layout growth', () => {
    const root = document.createElement('div')
    let scrollHeight = 1000
    const clientHeight = 100
    let rawScrollTop = 900
    let shouldStick = true
    const frames: FrameRequestCallback[] = []

    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => clientHeight })
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get: () => rawScrollTop,
      set: (value: number) => {
        rawScrollTop = Math.max(0, Math.min(value, scrollHeight - clientHeight))
      },
    })

    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => shouldStick,
      setShouldStick: (value) => {
        shouldStick = value
      },
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {},
    })

    controller.scrollToBottom()
    scrollHeight = 1400
    controller.handleScroll()

    expect(shouldStick).toBe(true)
    expect(frames).toHaveLength(1)
    frames.shift()?.(0)
    expect(root.scrollTop).toBe(1300)
  })

  it('can restart chasing when a delayed layout adds height after the first chase ends', () => {
    const root = document.createElement('div')
    let scrollHeight = 1000
    const clientHeight = 100
    let rawScrollTop = 900
    let shouldStick = true
    let now = 0
    const frames: FrameRequestCallback[] = []

    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => clientHeight })
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get: () => rawScrollTop,
      set: (value: number) => {
        rawScrollTop = Math.max(0, Math.min(value, scrollHeight - clientHeight))
      },
    })

    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => shouldStick,
      setShouldStick: (value) => {
        shouldStick = value
      },
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {},
      now: () => now,
    })

    controller.schedule()
    for (let i = 0; i < 5; i++) {
      now += 100
      frames.shift()?.(now)
    }
    expect(frames).toHaveLength(0)

    scrollHeight = 1800
    controller.schedule()
    frames.shift()?.(now)

    expect(root.scrollTop).toBe(1700)
    expect(shouldStick).toBe(true)
  })

  it('lets an actual upward scroll detach immediately after programmatic following', () => {
    const root = document.createElement('div')
    let rawScrollTop = 900
    let shouldStick = true
    const frames: FrameRequestCallback[] = []

    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => 1000 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => 100 })
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get: () => rawScrollTop,
      set: (value: number) => {
        rawScrollTop = Math.max(0, Math.min(value, 900))
      },
    })

    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => shouldStick,
      setShouldStick: (value) => {
        shouldStick = value
      },
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {},
    })

    controller.scrollToBottom()
    controller.handleScroll()
    root.scrollTop = 892
    controller.handleScroll()

    expect(shouldStick).toBe(false)
    expect(root.scrollTop).toBe(892)
  })

  it('does not resume chasing on touch end after an upward touch', () => {
    const root = document.createElement('div')
    let shouldStick = true
    const frames: FrameRequestCallback[] = []

    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => 1000 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => 100 })
    Object.defineProperty(root, 'scrollTop', { configurable: true, writable: true, value: 892 })

    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => shouldStick,
      setShouldStick: (value) => {
        shouldStick = value
      },
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {},
    })

    controller.handleTouchMove()
    controller.handleTouchEnd()

    expect(shouldStick).toBe(false)
    expect(frames).toHaveLength(0)
  })

  it('cancels a pending chase frame during cleanup', () => {
    const root = document.createElement('div')
    Object.defineProperty(root, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })
    Object.defineProperty(root, 'clientHeight', {
      configurable: true,
      get: () => 100,
    })
    root.scrollTop = 900

    const cancelFrame = vi.fn()
    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => true,
      setShouldStick: () => {},
      requestFrame: () => 42,
      cancelFrame,
      now: () => 0,
    })

    controller.schedule()
    controller.cancel()

    expect(cancelFrame).toHaveBeenCalledWith(42)
  })
})
