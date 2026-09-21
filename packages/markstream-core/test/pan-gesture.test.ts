import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPanGesture } from '../src/pan-gesture'

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

function createHarness(options: { canStart?: (event: PointerEvent) => boolean } = {}) {
  const translate = { x: 0, y: 0 }
  const activeChanges: boolean[] = []
  const gesture = createPanGesture({
    getTranslate: () => ({ ...translate }),
    setTranslate: (next) => {
      translate.x = next.x
      translate.y = next.y
    },
    canStart: options.canStart,
    onActiveChange: active => activeChanges.push(active),
  })
  return { gesture, translate, activeChanges }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createPanGesture', () => {
  it('follows the pointer after it leaves the surface', () => {
    const { gesture, translate } = createHarness()

    gesture.start(pointerEvent('pointerdown', { clientX: 200, clientY: 200 }) as PointerEvent)
    // The listener is on window, so a move far outside the surface still counts.
    window.dispatchEvent(pointerEvent('pointermove', { clientX: -600, clientY: 900 }))

    expect(translate).toEqual({ x: -800, y: 700 })
  })

  it('translates from the position the gesture started at', () => {
    const { gesture, translate } = createHarness()

    translate.x = 40
    translate.y = -10
    gesture.start(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }) as PointerEvent)
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 130, clientY: 90 }))

    expect(translate).toEqual({ x: 70, y: -20 })
  })

  it('stops following the pointer once the gesture ends', () => {
    const { gesture, translate, activeChanges } = createHarness()

    gesture.start(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }) as PointerEvent)
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
    expect(translate).toEqual({ x: 40, y: 0 })

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 140, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 900 }))

    expect(translate).toEqual({ x: 40, y: 0 })
    expect(gesture.isActive()).toBe(false)
    expect(activeChanges).toEqual([true, false])
  })

  it('ends the gesture when a move reports nothing pressed', () => {
    const { gesture, translate } = createHarness()

    gesture.start(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }) as PointerEvent)
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 100 }))
    expect(translate).toEqual({ x: 40, y: 0 })

    // A release outside the window delivers no pointerup.
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 100, buttons: 0 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 100, buttons: 0 }))

    expect(translate).toEqual({ x: 40, y: 0 })
    expect(gesture.isActive()).toBe(false)
  })

  it('ends the gesture on blur, pointercancel and stop()', () => {
    for (const endEvent of ['blur', 'pointercancel'] as const) {
      const { gesture, translate } = createHarness()
      gesture.start(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }) as PointerEvent)
      window.dispatchEvent(new Event(endEvent))
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 100 }))
      expect(translate).toEqual({ x: 0, y: 0 })
      expect(gesture.isActive()).toBe(false)
    }

    const { gesture, translate } = createHarness()
    gesture.start(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }) as PointerEvent)
    gesture.stop()
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 100 }))
    expect(translate).toEqual({ x: 0, y: 0 })
    expect(gesture.isActive()).toBe(false)
  })

  it('ignores non-primary buttons and pointers joining mid-gesture', () => {
    const { gesture, translate } = createHarness()

    gesture.start(pointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 2 }) as PointerEvent)
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 300 }))
    expect(translate).toEqual({ x: 0, y: 0 })

    gesture.start(pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }) as PointerEvent)
    // A second finger must neither take the gesture over nor end it.
    gesture.start(pointerEvent('pointerdown', { clientX: 400, clientY: 400, pointerId: 2 }) as PointerEvent)
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 500, pointerId: 2 }))
    expect(translate).toEqual({ x: 0, y: 0 })

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 400, clientY: 400, pointerId: 2 }))
    expect(gesture.isActive()).toBe(true)
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 160, clientY: 100, pointerId: 1 }))
    expect(translate).toEqual({ x: 60, y: 0 })
  })

  it('honours canStart and does not claim the gesture when it declines', () => {
    const canStart = vi.fn((event: PointerEvent) => event.pointerType !== 'touch')
    const { gesture, translate, activeChanges } = createHarness({ canStart })

    const touchDown = pointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    const preventDefault = vi.spyOn(touchDown, 'preventDefault')
    gesture.start(touchDown as PointerEvent)

    expect(canStart).toHaveBeenCalledTimes(1)
    // Declining must leave text selection and the page scroll alone.
    expect(preventDefault).not.toHaveBeenCalled()
    expect(gesture.isActive()).toBe(false)
    expect(activeChanges).toEqual([])

    window.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 100, pointerType: 'touch' }))
    expect(translate).toEqual({ x: 0, y: 0 })
  })

  it('prevents the default only when it claims the gesture', () => {
    const { gesture } = createHarness()

    const event = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    gesture.start(event as PointerEvent)

    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('listens on window only while a gesture is in progress', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { gesture } = createHarness()

    expect(addSpy.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(0)

    gesture.start(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }) as PointerEvent)
    expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('blur', expect.any(Function))

    window.dispatchEvent(pointerEvent('pointerup', { clientX: 10, clientY: 10 }))
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function))
  })

  it('detaches the listeners when stopped twice', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { gesture } = createHarness()

    gesture.start(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }) as PointerEvent)
    gesture.stop()
    gesture.stop()

    // The second stop must not report another deactivation to the caller.
    expect(removeSpy.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(1)
  })
})
