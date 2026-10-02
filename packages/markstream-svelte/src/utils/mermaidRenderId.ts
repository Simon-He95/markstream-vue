// Mermaid keys both its temporary render container (`#d<id>`) and the produced
// `<svg id>` by the id handed to `mermaid.render`, then resolves that id again
// when it binds interactions. The id therefore has to be unique across every
// diagram on the page — not just within one block instance: an instance-local
// counter made two blocks render as `markstream-svelte-mermaid-1`, which left
// one of the previews blank (issue #775). This module-scoped counter is shared
// by the block component and `enhanceRenderedHtml`, so both render paths stay
// collision-free on the same page.
let mermaidRenderSequence = 0

export function createMermaidRenderId(prefix = 'markstream-svelte-mermaid') {
  mermaidRenderSequence += 1
  return `${prefix}-${mermaidRenderSequence}`
}
