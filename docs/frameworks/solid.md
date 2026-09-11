---
title: 'Solid streaming Markdown renderer for AI chat'
description: Use markstream-solid to render streamed Markdown in Solid apps for AI chat, incomplete Markdown, Mermaid, KaTeX, and stream-diffs code blocks. Beta API; Svelte is the behavior baseline.
keywords:
  - markstream-solid
  - Solid streaming Markdown renderer
  - Solid AI chat Markdown
  - Solid LLM Markdown renderer
  - Solid incomplete Markdown renderer
  - Solid Mermaid Markdown
  - Solid KaTeX Markdown
softwareName: markstream-solid
softwarePackage: markstream-solid
npmPackage: markstream-solid
softwareFramework: Solid
softwareProgrammingLanguage:
  - TypeScript
  - Solid
---
# Solid streaming Markdown renderer for AI chat

`markstream-solid` is the Solid renderer in the Markstream family. It follows `markstream-svelte` behavior and uses Solid signals, effects, and context. The package is beta.

```bash
pnpm add markstream-solid solid-js
```

```tsx
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, final: boolean }) {
  return <MarkdownRender content={props.content} final={props.final} />
}
```

Optional peers: `stream-diffs`, `katex`, `mermaid`, `@terrastruct/d2`, `@antv/infographic`.

Support, limits, and how to re-run checks: [CAPABILITY.md](https://github.com/Simon-He95/markstream-vue/blob/main/packages/markstream-solid/CAPABILITY.md) in the package. Virtualization props (`viewportPriority`, `deferNodesUntilVisible`, `liveNodeBuffer`) are compatibility no-ops.
