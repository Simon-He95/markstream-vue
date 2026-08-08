---
title: Streaming Mermaid and KaTeX in AI-generated Markdown
description: Use Markstream to render progressive Mermaid diagrams and KaTeX math during AI streaming. Diagrams render incrementally, math defers until expressions are complete.
keywords:
  - streaming Mermaid renderer
  - streaming KaTeX Markdown
  - AI generated Mermaid
  - progressive diagram rendering
  - worker Mermaid rendering
  - worker KaTeX rendering
faq:
  - question: Can Mermaid diagrams render before the full code fence closes?
    answer: Yes. Markstream can progressively parse renderable Mermaid prefixes so users see useful diagram output before the final chunk arrives.
  - question: Why does KaTeX sometimes wait during streaming?
    answer: Partial math often is not valid KaTeX yet, so Markstream defers rendering until the inline or block expression is complete.
  - question: Do Mermaid and KaTeX peers have to be installed together?
    answer: No. Install only the optional peers your AI output needs, and configure workers only for the heavy blocks you enable.
---
# Streaming Mermaid and KaTeX

AI models increasingly output Mermaid diagrams and KaTeX math in their responses. Rendering these during streaming — not after the response is complete — creates a better user experience.

## Progressive Mermaid rendering

When an LLM streams a Mermaid diagram, Markstream renders it incrementally:

```
Chunk 1:  ```mermaid
Chunk 2:  flowchart LR
Chunk 3:    Input --> Parser
Chunk 4:    Parser --> Renderer
Chunk 5:    Renderer --> Output
Chunk 6:  ```
```

At each chunk, Markstream parses the available Mermaid syntax and renders a partial diagram. The user sees the diagram taking shape rather than waiting for the closing fence.

### Setup

```bash
pnpm add markstream-vue mermaid
```

```ts
import { setMermaidWorker } from 'markstream-vue'
import MermaidWorker from 'markstream-vue/workers/mermaidParser.worker?worker&inline'

setMermaidWorker(new MermaidWorker())
```

### Configuration

```vue
<MarkdownRender
  :content="streamingContent"
  :final="isDone"
  :is-dark="isDark"
  :mermaid-props="{
    renderDebounceMs: 180,
    contentStableDelayMs: 500,
    showHeader: true,
    showFullscreenButton: true,
  }"
/>
```

## Streaming KaTeX math

KaTeX math (`$inline$` and `$$block$$`) appears during streaming:

```
Chunk 1:  The formula is $
Chunk 2:  The formula is $E = mc
Chunk 3:  The formula is $E = mc^2$
```

Markstream detects partial math blocks and defers rendering until the expression is complete, avoiding KaTeX errors.

### Setup

```bash
pnpm add markstream-vue katex
```

```ts
import { setKaTeXWorker } from 'markstream-vue'
import KatexWorker from 'markstream-vue/workers/katexRenderer.worker?worker&inline'
import 'katex/dist/katex.min.css'

setKaTeXWorker(new KatexWorker())
```

## Why workers matter

Mermaid and KaTeX are CPU-intensive. Running them in Web Workers:

- Keeps the main thread responsive during streaming
- Prevents UI jank when diagrams re-render on each chunk
- Enables parallel rendering of multiple diagrams

Without workers, parsing a complex Mermaid diagram can block the UI for 50-200ms — noticeable during streaming.

## Framework-specific worker setup

The `?worker` import examples below are for Vite-compatible bundlers. In Next.js, follow the [Next.js guide](/frameworks/next) and keep browser-only worker setup behind client boundaries.

### React

```tsx
import { setKaTeXWorker, setMermaidWorker } from 'markstream-react'
import KatexWorker from 'markstream-react/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-react/workers/mermaidParser.worker?worker&inline'

setMermaidWorker(new MermaidWorker())
setKaTeXWorker(new KatexWorker())
```

### Svelte

```svelte
<script lang="ts">
  import { setMermaidWorker, setKaTeXWorker } from 'markstream-svelte'
  import MermaidWorker from 'markstream-svelte/workers/mermaidParser.worker?worker&inline'
  import KatexWorker from 'markstream-svelte/workers/katexRenderer.worker?worker&inline'

  setMermaidWorker(new MermaidWorker())
  setKaTeXWorker(new KatexWorker())
</script>
```

### Angular

```ts
import { setKaTeXWorker, setMermaidWorker } from 'markstream-angular'
import KatexWorker from 'markstream-angular/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-angular/workers/mermaidParser.worker?worker'

setMermaidWorker(new MermaidWorker())
setKaTeXWorker(new KatexWorker())
```

## Optional peers

Mermaid, KaTeX, D2, and Infographic are **optional peers**. Install only what your AI output needs:

```bash
# Only Mermaid (no math)
pnpm add mermaid

# Only KaTeX (no diagrams)
pnpm add katex

# Both
pnpm add mermaid katex

# All heavy peers
pnpm add mermaid katex @terrastruct/d2 @antv/infographic
```

After installing a peer, Markstream's default loader can resolve it automatically. `enableMermaid()` and `enableKatex()` are for re-enabling or replacing optional dependency loaders; `setMermaidWorker()` and `setKaTeXWorker()` inject off-thread worker clients. If a peer is not installed or a loader is disabled, that feature falls back instead of rendering through Mermaid or KaTeX.

## See also

- [AI chat streaming Markdown](/use-cases/ai-chat-streaming)
- [SSE and WebSocket streaming](/use-cases/sse-websocket)
- [Long AI responses](/use-cases/long-ai-responses)
