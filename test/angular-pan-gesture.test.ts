import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { enableMermaid } from '../packages/markstream-angular/src/optional/mermaid'

// These tests exercise the pan wiring on the component instances instead of a
// mounted template: @angular/platform-browser (and its testing platform) is not a
// dependency of markstream-angular, so TestBed cannot boot in this workspace.
// The instances still run the real constructor — and therefore the real
// `createPanGesture` wiring — inside an injection context, the tests call the
// very handler the template binds ((pointerdown)="onPanStart($event)") and then
// drive window pointer events, which is where the shared helper listens. The
// template bindings themselves are asserted in the last test of this file.
//
// @angular/core and @angular/compiler are only installed for the angular package,
// so they are resolved from there (same pattern as the other angular tests).
const require = createRequire(import.meta.url)
const angularPaths = [
  resolve(process.cwd(), 'packages/markstream-angular'),
  resolve(process.cwd(), 'node_modules/.pnpm/node_modules'),
]
await import(require.resolve('@angular/compiler', { paths: angularPaths }))
const { ChangeDetectorRef, ElementRef, Injector, runInInjectionContext } = await import(
  require.resolve('@angular/core', { paths: angularPaths }),
) as any

const infographicStub = vi.hoisted(() => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 220" width="100%"><rect x="0" y="0" width="1440" height="220" fill="#e5e7eb" /></svg>'

  // The angular package has no infographic loader hook (unlike mermaid's
  // enableMermaid), so the optional loader module is stubbed instead. The fake
  // mirrors the surface the block uses: it appends an <svg> to the container it
  // is given and reports a completed render.
  class FakeInfographic {
    private readonly container: HTMLElement

    constructor(options: { container: HTMLElement }) {
      this.container = options.container
    }

    on() {
      return this
    }

    render() {
      this.container.insertAdjacentHTML('afterbegin', svg)
    }

    destroy() {}
  }

  return { FakeInfographic, svg }
})

vi.mock('../packages/markstream-angular/src/optional/infographic', () => ({
  getInfographic: async () => infographicStub.FakeInfographic,
}))

const { MermaidBlockNodeComponent } = await import('../packages/markstream-angular/src/components/MermaidBlockNode/MermaidBlockNode.component')
const { InfographicBlockNodeComponent } = await import('../packages/markstream-angular/src/components/InfographicBlockNode/InfographicBlockNode.component')

const STUB_SVG
  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 220" width="100%">'
    + '<rect x="0" y="0" width="1440" height="220" fill="#e5e7eb" /></svg>'

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
  for (let turn = 0; turn < 8; turn++)
    await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

const cdrStub = {
  markForCheck: () => {},
  detectChanges: () => {},
  detach: () => {},
  reattach: () => {},
  checkNoChanges: () => {},
}

function createComponentInstance<T extends object>(ComponentClass: new () => T): T {
  const injector = Injector.create({
    providers: [{ provide: ChangeDetectorRef, useValue: cdrStub }],
  })
  return runInInjectionContext(injector, () => new ComponentClass())
}

interface BlockHarness {
  component: any
  previewHost: HTMLElement
  modalHost: HTMLElement
  destroy: () => void
}

function createBlock(ComponentClass: new () => any, node: any, props: Record<string, any>): BlockHarness {
  const component: any = createComponentInstance(ComponentClass)
  const previewHost = document.createElement('div')
  const modalHost = document.createElement('div')
  document.body.append(previewHost, modalHost)

  // The template's #previewHost / #modalHost refs, filled in by hand because no
  // template is rendered here.
  component.previewHost = new ElementRef(previewHost)
  component.modalHost = new ElementRef(modalHost)
  component.node = node
  component.props = props

  return {
    component,
    previewHost,
    modalHost,
    destroy: () => {
      if (component.modalOpen)
        component.closeModal()
      component.ngOnDestroy()
      previewHost.remove()
      modalHost.remove()
    },
  }
}

async function waitForSvg(host: HTMLElement, timeoutMs = 2000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    await flush()
    if (host.querySelector('svg'))
      return
  }
  throw new Error('The stubbed render never reached the pan surface.')
}

function useRenderedMermaid() {
  enableMermaid(() => ({
    initialize() {},
    parse: async () => true,
    render: async () => ({ svg: STUB_SVG }),
  }))
}

