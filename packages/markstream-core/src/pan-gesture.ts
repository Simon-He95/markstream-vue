/**
 * Framework-agnostic pointer pan gesture shared by the diagram blocks
 * (mermaid, infographic, …) in every markstream package.
 *
 * The surface only has to call `start` from its `pointerdown`. While a gesture is
 * in progress the move/up listeners live on `window`, so the drag keeps following
 * the pointer after it leaves the preview box — binding them to the surface
 * stopped the pan at its edge, and reaching the far side of a wide diagram took
 * several drags.
 *
 * The listeners are attached on `pointerdown` and removed as soon as the gesture
 * ends, so an idle block pays nothing per pointer move of the page.
 */

export interface PanPoint {
  x: number
  y: number
}

export interface PanGestureOptions {
  /** Current translation, read when the gesture starts. */
  getTranslate: () => PanPoint
  /** Applies the translation for the current pointer position. */
  setTranslate: (next: PanPoint) => void
  /**
   * Whether this pointer may claim the gesture. Defaults to allowing every
   * pointer. Use it to keep a swipe on the page until panning can reveal
   * something, or while there is no diagram to pan.
   */
  canStart?: (event: PointerEvent) => boolean
  /** Reports the gesture becoming active/inactive, e.g. for the grab cursor. */
  onActiveChange?: (active: boolean) => void
}

export interface PanGesture {
  /** Handle the surface's `pointerdown` with this. */
  start: (event: PointerEvent) => void
  /** End an in-flight gesture and detach the window listeners. */
  stop: () => void
  /** Whether a gesture is currently in progress. */
  isActive: () => boolean
}

export function createPanGesture(options: PanGestureOptions): PanGesture {
  const { getTranslate, setTranslate, canStart, onActiveChange } = options

  let pointerId: number | null = null
  let startPointer: PanPoint = { x: 0, y: 0 }
  let startTranslate: PanPoint = { x: 0, y: 0 }

  function stop(e?: Event) {
    // A second pointer lifting must not end the gesture that is in progress.
    const endedPointerId = (e as PointerEvent | undefined)?.pointerId
    if (endedPointerId != null && endedPointerId !== pointerId)
      return

    if (pointerId == null)
      return

    pointerId = null
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
    onActiveChange?.(false)
  }

  function onMove(event: PointerEvent) {
    if (pointerId == null || event.pointerId !== pointerId)
      return

    // Nothing is pressed any more: the release happened outside the window,
    // where no pointerup is delivered.
    if (event.buttons === 0) {
      stop()
      return
    }

    setTranslate({
      x: startTranslate.x + (event.clientX - startPointer.x),
      y: startTranslate.y + (event.clientY - startPointer.y),
    })
  }

  function start(event: PointerEvent) {
    // Primary button only, and never a second pointer joining an active gesture.
    if (event.button !== 0 || pointerId != null)
      return
    if (canStart && !canStart(event))
      return

    // Suppresses text selection and the compatibility mouse events for the drag.
    event.preventDefault()

    pointerId = event.pointerId
    startPointer = { x: event.clientX, y: event.clientY }
    startTranslate = getTranslate()

    if (typeof window === 'undefined') {
      pointerId = null
      return
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    // Releasing the button outside the window fires no pointerup, and the drag
    // would otherwise keep following the pointer.
    window.addEventListener('blur', stop)
    onActiveChange?.(true)
  }

  return {
    start,
    stop,
    isActive: () => pointerId != null,
  }
}
