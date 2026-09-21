import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InfographicBlockNode from '../packages/markstream-svelte/src/components/InfographicBlockNode.svelte'
import MermaidBlockNode from '../packages/markstream-svelte/src/components/MermaidBlockNode.svelte'
import { enableMermaid } from '../packages/markstream-svelte/src/optional/mermaid'

// The gesture is only claimed when there is a diagram to pan, so the tests need a
// real render. The loaders are stubbed rather than mocked per module, matching the
// Vue tests: rendering stays off the network and off mermaid's layout engine.
const stub = vi.hoisted(() => ({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 220" width="100%">'
    + '<rect x="0" y="0" width="1440" height="220" fill="#e5e7eb" /></svg>',
  // `'never'` keeps the block without a diagram, so the pending/error panel is
  // what the surface shows.
  infographicRender: 'svg' as 'never' | 'svg',
}))

// The infographic loader has no `enable…` hook, so its renderer is mocked.
vi.mock('../packages/markstream-svelte/src/optional/infographic', () => {
  class StubInfographic {
    container: HTMLElement

    constructor(options: { container: HTMLElement }) {
      this.container = options.container
    }

    on() {
      return this
    }

    render() {
      if (stub.infographicRender === 'never')
        return
      this.container.innerHTML = stub.svg
    }

    destroy() {}
  }

  return { getInfographic: async () => StubInfographic }
})

function useRenderedMermaid() {
  enableMermaid(() => ({
    initialize() {},
    parse: async () => true,
    render: async () => ({ svg: stub.svg }),
  }))
}

function useMermaidThatNeverResolves() {
  enableMermaid(() => ({
    initialize() {},
    parse: async () => true,
    render: () => new Promise(() => {}),
  }))
}

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

async function flush() {
  await tick()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve))
  await tick()
}

type DiagramKind = 'infographic' | 'mermaid'

function diagramNode(kind: DiagramKind) {
  return kind === 'mermaid'
    ? {
        type: 'code_block',
        language: 'mermaid',
        code: 'graph LR\nA-->B\n',
        raw: '```mermaid\ngraph LR\nA-->B\n```',
      }
    : {
        type: 'code_block',
        language: 'infographic',
        code: 'infographic list-row-simple-horizontal-arrow',
        raw: '```infographic\ninfographic list-row-simple-horizontal-arrow\n```',
      }
}

// The mermaid preview scales the pan surface itself; the infographic preview
// scales the layer it renders into.
function selectors(kind: DiagramKind) {
  return kind === 'mermaid'
    ? {
        surface: '.mermaid-preview',
        wrapper: '.mermaid-preview',
        diagram: '.mermaid-preview svg',
        resetZoom: '.mermaid-zoom-reset',
        modalWrapper: '.mermaid-modal-content',
      }
    : {
        surface: '.infographic-render',
        wrapper: '.infographic-render > div',
        diagram: '.infographic-render > div svg',
        resetZoom: '.infographic-zoom-reset',
        modalWrapper: '.infographic-modal-content',
      }
}

function mountBlock(kind: DiagramKind) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const props: Record<string, unknown> = { node: diagramNode(kind), loading: false }
  if (kind === 'mermaid')
    // Keep the off-thread parse probe from waiting out its real timeout.
    props.workerTimeoutMs = 20
  const instance = mount(kind === 'mermaid' ? (MermaidBlockNode as any) : (InfographicBlockNode as any), { target: root, props })
  return { instance, root }
}

async function waitForDiagram(root: HTMLElement, kind: DiagramKind, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    await flush()
    if (root.querySelector(selectors(kind).diagram))
      return
  }
  throw new Error('The stubbed diagram render never reached the preview.')
}

async function mountPreview(kind: DiagramKind) {
  if (kind === 'mermaid')
    useRenderedMermaid()
  else
    stub.infographicRender = 'svg'

  const mounted = mountBlock(kind)
  await waitForDiagram(mounted.root, kind)

  const surface = mounted.root.querySelector<HTMLElement>(selectors(kind).surface)!
  const wrapper = mounted.root.querySelector<HTMLElement>(selectors(kind).wrapper)!
  return { ...mounted, surface, transform: () => wrapper.style.transform, wrapper }
}

function zoomButton(root: HTMLElement, label: string) {
  const button = root.querySelector<HTMLButtonElement>(`.markstream-svelte-zoom-controls [aria-label="${label}"]`)
  if (!button)
    throw new Error(`The ${label} zoom control was not rendered.`)
  return button
}

// `touch-action: none` comes from the `.markstream-svelte-pan-touch` rule in the
// package stylesheet: jsdom drops the declaration from an inline style, so the
// class the block binds is what the test can observe.
function claimsTouch(element: HTMLElement) {
  return element.classList.contains('markstream-svelte-pan-touch')
}

