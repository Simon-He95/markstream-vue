import type { Ref } from 'vue'

const SCROLL_PARENT_OVERFLOW_RE = /auto|scroll|overlay/i

export interface ViewportRootOptions {
  isClient: boolean
}

export interface ViewportRootController {
  resolveViewportRoot: (node?: HTMLElement | null) => HTMLElement | null
  resolveScrollContainer: (node?: HTMLElement | null) => HTMLElement | null
  isReverseFlexScrollRoot: (root: HTMLElement) => boolean
  getNormalizedScrollTop: (
    root: HTMLElement,
    doc: Document,
    isViewportRoot: boolean,
  ) => number
  getOffsetTopWithinRoot: (node: HTMLElement, root: HTMLElement) => number
}

function hasOverflowScrollStyle(style: CSSStyleDeclaration | null | undefined) {
  if (!style)
    return false

  const overflowY = (style.overflowY || '').toLowerCase()
  const overflow = (style.overflow || '').toLowerCase()

  return SCROLL_PARENT_OVERFLOW_RE.test(overflowY)
    || SCROLL_PARENT_OVERFLOW_RE.test(overflow)
}

function isActuallyScrollableElement(element: HTMLElement) {
  const verticalOverflow = Math.ceil(element.scrollHeight) > Math.ceil(element.clientHeight) + 1
  const horizontalOverflow = Math.ceil(element.scrollWidth) > Math.ceil(element.clientWidth) + 1

  return verticalOverflow || horizontalOverflow
}

export function useViewportRoot(
  containerRef: Ref<HTMLElement | undefined>,
  options: ViewportRootOptions,
): ViewportRootController {
  function resolveViewportRoot(node?: HTMLElement | null) {
    if (typeof window === 'undefined')
      return null

    const base = node ?? containerRef.value

    if (!base)
      return null

    const doc = base.ownerDocument || document
    const rootScrollable = doc.scrollingElement || doc.documentElement

    let current: HTMLElement | null = base

    while (current) {
      if (current === doc.body || current === rootScrollable)
        break

      const style = window.getComputedStyle(current)

      if (hasOverflowScrollStyle(style) && isActuallyScrollableElement(current))
        return current

      current = current.parentElement
    }

    return null
  }

  function resolveScrollContainer(node?: HTMLElement | null) {
    const resolved = resolveViewportRoot(node ?? containerRef.value ?? null)

    if (resolved)
      return resolved

    const host = node?.ownerDocument
      ?? containerRef.value?.ownerDocument
      ?? (typeof document !== 'undefined' ? document : null)

    return (host?.scrollingElement as HTMLElement | null)
      || host?.documentElement
      || null
  }

  function isReverseFlexScrollRoot(root: HTMLElement) {
    if (!options.isClient)
      return false

    try {
      const style = window.getComputedStyle(root)
      const display = (style.display || '').toLowerCase()

      if (!display.includes('flex'))
        return false

      const dir = (style.flexDirection || '').toLowerCase()

      return dir.endsWith('reverse')
    }
    catch {
      return false
    }
  }

  function getNormalizedScrollTop(
    root: HTMLElement,
    doc: Document,
    isViewportRoot: boolean,
  ) {
    if (isViewportRoot)
      return doc.documentElement?.scrollTop ?? doc.body?.scrollTop ?? 0

    const raw = root.scrollTop

    if (!isReverseFlexScrollRoot(root))
      return raw

    const distanceFromBottom = raw < 0 ? -raw : raw
    const max = Math.max(
      0,
      (root.scrollHeight ?? 0) - (root.clientHeight ?? 0),
    )

    return max - distanceFromBottom
  }

  function getOffsetTopWithinRoot(node: HTMLElement, root: HTMLElement) {
    let current: HTMLElement | null = node
    let total = 0
    let guard = 0

    while (current && current !== root && guard++ < 64) {
      total += current.offsetTop || 0
      current = current.offsetParent as HTMLElement | null
    }

    return total
  }

  return {
    resolveViewportRoot,
    resolveScrollContainer,
    isReverseFlexScrollRoot,
    getNormalizedScrollTop,
    getOffsetTopWithinRoot,
  }
}
