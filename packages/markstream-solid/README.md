# markstream-solid

Solid streaming Markdown renderer for incomplete Markdown, AI chat output, code blocks, KaTeX, Mermaid, D2, and Infographic.

Status: **beta**. Behavior baseline is `markstream-svelte`. See [CAPABILITY.md](./CAPABILITY.md) for supported / alias / internal / test-hook / not-wired exports.

```bash
pnpm add markstream-solid solid-js
```

Optional renderers are peers:

```bash
pnpm add stream-diffs katex mermaid @terrastruct/d2 @antv/infographic
```

```tsx
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, final: boolean }) {
  return <MarkdownRender content={props.content} final={props.final} />
}
```

`stream` / `codeBlockStream` resolve as `stream ?? context.codeBlockStream ?? true` and gate code-block editor create/update (ordinary code, diff, append, final, mode switch). Nested `smoothStreaming="auto"` does not double-smooth when a parent is already smoothing; `smoothStreaming={true}` still opts in.

`setCustomComponents(map)` is a process-wide default. `setCustomComponents(id, map)` / `removeCustomComponents(id)` register a table for that `customId`. Isolate two renderers with the `customComponents` prop; a local map overrides the registry.

`showTooltips` defaults to `true` and covers LinkNode, code-block toolbar hover/focus, and post-complete HTML enhancement titles. `showTooltips={false}` turns the Markstream singleton tooltip off on those paths. An explicit `codeBlockProps.showTooltips` overrides the renderer-level boolean.

## Limits

- The main renderer does not virtualize. `maxLiveNodes` only gates `smoothStreaming="auto"`.
- `debugPerformance={true}` logs `[markstream-solid][perf] parse(sync)` from the renderer parse path only (`ms`, `nodes`, `contentLength`). It is not a virtualization monitor.
- `smoothStreamingOptions` are read when the renderer instance is created.
- Missing optional peers degrade to source fallbacks. In-process `disable*()` is not a missing-peer proof; use the packed consumer scripts below.

The package also exposes `index.tailwind.css`, `index.px.css`, Worker clients under `workers/*`, and optional loader configuration APIs.

## Re-run checks

```sh
pnpm --filter markstream-solid typecheck
pnpm --filter markstream-solid test
pnpm --filter markstream-solid build
pnpm test:smoke:solid
pnpm test:smoke:solid:optional
```

Cross-framework sanitize / worker / loader sync points: [SYNC.md](./SYNC.md).
