// D2 derives the ids and style-scope classes of its SVG output from a hash of the
// diagram source, so two identical diagrams would otherwise emit duplicate
// `id`/`url(#…)` targets and two document-level `.d2-<hash>` style scopes — one
// of them then wins and the diagrams get each other's colours. D2 exposes
// `RenderOptions.salt` for exactly this case ("useful when generating multiple
// identical diagrams to be included in the same HTML doc"). Every render takes a
// fresh salt from this module-scoped counter, which the block component and
// `enhanceRenderedHtml` share, so both render paths stay unique on one page.
let d2RenderSaltSequence = 0

export function createD2RenderSalt(prefix = 'markstream-svelte-d2') {
  d2RenderSaltSequence += 1
  return `${prefix}-${d2RenderSaltSequence}`
}