async function mountMermaidBlock(options: { loading: boolean }) {
  useRenderedMermaid()
  const harness = createBlock(MermaidBlockNodeComponent as any, {
    type: 'code_block',
    language: 'mermaid',
    code: 'graph LR\nA-->B\n',
    raw: '```mermaid\ngraph LR\nA-->B\n```',
  }, { loading: options.loading })

  harness.component.ngAfterViewInit()
  if (options.loading)
    await flush()
  else
    await waitForSvg(harness.previewHost)

  return harness
}

async function mountInfographicBlock(options: { loading: boolean }) {
  const harness = createBlock(InfographicBlockNodeComponent as any, {
    type: 'code_block',
    language: 'infographic',
    code: 'infographic sequence-steps\n  data\n    - label: Step 1\n',
    raw: '```infographic\ninfographic sequence-steps\n```',
  }, { loading: options.loading })

  harness.component.ngAfterViewInit()
  if (options.loading)
    await flush()
  else
    await waitForSvg(harness.previewHost)

  return harness
}

const BLOCKS = [
  { label: 'mermaid', mount: mountMermaidBlock },
  { label: 'infographic', mount: mountInfographicBlock },
]

for (const block of BLOCKS) {
  describe(`markstream-angular ${block.label} block pan gesture`, () => {
    it('keeps panning after the pointer leaves the preview box', async () => {
      const { component, previewHost, destroy } = await block.mount({ loading: false })

      // The gesture is only claimed once there is a diagram to pan.
      expect(previewHost.querySelector('svg')).toBeTruthy()
      expect(component.previewTransform).toContain('translate(0px, 0px) scale(1)')

      const down = pointerEvent('pointerdown', { clientX: 200, clientY: 200 })
      component.onPanStart(down)
      expect(component.isDragging).toBe(true)
      expect(down.defaultPrevented).toBe(true)

      // The listener lives on window, so a move far outside the surface still counts.
      window.dispatchEvent(pointerEvent('pointermove', { clientX: -600, clientY: 900 }))
      expect(component.previewTransform).toContain('translate(-800px, 700px)')

      // ...and keeps following well outside the box on both axes.
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 1400, clientY: -400 }))
      expect(component.previewTransform).toContain('translate(1200px, -600px)')

      window.dispatchEvent(pointerEvent('pointerup', { clientX: 1400, clientY: -400 }))
      expect(component.isDragging).toBe(false)

      destroy()
    })

    it('stops following the pointer once the gesture ends', async () => {
      const { component, destroy } = await block.mount({ loading: false })

      component.onPanStart(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
      expect(component.previewTransform).toContain('translate(40px, 0px)')

      window.dispatchEvent(pointerEvent('pointerup', { clientX: 140, clientY: 100 }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 900 }))
      expect(component.previewTransform).toContain('translate(40px, 0px)')

      destroy()
    })

    it('leaves touch swipes to the page until panning can reveal something', async () => {
      const { component, destroy } = await block.mount({ loading: false })

      // At fit zoom the whole diagram is visible, so the surface keeps its
      // touch-action (the template only sets `none` when this is true).
      expect(component.panSurfaceClaimsTouch).toBe(false)

      const touchDown = pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
      component.onPanStart(touchDown)
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
      expect(component.previewTransform).toContain('translate(0px, 0px)')
      // Not claimed, so the swipe stays with the page and text stays selectable.
      expect(touchDown.defaultPrevented).toBe(false)

      // A mouse still pans at fit zoom.
      component.onPanStart(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100 }))
      expect(component.previewTransform).toContain('translate(-60px, 0px)')
      window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100 }))

      // Zoom in through the control the header renders.
      component.adjustZoom(0.1)
      expect(component.panSurfaceClaimsTouch).toBe(true)

      // Zoomed in, the surface claims the gesture, so touch pans with it.
      const zoomedTouchDown = pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
      component.onPanStart(zoomedTouchDown)
      expect(zoomedTouchDown.defaultPrevented).toBe(true)
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 100, pointerType: 'touch' }))
      expect(component.previewTransform).toContain('translate(-120px, 0px)')
      window.dispatchEvent(pointerEvent('pointerup', { clientX: 40, clientY: 100, pointerType: 'touch' }))

      // The reset control restores both the zoom and the translation.
      component.resetZoom()
      expect(component.previewTransform).toContain('translate(0px, 0px) scale(1)')
      expect(component.panSurfaceClaimsTouch).toBe(false)

      destroy()
    })

    it('claims the gesture in the fullscreen modal even at fit zoom', async () => {
      const { component, modalHost, destroy } = await block.mount({ loading: false })
      expect(component.svgMarkup).toBeTruthy()

      // Source mode takes the inline preview away, so the modal surface has to
      // pass the gate on its own.
      component.setMode(true)
      component.previewHost = undefined
      component.openModal()
      await flush()
      expect(component.modalOpen).toBe(true)
      expect(modalHost.querySelector('svg')).toBeTruthy()
      expect(component.panSurfaceClaimsTouch).toBe(true)

      const down = pointerEvent('pointerdown', { clientX: 300, clientY: 300, pointerType: 'touch' })
      component.onPanStart(down)
      expect(down.defaultPrevented).toBe(true)

      window.dispatchEvent(pointerEvent('pointermove', { clientX: 260, clientY: 200, pointerType: 'touch' }))
      expect(component.previewTransform).toContain('translate(-40px, -100px)')
      // The modal surface mirrors the same translation.
      expect(component.modalTransform).toContain('translate(-40px, -100px)')

      component.closeModal()
      expect(component.panSurfaceClaimsTouch).toBe(false)

      destroy()
    })

    it('leaves the surface alone while the diagram is still missing', async () => {
      const { component, previewHost, destroy } = await block.mount({ loading: true })

      // No svg yet: the block renders the pending source there, and that text stays
      // selectable because the gesture is not claimed.
      previewHost.insertAdjacentHTML('afterbegin', '<pre><code>graph LR</code></pre>')
      expect(previewHost.querySelector('svg')).toBeNull()

      const down = pointerEvent('pointerdown', { clientX: 200, clientY: 200 })
      component.onPanStart(down)
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 40, clientY: 200 }))
      expect(component.previewTransform).toContain('translate(0px, 0px)')
      expect(down.defaultPrevented).toBe(false)
      expect(component.isDragging).toBe(false)

      destroy()
    })

    it('releases the window listeners on destroy', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const { component, destroy } = await block.mount({ loading: false })

      component.onPanStart(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
      expect(component.previewTransform).toContain('translate(40px, 0px)')
      expect(addSpy.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(1)

      component.ngOnDestroy()
      expect(removeSpy.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(1)

      window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 900 }))
      expect(component.previewTransform).toContain('translate(40px, 0px)')

      destroy()
    })
  })
}

