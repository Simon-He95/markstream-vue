import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { hideTooltip, showTooltipForAnchor } from '../src/composables/useSingletonTooltip'

enableAutoUnmount(afterEach)

function mountLink(title = 'Example') {
  return mount(NodeRenderer, {
    attachTo: document.body,
    props: {
      batchRendering: false,
      typewriter: false,
      nodes: [{
        type: 'link',
        href: 'https://example.com',
        title,
        text: title,
        raw: `[${title}](https://example.com)`,
        children: [{ type: 'text', content: title, raw: title }],
      }],
    },
  })
}

function tooltip() {
  return document.querySelector<HTMLElement>('[role="tooltip"]')
}

async function finishShow() {
  await vi.advanceTimersByTimeAsync(80)
  await vi.dynamicImportSettled()
  await nextTick()
}

describe('singleton tooltip', () => {
  afterEach(() => {
    hideTooltip(true)
    vi.useRealTimers()
  })

  it('does not mount before the delayed show fires', async () => {
    vi.useFakeTimers()
    const anchor = document.createElement('a')
    document.body.appendChild(anchor)

    showTooltipForAnchor(anchor, 'https://example.com')

    await vi.dynamicImportSettled()
    await nextTick()
    expect(document.querySelector('[data-singleton-tooltip="1"]')).toBeNull()

    hideTooltip(true)
    await vi.advanceTimersByTimeAsync(80)
    expect(document.querySelector('[data-singleton-tooltip="1"]')).toBeNull()

    anchor.remove()
  })

  it('cancels an unmounted link while the singleton is loading', async () => {
    vi.useFakeTimers()
    const link = mountLink()
    const anchor = link.get('a').element
    await link.get('a').trigger('mouseenter')

    vi.advanceTimersByTime(80)
    expect(document.querySelector('[data-singleton-tooltip="1"]')).toBeNull()
    link.unmount()
    await vi.dynamicImportSettled()
    await nextTick()

    expect(tooltip()?.style.display ?? 'none').toBe('none')
    expect(anchor.hasAttribute('aria-describedby')).toBe(false)
  })

  it('cancels an unmounted link before its show delay finishes', async () => {
    vi.useFakeTimers()
    const link = mountLink()
    await link.get('a').trigger('mouseenter')
    link.unmount()
    await finishShow()

    expect(tooltip()?.style.display ?? 'none').toBe('none')
  })

  it('hides the visible tooltip when its link unmounts', async () => {
    vi.useFakeTimers()
    const link = mountLink()
    const anchor = link.get('a').element
    await link.get('a').trigger('mouseenter')
    await finishShow()
    expect(tooltip()?.textContent).toContain('Example')
    expect(tooltip()?.style.display).not.toBe('none')

    link.unmount()
    await nextTick()

    expect(tooltip()?.style.display).toBe('none')
    expect(anchor.hasAttribute('aria-describedby')).toBe(false)
  })

  it.each([false, true])('keeps the newer link tooltip when an old link unmounts (visible: %s)', async (visible) => {
    vi.useFakeTimers()
    const oldLink = mountLink('Old link')
    const newLink = mountLink('New link')
    await oldLink.get('a').trigger('mouseenter')
    await finishShow()
    await newLink.get('a').trigger('mouseenter')
    if (visible)
      await finishShow()

    oldLink.unmount()
    await finishShow()

    expect(tooltip()?.textContent).toContain('New link')
    expect(tooltip()?.style.display).not.toBe('none')
    expect(newLink.get('a').attributes('aria-describedby')).toBeTruthy()
  })

  it.each(['loading', 'disabled'])('hides the link tooltip when it becomes %s', async (state) => {
    vi.useFakeTimers()
    const link = mountLink()
    await link.get('a').trigger('mouseenter')
    await finishShow()

    await link.setProps(state === 'loading'
      ? { nodes: [{ ...link.props('nodes')![0], loading: true }] }
      : { showTooltips: false })

    expect(tooltip()?.style.display).toBe('none')
  })
})
