# Vue / React / Svelte Component Parity

`markstream-svelte` exports the same public component names as `markstream-vue` and `markstream-react`.

| Vue / React component | Svelte component | Notes |
| --- | --- | --- |
| `AdmonitionNode` | `AdmonitionNode.svelte` | Markdown admonition block |
| `BlockquoteNode` | `BlockquoteNode.svelte` | Recursive child rendering |
| `CheckboxNode` | `CheckboxNode.svelte` | Task-list checkbox |
| `CodeBlockNode` | `CodeBlockNode.svelte` | Renders a stable `<pre><code>` surface, then uses shared HTML enhancement for Monaco |
| `MarkdownCodeBlockNode` | `MarkdownCodeBlockNode.svelte` | Plain code block parity export |
| `MermaidBlockNode` | `MermaidBlockNode.svelte` | Worker-enhanced through `enhanceRenderedHtml` |
| `D2BlockNode` | `D2BlockNode.svelte` | Optional D2 peer, same loader API |
| `InfographicBlockNode` | `InfographicBlockNode.svelte` | Optional infographic peer, same render path as Angular enhancement |
| `MathInlineNode` / `MathBlockNode` | `MathInlineNode.svelte` / `MathBlockNode.svelte` | KaTeX worker/client API matches other packages |
| `NodeRenderer` | `NodeRenderer.svelte` | Accepts aligned renderer props and Svelte callback props; also exported as `MarkdownRender` |
| Internal renderer helpers | `NodeOutlet.svelte`, `RenderChildren.svelte`, `InlineWrapNode.svelte` | Exported for parity debugging and custom renderer composition |
| All inline/block nodes | Same name `.svelte` component | Exported from package root |

## API Alignment

- Root default export is `NodeRenderer`.
- Component names match the Vue and React package root exports.
- Worker helper exports match the existing package names: `setKaTeXWorker`, `setMermaidWorker`, CDN worker builders, and worker entry paths.
- Optional renderer toggles match existing packages: `enableKatex`, `disableKatex`, `enableMermaid`, `disableMermaid`, `enableD2`, `disableD2`.
- Custom components use `setCustomComponents(customId, mapping)` and receive `node`, `context`/`ctx`, `customId`, `isDark`, `indexKey`, and `typewriter`.
