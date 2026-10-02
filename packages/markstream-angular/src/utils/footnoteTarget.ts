// Footnote ids are derived from the markdown label (`fnref-<label>` / `fnref--<label>`), so the
// same id can exist in several renderer trees on one page. Resolve the target inside the tree the
// clicked element belongs to, and only fall back to the document when that tree has no match.
const RENDERER_ROOT_SELECTOR = '.markdown-renderer'

function toIdSelector(id: string) {
  return `[id="${id.replace(/["\\]/g, '\\$&')}"]`
}

export function findFootnoteElement(source: EventTarget | null | undefined, id: string): Element | null {
  if (typeof document === 'undefined' || typeof Element === 'undefined')
    return null

  const selector = toIdSelector(id)
  let scope = source instanceof Element ? source.closest(RENDERER_ROOT_SELECTOR) : null
  while (scope) {
    const found = scope.querySelector(selector)
    if (found)
      return found
    scope = scope.parentElement?.closest(RENDERER_ROOT_SELECTOR) ?? null
  }

  return document.querySelector(selector)
}
