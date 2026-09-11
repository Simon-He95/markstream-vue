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

## Limits

- `viewportPriority`, `deferNodesUntilVisible`, `liveNodeBuffer`, and `debugPerformance` are accepted compatibility props. The main renderer does not virtualize (same as Svelte). `render-window` helpers are a tool export only.
- `smoothStreamingOptions` are read when the renderer instance is created.
- Missing optional peers degrade to source fallbacks. In-process `disable*()` is not a missing-peer proof; use the packed consumer scripts below.

The package also exposes `index.tailwind.css`, `index.px.css`, Worker clients under `workers/*`, and optional loader configuration APIs.

## Re-run checks

```sh
pnpm --filter markstream-solid typecheck
pnpm --filter markstream-solid test
pnpm --filter markstream-solid build
pnpm --filter markstream-solid test:ssr
pnpm test:smoke:solid
pnpm test:smoke:solid:optional
```

Cross-framework sanitize / worker / loader sync points: [SYNC.md](./SYNC.md). Type-consumer example: `examples/type-consumer.tsx`.
