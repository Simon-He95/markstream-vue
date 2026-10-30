function readCssPx(value: string | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export type VirtualItemLayoutReadCounter = (label: string) => void

function countLayoutRead(counter: VirtualItemLayoutReadCounter | undefined, label: string) {
  counter?.(label)
}

export function readElementBoxHeight(
  element: HTMLElement | null | undefined,
  countRead?: VirtualItemLayoutReadCounter,
) {
  if (!element)
    return 0

  countLayoutRead(countRead, 'readElementBoxHeight.offsetHeight')

  return Math.ceil(Math.max(0, element.offsetHeight || 0))
}

export function readElementOuterHeight(
  element: HTMLElement | null | undefined,
  countRead?: VirtualItemLayoutReadCounter,
) {
  const boxHeight = readElementBoxHeight(element, countRead)
  if (!element || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
    return boxHeight

  countLayoutRead(countRead, 'readElementOuterHeight.getComputedStyle')
  const style = window.getComputedStyle(element)
  const marginTop = readCssPx(style.marginTop)
  const marginBottom = readCssPx(style.marginBottom)

  return Math.ceil(Math.max(0, boxHeight + marginTop + marginBottom))
}

export function findMarkstreamRenderer(element: HTMLElement | null | undefined) {
  if (!element)
    return null

  if (element.matches?.('.markstream-solid.markdown-renderer'))
    return element

  return element.querySelector<HTMLElement>('.markstream-solid.markdown-renderer')
}

export function getMarkdownItemChromeHeight(
  element: HTMLElement | null | undefined,
  countRead?: VirtualItemLayoutReadCounter,
  outerHeight?: number,
) {
  if (!element)
    return 0

  const renderer = findMarkstreamRenderer(element)
  if (!renderer)
    return 0

  const outer = Number.isFinite(outerHeight)
    ? Number(outerHeight)
    : readElementOuterHeight(element, countRead)
  const rendererBox = readElementBoxHeight(renderer, countRead)

  return Math.max(0, outer - rendererBox)
}
