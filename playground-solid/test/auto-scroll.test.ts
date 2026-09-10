/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatAutoScroll, STICKY_BOTTOM_THRESHOLD_PX } from '../src/shared/useChatAutoScroll'

describe('solid playground auto-scroll', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('pins to the bottom on content growth while sticky, and stops following after scroll-up', () => {
    const rafQueue: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafQueue.push(callback)
      return rafQueue.length
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafQueue[id - 1] = () => {}
    })
    const flushRaf = () => {
      const queued = rafQueue.splice(0)
      for (const callback of queued)
        callback(0)
    }

    const container = document.createElement('div')
    const shell = document.createElement('div')
    shell.className = 'chatbot-renderer-shell'
    container.appendChild(shell)
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 100 })
    let scrollHeight = 100
    Object.defineProperty(container, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    container.scrollTop = 0
    document.body.appendChild(container)

    const controller = createChatAutoScroll(() => container)
    controller.attach()
    flushRaf()

    scrollHeight = 400
    controller.onContentChange()
    flushRaf()
    expect(container.scrollTop).toBe(400)

    container.scrollTop = 10
    container.dispatchEvent(new Event('scroll'))
    expect(controller.isSticky()).toBe(false)

    scrollHeight = 800
    controller.onContentChange()
    flushRaf()
    expect(container.scrollTop).toBe(10)

    container.scrollTop = 800 - 100 - (STICKY_BOTTOM_THRESHOLD_PX - 1)
    container.dispatchEvent(new Event('scroll'))
    expect(controller.isSticky()).toBe(true)
    controller.detach()
  })
})
