---
description: Improve markstream-vue performance for streaming chat UIs, large documents, Monaco code blocks, and heavy Mermaid or KaTeX content.
---

# Performance Features & Tips

The renderer is optimized for streaming and large docs. Key features:

- Incremental parsing for code blocks
- Efficient DOM updates and memory optimizations
- Monaco streaming updates
- Progressive Mermaid rendering

Performance tips:

- Stream long documents in chunks
- Use `MarkdownCodeBlockNode` or `renderCodeBlocksAsPre` for non-editable code
- Scope custom components to enable GC
- Use `setDefaultMathOptions` at bootstrap

## Recommended presets

Small docs can favor simplicity:

```vue
<MarkdownRender
  :content="doc"
  :batch-rendering="false"
  :max-live-nodes="0"
/>
```

AI chat defaults should keep heavy nodes and long transcripts bounded:

```vue
<MarkdownRender
  :content="stream"
  :final="final"
  :batch-rendering="true"
  :defer-nodes-until-visible="true"
  :max-live-nodes="320"
  :live-node-buffer="60"
/>
```

Huge documents should use a smaller live window:

```vue
<MarkdownRender
  :nodes="nodes"
  :batch-rendering="true"
  :defer-nodes-until-visible="true"
  :max-live-nodes="180"
  :live-node-buffer="40"
/>
```

Use `content` for small and medium documents, ordinary docs pages, and moderate streaming. For very large documents or very high-frequency streams, parse outside the component and pass `nodes` so parsing and rendering can be scheduled independently.

## Benchmark coverage for 1.0

Before publishing 1.0, run the public benchmark over the shipped playground scenarios:

| Case | Purpose |
| --- | --- |
| Diagnostic Studio baseline | Mixed docs, code blocks, Mermaid, D2, and Infographic |
| Diagnostic Studio thinking | Custom component and nested Markdown rendering |
| Diagnostic Studio diff | Diff code block rendering |
| Diagnostic Studio stress | Safe repro and escaped content behavior |
| Reverse-flex chat scroll | Main playground chat viewport behavior |

Track LCP, CLS, settle time, p95 `requestAnimationFrame` interval, max long task duration, page and renderer DOM node counts, visible fallback count, heavy-block readiness, scroll position drift, and best-effort Chrome-only heap after renderer unmount plus GC. Synthetic 1 MB, 1000-code-block, 100-Mermaid, and 10k-node cases are future 1.0.x coverage and should not be cited as 1.0 release evidence until they exist in the benchmark script.

Generate the release report with:

```bash
pnpm benchmark:1.0
```

This builds the playground, runs the scenarios through `vite preview`, and writes JSON and Markdown summaries under `benchmark/`, including environment disclosure so release notes can cite measured numbers instead of informal claims.

## Bundle size workflow (maintainers)

If you are changing code paths that can impact build size (renderers, code blocks, optional peers), run this flow before merging:

- `pnpm build:analyze` to produce visual reports (`bundle-visualizer.html` and `bundle-visualizer-tailwind.html`) and confirm what actually moved between chunks.
- `pnpm size:check` to enforce local size budgets for `dist`, largest JS chunk, and `npm pack --dry-run` output.
- Optional: tighten budgets in CI/locally with env vars like `MAX_DIST_BYTES`, `MAX_JS_CHUNK_BYTES`, `MAX_PACK_TGZ_BYTES`, `MAX_PACK_UNPACKED_BYTES`.

## Keeping a Steady, Typewriter-Style Stream

Some AI or LLM sources send content in large bursts, which can feel like the preview is freezing and then dumping a whole block. To keep the UI feeling like a smooth, continuous typewriter:

- **Enable `typewriter` when you want a cursor, and keep `fade` enabled** on `MarkdownRender` so the stream can show a blinking cursor, non-code nodes fade in instead of popping instantly, and newly appended text can replay a short local fade without dimming the whole block.
- **Tune the batching props**: drop `initialRenderBatchSize`/`renderBatchSize` (for example `12`/`24`), and add a small `renderBatchDelay` (20–30 ms). Even if the model sends a huge chunk, the renderer then inserts tiny slices each frame, producing a stable flow.
- **Throttle upstream updates** if possible: instead of replacing `content` on every incoming hunk, debounce (50–100 ms) or split into smaller paragraphs so each render cycle operates on a “bite-sized” diff.
- **Defer heavy nodes** by keeping `deferNodesUntilVisible`/`viewportPriority` turned on; expensive blocks (Mermaid/Monaco) will wait until they are near the viewport so the stream of text is never blocked.
- **Fall back for code blocks** when a burst happens: disable `codeBlockStream` or temporarily use `renderCodeBlocksAsPre` during streaming so that syntax-highlighting work does not stall text updates.

These knobs keep DOM work under a predictable budget, so users perceive a calm, steady flow of content even when the backend sends data in erratic bursts.

Try this — tune rendering performance by enabling `viewportPriority`:

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Perf test'
</script>

<template>
  <MarkdownRender :content="md" :viewport-priority="true" />
</template>
```

## Virtualization & DOM windows

`MarkdownRender` keeps a moving window of nodes in memory so extremely long documents stay responsive:

- `maxLiveNodes` (default `320`) caps how many fully rendered nodes remain in the DOM. Tune this based on your layout — lower values reduce memory but require slightly more placeholder churn; higher values prioritise scrollback.
- `liveNodeBuffer` controls overscan on both sides of the focus window (default `60`). Increase it when nodes vary wildly in height to avoid visible pop-in while scrolling fast.
- `deferNodesUntilVisible` together with `viewportPriority` defers mounting heavy nodes (Mermaid, Monaco, KaTeX) until an observer reports they are close to the viewport.
- `batchRendering`, `initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`, and `renderBatchBudgetMs` govern how many nodes switch from placeholders to full components per frame. This incremental mode only runs when virtualization is disabled (`:max-live-nodes="0"`); otherwise the virtual window already limits DOM work, so nodes are rendered immediately without placeholders.

Example: Give the user a lighter DOM footprint while keeping scrollback smooth.

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Virtualized transcript'
</script>

<template>
  <MarkdownRender
    :content="md"
    :max-live-nodes="220"
    :live-node-buffer="40"
    :batch-rendering="true"
    :initial-render-batch-size="24"
    :render-batch-size="48"
    :render-batch-delay="24"
    :render-batch-budget-ms="8"
    :defer-nodes-until-visible="true"
    :viewport-priority="true"
  />
</template>
```

With these knobs you can keep large AI transcripts or docs under a predictable CPU budget while still presenting consistent scroll behaviour.
