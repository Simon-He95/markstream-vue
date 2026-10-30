export interface DiffLineMetric {
  rowHeight: number
  originalHeight: number
  modifiedHeight: number
}

function readPx(value: string | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function readNaturalHeight(line: HTMLElement | null, base: number) {
  if (!line)
    return base
  if (line.classList.contains('markstream-pre__diff-line--collapsed'))
    return 32
  const content = line.querySelector<HTMLElement>('.markstream-pre__diff-content')
  return Math.max(base, Math.ceil(content?.getBoundingClientRect().height ?? 0))
}

export function measurePreCodeDiffLines(root: HTMLElement, previous: DiffLineMetric[]): DiffLineMetric[] {
  const style = window.getComputedStyle(root)
  const base = readPx(style.getPropertyValue('--markstream-pre-diff-line-height'))
    || readPx(style.lineHeight)
    || 18
  const original = root.querySelectorAll<HTMLElement>('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
  const modified = root.querySelectorAll<HTMLElement>('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')
  const next = Array.from({ length: Math.max(original.length, modified.length) }, (_, index) => {
    const originalHeight = readNaturalHeight(original[index] ?? null, base)
    const modifiedHeight = readNaturalHeight(modified[index] ?? null, base)
    return {
      rowHeight: Math.max(base, originalHeight, modifiedHeight),
      originalHeight,
      modifiedHeight,
    }
  })
  return next.length === previous.length && next.every((item, index) => {
    const old = previous[index]
    return old
      && Math.abs(item.rowHeight - old.rowHeight) <= 0.5
      && Math.abs(item.originalHeight - old.originalHeight) <= 0.5
      && Math.abs(item.modifiedHeight - old.modifiedHeight) <= 0.5
  })
    ? previous
    : next
}
