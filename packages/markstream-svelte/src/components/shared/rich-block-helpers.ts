export async function copyTextToClipboard(source: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(source)
      return true
    }
  }
  catch {
    // Fall back to the textarea path below.
  }

  if (typeof document === 'undefined')
    return false

  const textarea = document.createElement('textarea')
  textarea.value = source
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    document.execCommand('copy')
    return true
  }
  catch {
    return false
  }
  finally {
    textarea.remove()
  }
}

export function clearElement(target: HTMLElement | null | undefined) {
  if (!target)
    return

  try {
    target.replaceChildren()
  }
  catch {
    target.innerHTML = ''
  }
}

export function setElementHtml(target: HTMLElement | null | undefined, html: string) {
  if (!target)
    return
  clearElement(target)
  if (!html)
    return
  try {
    target.insertAdjacentHTML('afterbegin', html)
  }
  catch {
    target.innerHTML = html
  }
}

export function downloadSvgMarkup(svgMarkup: string, filename: string) {
  if (!svgMarkup || typeof document === 'undefined' || typeof URL === 'undefined')
    return

  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function resolveCssSize(value: unknown, fallback?: string) {
  if (value == null || value === '')
    return fallback ?? null
  return typeof value === 'number' ? `${value}px` : String(value)
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
