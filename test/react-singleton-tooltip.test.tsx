import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkNode } from '../packages/markstream-react/src/components/LinkNode/LinkNode'
import { hideTooltip, isTooltipVisible, showTooltipForAnchor } from '../packages/markstream-react/src/tooltip/singletonTooltip'

const floating = vi.hoisted(() => ({
  computePosition: vi.fn(),
  autoUpdate: vi.fn(),
  cleanup: vi.fn(),
}))

vi.mock('@floating-ui/dom', () => ({
  ...floating,
  offset: vi.fn(),
  flip: vi.fn(),
  shift: vi.fn(),
}))

function deferredPosition() {
  let resolve!: (position: { x: number, y: number }) => void
  const promise = new Promise<{ x: number, y: number }>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const tooltip = () => document.querySelector<HTMLElement>('.markstream-react.ms-tooltip')!

function expectHidden(anchor: HTMLElement) {
  expect(isTooltipVisible()).toBe(false)
  expect(tooltip().dataset.visible).toBe('false')
  expect(anchor.hasAttribute('aria-describedby')).toBe(false)
}

describe('markstream-react singleton tooltip lifecycle', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot> | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    floating.computePosition.mockReset().mockResolvedValue({ x: 20, y: 30 })
    floating.cleanup.mockReset()
    floating.autoUpdate.mockReset().mockImplementation((_anchor, _tooltip, update) => {
      update()
      return floating.cleanup
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    if (root)
      await act(async () => root?.unmount())
    root = undefined
    hideTooltip(true)
    host.remove()
    vi.useRealTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  })

  function anchor() {
    const el = document.createElement('a')
    host.appendChild(el)
    return el
  }

  async function renderLinks(keys: string[], loading = false, showTooltip = true) {
    root ??= createRoot(host)
    await act(async () => {
      root!.render(React.createElement(React.Fragment, null, ...keys.map(key => React.createElement(LinkNode, {
        key,
        node: { type: 'link', href: `https://example.com/${key}`, title: key, text: key, loading },
        showTooltip,
        typewriter: false,
      }))))
    })
    return Array.from(host.querySelectorAll('a'))
  }

  function hover(el: HTMLElement) {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  }

  it('shows a connected anchor after the hover delay and cleans up on leave', async () => {
    const [el] = await renderLinks(['A'])
    hover(el)
    await vi.advanceTimersByTimeAsync(79)
    expect(isTooltipVisible()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(isTooltipVisible()).toBe(true)
    expect(tooltip().textContent).toBe('A')
    expect(el.getAttribute('aria-describedby')).toBe(tooltip().id)
    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(120)
    expectHidden(el)
    expect(floating.cleanup).toHaveBeenCalledTimes(1)
  })

  it.each([true, false])('does not revive an in-flight show after hide (immediate=%s)', async (immediate) => {
    const el = anchor()
    const pending = deferredPosition()
    floating.computePosition.mockReturnValueOnce(pending.promise)
    showTooltipForAnchor(el, 'A', 'top', true)
    hideTooltip(immediate)
    pending.resolve({ x: 100, y: 100 })
    await vi.advanceTimersByTimeAsync(120)
    expectHidden(el)
    expect(floating.autoUpdate).not.toHaveBeenCalled()
    expect(tooltip().style.transform).not.toContain('100px')
  })

  it.each(['hide', 'detach', 'switch'])('rechecks ownership after the positioning await (%s)', async (action) => {
    const a = anchor()
    const b = anchor()
    const pending = deferredPosition()
    floating.computePosition.mockReturnValueOnce(pending.promise)
    showTooltipForAnchor(a, 'A', 'top', true)
    pending.resolve({ x: 20, y: 30 })
    // Let updatePosition finish, then invalidate before doShow resumes.
    await Promise.resolve()
    if (action === 'hide')
      hideTooltip(true)
    else if (action === 'detach')
      a.remove()
    else
      showTooltipForAnchor(b, 'B', 'top', true)
    await vi.advanceTimersByTimeAsync(0)
    if (action === 'switch') {
      expect(tooltip().textContent).toBe('B')
      expect(floating.autoUpdate).toHaveBeenCalledTimes(1)
      expect(floating.autoUpdate.mock.calls[0][0]).toBe(b)
    }
    else {
      expectHidden(a)
      expect(floating.autoUpdate).not.toHaveBeenCalled()
    }
  })

  it('does not show an anchor removed during the hover delay', async () => {
    const el = anchor()
    showTooltipForAnchor(el, 'A')
    el.remove()
    await vi.advanceTimersByTimeAsync(80)
    expectHidden(el)
    expect(floating.computePosition).not.toHaveBeenCalled()
    expect(floating.autoUpdate).not.toHaveBeenCalled()
  })

  it('does not show an anchor removed while positioning', async () => {
    const el = anchor()
    const pending = deferredPosition()
    floating.computePosition.mockReturnValueOnce(pending.promise)
    showTooltipForAnchor(el, 'A', 'top', true)
    el.remove()
    pending.resolve({ x: 100, y: 100 })
    await vi.advanceTimersByTimeAsync(0)
    expectHidden(el)
    expect(floating.autoUpdate).not.toHaveBeenCalled()
  })

  it('ignores an old position result when another anchor takes ownership', async () => {
    const a = anchor()
    const b = anchor()
    const pending = deferredPosition()
    floating.computePosition.mockReturnValueOnce(pending.promise)
    showTooltipForAnchor(a, 'A', 'top', true)
    showTooltipForAnchor(b, 'B', 'bottom', true)
    await vi.advanceTimersByTimeAsync(0)
    const transform = tooltip().style.transform
    pending.resolve({ x: 100, y: 100 })
    await vi.advanceTimersByTimeAsync(0)
    expect(tooltip().textContent).toBe('B')
    expect(tooltip().dataset.placement).toBe('bottom')
    expect(tooltip().style.transform).toBe(transform)
    expect(a.hasAttribute('aria-describedby')).toBe(false)
    expect(b.getAttribute('aria-describedby')).toBe(tooltip().id)
    expect(floating.autoUpdate).toHaveBeenCalledTimes(1)
    expect(floating.autoUpdate.mock.calls[0][0]).toBe(b)
  })

  it('stops the previous autoUpdate and removes its aria association on a switch', async () => {
    const a = anchor()
    showTooltipForAnchor(a, 'A', 'top', true)
    await vi.advanceTimersByTimeAsync(0)
    showTooltipForAnchor(anchor(), 'B')
    expect(floating.cleanup).toHaveBeenCalledTimes(1)
    expect(a.hasAttribute('aria-describedby')).toBe(false)
    await vi.advanceTimersByTimeAsync(80)
    expect(tooltip().textContent).toBe('B')
    expect(isTooltipVisible()).toBe(true)
  })

  it('ignores a pending autoUpdate result after hiding', async () => {
    const el = anchor()
    showTooltipForAnchor(el, 'A', 'top', true)
    await vi.advanceTimersByTimeAsync(0)
    const pending = deferredPosition()
    floating.computePosition.mockReturnValueOnce(pending.promise)
    floating.autoUpdate.mock.calls[0][2]()
    hideTooltip(true)
    const transform = tooltip().style.transform
    pending.resolve({ x: 200, y: 200 })
    await vi.advanceTimersByTimeAsync(0)
    expectHidden(el)
    expect(tooltip().style.transform).toBe(transform)
    expect(floating.cleanup).toHaveBeenCalledTimes(1)
  })

  it('cleans up a detached anchor on an autoUpdate callback', async () => {
    const el = anchor()
    showTooltipForAnchor(el, 'A', 'top', true)
    await vi.advanceTimersByTimeAsync(0)
    el.remove()
    floating.autoUpdate.mock.calls[0][2]()
    await vi.advanceTimersByTimeAsync(0)
    expectHidden(el)
    expect(floating.cleanup).toHaveBeenCalledTimes(1)
  })

  it.each(['queued', 'positioning', 'visible'])('cleans up a %s link on unmount', async (state) => {
    const [el] = await renderLinks(['A'])
    const pending = deferredPosition()
    if (state === 'positioning')
      floating.computePosition.mockReturnValueOnce(pending.promise)
    hover(el)
    if (state !== 'queued')
      await vi.advanceTimersByTimeAsync(80)
    await renderLinks([])
    pending.resolve({ x: 100, y: 100 })
    await vi.advanceTimersByTimeAsync(300)
    expectHidden(el)
    expect(floating.autoUpdate).toHaveBeenCalledTimes(state === 'visible' ? 1 : 0)
    expect(floating.cleanup).toHaveBeenCalledTimes(state === 'visible' ? 1 : 0)
  })

  it.each(['queued', 'visible'])('keeps B %s when A unmounts', async (state) => {
    const [a, b] = await renderLinks(['A', 'B'])
    hover(a)
    await vi.advanceTimersByTimeAsync(80)
    hover(b)
    if (state === 'visible')
      await vi.advanceTimersByTimeAsync(80)
    await renderLinks(['B'])
    await vi.advanceTimersByTimeAsync(200)
    expect(a.isConnected).toBe(false)
    expect(isTooltipVisible()).toBe(true)
    expect(tooltip().textContent).toBe('B')
    expect(b.getAttribute('aria-describedby')).toBe(tooltip().id)
    expect(a.hasAttribute('aria-describedby')).toBe(false)
    expect(floating.cleanup).toHaveBeenCalledTimes(1)
  })

  it('keeps a shared button tooltip when the previous link unmounts', async () => {
    const [el] = await renderLinks(['A'])
    hover(el)
    await vi.advanceTimersByTimeAsync(80)
    const button = document.createElement('button')
    host.appendChild(button)
    showTooltipForAnchor(button, 'Copy', 'bottom', false, undefined, true)
    await renderLinks([])
    await vi.advanceTimersByTimeAsync(80)
    expect(isTooltipVisible()).toBe(true)
    expect(tooltip().textContent).toBe('Copy')
    expect(tooltip().dataset.dark).toBe('true')
    expect(button.getAttribute('aria-describedby')).toBe(tooltip().id)
    hideTooltip()
    await vi.advanceTimersByTimeAsync(120)
    expectHidden(button)
    expect(floating.cleanup).toHaveBeenCalledTimes(2)
  })

  it.each(['loading', 'disabled'])('cleans up when a link becomes %s', async (state) => {
    const [el] = await renderLinks(['A'])
    hover(el)
    await vi.advanceTimersByTimeAsync(80)
    await renderLinks(['A'], state === 'loading', state !== 'disabled')
    expectHidden(el)
    expect(floating.cleanup).toHaveBeenCalledTimes(1)
  })
})
