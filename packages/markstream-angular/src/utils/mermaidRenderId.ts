// Mermaid keys both its temporary render container (`#d<id>`) and the produced
// `<svg id>` by the id handed to `mermaid.render`, then resolves that id again
// when it binds interactions. The id therefore has to be unique across every
// diagram on the page, not only inside one render path: the block component and
// `enhanceRenderedHtml` used to keep separate counters that both started at
// `markstream-angular-mermaid-1`, so mixing the two paths on one page made
// Mermaid delete the other render's container and leave a blank preview
// (issue #775). Both now share this module-scoped counter.
let mermaidRenderSequence = 0

export function createMermaidRenderId(prefix = 'markstream-angular-mermaid') {
  mermaidRenderSequence += 1
  return `${prefix}-${mermaidRenderSequence}`
}
