import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MermaidBlockNode from '../src/components/MermaidBlockNode/MermaidBlockNode.vue'

// jsdom has no PointerEvent constructor, so build a plain event carrying the
// fields the pan handlers read.
function pointerEvent(
  type: string,
  init: { clientX: number, clientY: number, pointerId?: number, button?: number, buttons?: number, pointerType?: string },
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, {
    clientX: init.clientX,
    clientY: init.clientY,
    pointerId: init.pointerId ?? 1,
    button: init.button ?? 0,
    // A pointer move during a gesture reports the button (or finger) as down.
    buttons: init.buttons ?? 1,
    pointerType: init.pointerType ?? 'mouse',
  })
  return event
}

async function mountPreview() {
  const wrapper = mount(MermaidBlockNode as any, {
    props: {
      node: {
        type: 'code_block',
        language: 'mermaid',
        code: 'graph LR\nA-->B\n',
        raw: '```mermaid\ngraph LR\nA-->B\n```',
      },
      loading: false,
    },
    attachTo: document.body,
  })

  // The preview area only exists in preview mode.
  ;(wrapper.vm as any).showSource = false
  await nextTick()

  const surface = wrapper.get('.mermaid-preview-area').element as HTMLElement
  const transform = () => (wrapper.get('[data-mermaid-wrapper]').element as HTMLElement).style.transform

  return { wrapper, surface, transform }
}

describe('mermaid block pan gesture', () => {
  it('keeps panning after the pointer leaves the preview box', async () => {
    const { wrapper, surface, transform } = await mountPreview()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))

    // The gesture must follow the pointer instead of stopping at the box edge.
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 20, clientY: 150 }))
    await nextTick()
    expect(transform()).toContain('translate(-180px, -50px)')

    // And keep going well outside the box on both axes.
    document.body.dispatchEvent(pointerEvent('pointermove', { clientX: -600, clientY: 900 }))
    await nextTick()
    expect(transform()).toContain('translate(-800px, 700px)')

    wrapper.unmount()
  })

  it('stops following the pointer once the gesture ends', async () => {
    const { wrapper, surface, transform } = await mountPreview()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
    await nextTick()
    expect(transform()).toContain('translate(40px, 0px)')

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 140, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 900 }))
    await nextTick()
    expect(transform()).toContain('translate(40px, 0px)')

    wrapper.unmount()
  })

  it('ignores non-primary buttons and pointers joining mid-gesture', async () => {
    const { wrapper, surface, transform } = await mountPreview()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 2 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 300 }))
    await nextTick()
    expect(transform()).toContain('translate(0px, 0px)')

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }))
    // A second finger must neither take the gesture over nor end it.
    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 400, clientY: 400, pointerId: 2 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 500, pointerId: 2 }))
    await nextTick()
    expect(transform()).toContain('translate(0px, 0px)')

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 400, clientY: 400, pointerId: 2 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 160, clientY: 100, pointerId: 1 }))
    await nextTick()
    expect(transform()).toContain('translate(60px, 0px)')

    wrapper.unmount()
  })

  it('ends the gesture when a move reports no button down', async () => {
    const { wrapper, surface, transform } = await mountPreview()

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
    await nextTick()
    expect(transform()).toContain('translate(40px, 0px)')

    // A release outside the window delivers no pointerup, so the gesture has to
    // end on the first move that reports nothing pressed.
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 100, buttons: 0 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 100, buttons: 0 }))
    await nextTick()
    expect(transform()).toContain('translate(40px, 0px)')

    wrapper.unmount()
  })

  it('listens on window only while a drag is in progress', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { wrapper, surface } = await mountPreview()

    // Idle: nothing is paid for on every pointer move of the page.
    expect(addSpy.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(0)

    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function))

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 10, clientY: 10 }))
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))

    // Unmounting mid-gesture must not leave a window listener behind.
    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
    wrapper.unmount()
    expect(removeSpy.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(2)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('claims the touch gesture only once the diagram is zoomed in', async () => {
    const { wrapper, surface } = await mountPreview()

    // At fit zoom the diagram is fully visible, so a swipe must keep scrolling the page.
    expect(surface.classList.contains('mermaid-pan-touch')).toBe(false)

    ;(wrapper.vm as any).zoom = 2
    await nextTick()
    expect(surface.classList.contains('mermaid-pan-touch')).toBe(true)

    wrapper.unmount()
  })

  it('leaves touch swipes to the page at fit zoom and pans once zoomed in', async () => {
    const { wrapper, surface, transform } = await mountPreview()

    // Fit zoom: the page keeps the swipe, so nothing drifts before it scrolls.
    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    await nextTick()
    expect(transform()).toContain('translate(0px, 0px)')

    // A mouse still pans at fit zoom.
    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100 }))
    await nextTick()
    expect(transform()).toContain('translate(-60px, 0px)')
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100 }))

    // Zoomed in: the surface claims the gesture, so touch pans with it.
    ;(wrapper.vm as any).resetZoom()
    ;(wrapper.vm as any).zoom = 2
    await nextTick()
    surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
    await nextTick()
    expect(transform()).toContain('translate(-60px, 0px)')

    wrapper.unmount()
  })

  it('always claims the touch gesture in the fullscreen modal', async () => {
    const { wrapper } = await mountPreview()

    ;(wrapper.vm as any).isModalOpen = true
    await nextTick()
    await nextTick()

    const modalSurface = document.querySelector('.mermaid-modal-panel .mermaid-pan-touch')
    expect(modalSurface).not.toBeNull()

    wrapper.unmount()
  })
})
