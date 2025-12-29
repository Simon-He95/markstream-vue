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

## Keeping a Steady, Typewriter-Style Stream

Some AI or LLM sources send content in large bursts, which can feel like the preview is freezing and then dumping a whole block. To keep the UI feeling like a smooth, continuous typewriter:

- **Keep `typewriter` enabled** on `NodeRenderer` (default) so non-code nodes animate in character-by-character instead of appearing instantly.
- **Tune the batching props**: drop `initialRenderBatchSize`/`renderBatchSize` (for example `12`/`24`), and add a small `renderBatchDelay` (20–30 ms). Even if the model sends a huge chunk, the renderer then inserts tiny slices each frame, producing a stable flow.
- **Throttle upstream updates** if possible: instead of replacing `content` on every incoming hunk, debounce (50–100 ms) or split into smaller paragraphs so each render cycle operates on a “bite-sized” diff.
- **Defer heavy nodes** by keeping `deferNodesUntilVisible`/`viewportPriority` turned on; expensive blocks (Mermaid/Monaco) will wait until they are near the viewport so the stream of text is never blocked.
- **Fall back for code blocks** when a burst happens: disable `codeBlockStream` or temporarily use `renderCodeBlocksAsPre` during streaming so that syntax-highlighting work does not stall text updates.

These knobs keep DOM work under a predictable budget, so users perceive a calm, steady flow of characters even when the backend sends data in erratic bursts.

Try this — tune rendering performance by enabling `viewportPriority`:

```vue
<MarkdownRender :content="md" :viewport-priority="true" />
```

## Virtualization & DOM windows

`NodeRenderer` keeps a moving window of nodes in memory so extremely long documents stay responsive:

- `maxLiveNodes` (default `320`) caps how many fully rendered nodes remain in the DOM. Tune this based on your layout — lower values reduce memory but require slightly more placeholder churn; higher values prioritise scrollback.
- `liveNodeBuffer` controls overscan on both sides of the focus window (default `60`). Increase it when nodes vary wildly in height to avoid visible pop-in while scrolling fast.
- `deferNodesUntilVisible` together with `viewportPriority` defers mounting heavy nodes (Mermaid, Monaco, KaTeX) until an observer reports they are close to the viewport.
- `batchRendering`, `initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`, and `renderBatchBudgetMs` govern how many nodes switch from placeholders to full components per frame. This incremental mode only runs when virtualization is disabled (`:max-live-nodes="0"`); otherwise the virtual window already limits DOM work, so nodes are rendered immediately without placeholders.

Example: Give the user a lighter DOM footprint while keeping scrollback smooth.

```vue
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
```

With these knobs you can keep large AI transcripts or docs under a predictable CPU budget while still presenting consistent scroll behaviour.