describe('markstream-angular pan surfaces', () => {
  it('binds the pan handler, the touch-action and the cursor on every surface', () => {
    // Source-level wiring check: the behavioural tests above call the handler the
    // template binds, but only the template decides whether it is bound at all.
    const mermaidSource = readFileSync(resolve(process.cwd(), 'packages/markstream-angular/src/components/MermaidBlockNode/MermaidBlockNode.component.ts'), 'utf8')
    const infographicSource = readFileSync(resolve(process.cwd(), 'packages/markstream-angular/src/components/InfographicBlockNode/InfographicBlockNode.component.ts'), 'utf8')

    for (const source of [mermaidSource, infographicSource]) {
      // Inline preview + fullscreen modal.
      expect(source.match(/\(pointerdown\)="onPanStart\(\$event\)"/g)).toHaveLength(2)
      expect(source.match(/\[style\.touch-action\]="panSurfaceClaimsTouch \? 'none' : null"/g)).toHaveLength(2)
      expect(source.match(/\[style\.cursor\]="isDragging \? 'grabbing' : 'grab'"/g)).toHaveLength(2)
      // Both transform getters (inline preview and modal) carry the translation.
      expect(source.match(/translate\(\$\{this\.translateX\}px, \$\{this\.translateY\}px\) scale\(/g)).toHaveLength(2)
      // The reset control restores the translation as well as the zoom.
      expect(source).toMatch(/resetZoom\(\) \{\n\s+this\.zoom = 1\n\s+this\.translateX = 0\n\s+this\.translateY = 0/)
      expect(source).toContain('this.panGesture.stop()')
    }
  })
})