async function openModal(root: HTMLElement) {
  root.querySelector<HTMLButtonElement>('[aria-label="Open"]')!.click()
  await flush()
  return document.body.querySelector<HTMLElement>('.mermaid-modal-body')!
}

afterEach(() => {
  stub.infographicRender = 'svg'
  document.body.innerHTML = ''
})

function panSuite(kind: DiagramKind) {
  describe(`markstream-svelte ${kind} block pan gesture`, () => {
    it('keeps panning after the pointer leaves the preview box', async () => {
      const { instance, surface, transform } = await mountPreview(kind)

      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))

      // The gesture must follow the pointer instead of stopping at the box edge.
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 20, clientY: 150 }))
      await flush()
      expect(transform()).toContain('translate(-180px, -50px)')

      // And keep going well outside the box on both axes.
      document.body.dispatchEvent(pointerEvent('pointermove', { clientX: -600, clientY: 900 }))
      await flush()
      expect(transform()).toContain('translate(-800px, 700px)')

      await unmount(instance)
    })

    it('stops following the pointer once the gesture ends', async () => {
      const { instance, surface, transform } = await mountPreview(kind)

      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
      await flush()
      expect(transform()).toContain('translate(40px, 0px)')

      window.dispatchEvent(pointerEvent('pointerup', { clientX: 140, clientY: 100 }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 900 }))
      await flush()
      expect(transform()).toContain('translate(40px, 0px)')

      await unmount(instance)
    })

    it('leaves touch swipes to the page until the diagram is zoomed in', async () => {
      const { instance, root, surface, transform } = await mountPreview(kind)

      // At fit zoom the page keeps the swipe, so the surface does not claim it.
      expect(claimsTouch(surface)).toBe(false)

      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
      await flush()
      expect(transform()).toContain('translate(0px, 0px)')

      // A mouse still pans at fit zoom.
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100 }))
      await flush()
      expect(transform()).toContain('translate(-60px, 0px)')
      window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100 }))

      // Zoom in through the control the block renders.
      const zoomIn = zoomButton(root, 'Zoom in')
      for (let index = 0; index < 10; index++)
        zoomIn.click()
      await flush()
      expect(claimsTouch(surface)).toBe(true)

      // Zoomed in, the surface claims the gesture, so touch pans with it.
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
      await flush()
      expect(transform()).toContain('translate(-120px, 0px)')

      await unmount(instance)
    })

    it('claims the touch gesture on the fullscreen modal surface at fit zoom', async () => {
      const { instance, root } = await mountPreview(kind)

      const modalSurface = await openModal(root)
      const modalWrapper = document.body.querySelector<HTMLElement>(selectors(kind).modalWrapper)!
      expect(claimsTouch(modalSurface)).toBe(true)

      // The modal fills the viewport, so panning is the intended gesture there.
      modalSurface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 30, clientY: 60, pointerType: 'touch' }))
      await flush()
      expect(modalWrapper.style.transform).toContain('translate(-70px, -40px)')

      await unmount(instance)
    })

    it('resets the translation with the zoom reset control', async () => {
      const { instance, root, surface, transform } = await mountPreview(kind)

      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 120, clientY: 260 }))
      await flush()
      expect(transform()).toContain('translate(-80px, 60px)')

      root.querySelector<HTMLButtonElement>(`.markstream-svelte-zoom-controls ${selectors(kind).resetZoom}`)!.click()
      await flush()
      expect(transform()).toContain('translate(0px, 0px) scale(1)')

      await unmount(instance)
    })

    it('leaves the surface alone while the diagram is still missing', async () => {
      if (kind === 'mermaid')
        useMermaidThatNeverResolves()
      else
        stub.infographicRender = 'never'

      const { instance, root } = mountBlock(kind)
      await flush()

      // No diagram yet: the block renders the pending/error panel there, and that
      // text stays selectable because the gesture is not claimed.
      expect(root.querySelector(selectors(kind).diagram)).toBeNull()
      const surface = root.querySelector<HTMLElement>(selectors(kind).surface)!
      const wrapper = root.querySelector<HTMLElement>(selectors(kind).wrapper)!

      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 200 }))
      await flush()
      expect(wrapper.style.transform).toContain('translate(0px, 0px)')

      await unmount(instance)
    })

    it('stops the gesture when the component is destroyed', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const { instance, surface } = await mountPreview(kind)

      // Idle: nothing is paid for on every pointer move of the page.
      expect(addSpy.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(0)

      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
      expect(addSpy.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(1)

      await unmount(instance)
      expect(removeSpy.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(1)
    })
  })
}

panSuite('mermaid')
panSuite('infographic')
