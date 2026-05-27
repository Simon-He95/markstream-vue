---
description: Fine-tune markstream-vue with MarkdownRender props for streaming, dark mode, custom tags, parser options, and heavy-node control.
---

# Component props & options

Use this page when you need to fine-tune streaming behaviour, control heavy nodes, or understand how `MarkdownRender` interacts with Tailwind/UnoCSS projects.

## 1.0 API tiers

Stable props for 1.x: `content`, `nodes`, `final`, `parseOptions`, `customMarkdownIt`, `customHtmlTags`, `htmlPolicy`, `showTooltips`, `isDark`, `customId`, `typewriter`, `smoothStreaming`, `smoothStreamingOptions`, `renderCodeBlocksAsPre`, `codeBlockStream`, `codeBlockProps`, `codeBlockMonacoOptions`, `codeBlockDarkTheme`, `codeBlockLightTheme`, `mermaidProps`, `d2Props`, `infographicProps`, `batchRendering`, `deferNodesUntilVisible`, `maxLiveNodes`, and `liveNodeBuffer`.

Advanced performance tuning prop: `parseCoalesceMs` is available in 1.x, but its scheduling semantics may be refined.

Experimental/internal props: `indexKey`, `renderAsFragment`, `debugPerformance`, `initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`, `renderBatchBudgetMs`, `renderBatchIdleTimeoutMs`, and `viewportPriority`. They are available for advanced integrations and internal tests, but are not part of the 1.x compatibility promise yet.

## Core props on `MarkdownRender`

| Prop | Type | Default | Notes |
| ---- | ---- | ------- | ----- |
| `content` | `string` | – | Raw Markdown string (required unless `nodes` is provided). |
| `nodes` | `BaseNode[]` | – | Pre-parsed AST structure (typically `ParsedNode[]` from `parseMarkdownToStructure`). Skip this when you want the component to parse internally. |
| `custom-id` | `string` | – | Scopes `setCustomComponents` mappings and lets you target CSS via `[data-custom-id="..."]`. |
| `is-dark` | `boolean` | `false` | Theme flag forwarded to heavy nodes (Mermaid/D2/KaTeX/CodeBlock). Also adds `.dark` on the root container. |
| `index-key` | `number \| string` | – | Key prefix for internal node keys; set this when nesting or rendering multiple MarkdownRender instances in the same list. |
| `final` | `boolean` | `false` | Marks the input as end-of-stream. Disables streaming mid-state (loading) parsing so trailing delimiters (like `$$` or an unclosed code fence) won’t get stuck in a perpetual loading state. |
| `parse-options` | `ParseOptions` | – | Token hooks (`preTransformTokens`, `postTransformTokens`). Applies only when `content` is provided. |
| `custom-html-tags` | `string[]` | – | Extra HTML-like tags treated as common during streaming mid‑states and emitted as custom nodes (`type: 'thinking'`, etc.) for `setCustomComponents` mapping (forwarded to `getMarkdown`, e.g. `['thinking']`). |
| `html-policy` | `'safe' \| 'escape' \| 'trusted'` | `'safe'` | Controls `html_block` / `html_inline` rendering. `safe` blocks active/embed/form tags, `escape` shows literal HTML text, and `trusted` keeps the older broad HTML behavior while still removing scripts and unsafe attrs. |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | – | Customize the internal MarkdownIt instance (add plugins, tweak options). |
| `debug-performance` | `boolean` | `false` | Logs parse/render timing, virtualization stats, and `parse(stream)` details such as `streamMode` / `streamDelta` (dev only). |
| `typewriter` | `boolean` | `false` | Shows the blinking typewriter cursor while streamed content grows. |
| `smooth-streaming` | `boolean \| 'auto'` | `'auto'` | Enables built-in pacing for streaming `content` updates. `'auto'` only enables when `typewriter=true` or `max-live-nodes<=0`. Set `true` to force-enable, `false` to render with raw chunk cadence. |
| `smooth-streaming-options` | `SmoothMarkdownStreamOptions` | – | Options for built-in stream pacing (`minCharsPerSecond`, `maxCharsPerSecond`, `targetLatencyMs`, `catchUpLatencyMs`, `catchUpThreshold`, `maxCommitFps`, `startDelayMs`, `maxCharsPerCommit`, `flushOnFinish`). Read when the renderer is created; recreate the renderer with a different `key` if you need to change them dynamically. |
| `parse-coalesce-ms` | `number` | `80` | Performance tuning knob for the minimum interval between parse commits while built-in smooth streaming coalesces character-only updates. It does not throttle raw `content` prop updates when `smooth-streaming=false` and has no effect in `nodes` mode. Set `0` to parse every smooth-stream commit. Default scheduling may be optimized in future releases. |
| `fade` | `boolean` | `true` | Enables non-code-node enter fade and appended-text fade. Disable if you need zero animation for SSR snapshots. |

::: tip SSR and smooth streaming
For SSR with static initial content, prefer `smooth-streaming="auto"` (the default). The `auto` mode includes a mounted gate that prevents pacing initial content from blank on the first client render. Use `smooth-streaming=true` only when you explicitly want to pace the first client-side content as well — this can cause a hydration mismatch or a first-paint flash of empty content in SSR setups.
:::

### smooth-streaming and fade — pick one, not both

`smooth-streaming` and `fade` both produce a "text appears gradually" effect, but at different layers:

| | `smooth-streaming` | `fade` |
|---|---|---|
| **How it works** | Throttles how fast the `content` string is exposed to the renderer | Renders content immediately, but new text gets an opacity 0→1 CSS animation (280 ms) |
| **Where it operates** | String / content layer | DOM / visual layer |
| **Best for** | Streaming / real-time token output | Static or history content |

Enabling both simultaneously causes **visual flicker**: smooth-streaming updates `content` in small batches every frame (~30 fps), and each batch triggers a new fade animation on the delta text. Because the next batch arrives before the 280 ms animation finishes, the delta is snapped from ~8 % opacity to 100 % on every frame — producing a rapid flicker instead of a smooth fade.

**Recommended combinations:**

| Scenario | `smooth-streaming` | `fade` | Why |
|---|---|---|---|
| **Streaming** (tokens arriving in real-time) | `'auto'` or `true` | `false` | Smooth pacing already gives the "gradually appearing" effect; fade adds nothing and causes flicker |
| **Recovering history** (complete Markdown loaded at once) | `false` | `true` | Content arrives all at once — no throttling needed — but fade gives a polished entry animation |
| **Static / SSR snapshot** | `false` | `false` | Zero animation; best for server-rendered output or print pipelines |

In a chat UI, the same `MarkdownRender` typically starts in streaming mode and switches to history mode when the response completes. See [AI Chat & Streaming → Streaming vs recovering history](/guide/ai-chat-streaming#streaming-vs-recovering-history-switching-props-at-runtime) for concrete code examples.

### Advanced smooth streaming configuration

Use `smooth-streaming-options` to fine-tune pacing behaviour:

```vue
<MarkdownRender
  :content="content"
  :smooth-streaming-options="{
    minCharsPerSecond: 45,
    maxCharsPerSecond: 1200,
    targetLatencyMs: 900,
    catchUpLatencyMs: 350,
  }"
/>
```

Available keys: `minCharsPerSecond`, `maxCharsPerSecond`, `targetLatencyMs`, `catchUpLatencyMs`, `catchUpThreshold`, `maxCommitFps`, `startDelayMs`, `maxCharsPerCommit`, `flushOnFinish`. These are read once when the renderer is created; change the component `key` to apply new options dynamically. Use `parse-coalesce-ms` only when built-in smooth streaming is enabled and you need to tune parser coalescing for a measured performance case.

### Security defaults and compatibility opt-outs

`MarkdownRender` now defaults to safer HTML and Mermaid behavior:

- `html-policy="safe"` blocks active/embed/form HTML tags by default.
- `mermaid-props.isStrict` defaults to `true`, so Mermaid runs in strict mode unless you opt out.
- `mermaid-props.enableMermaidInteractions` defaults to `false`, so Mermaid-generated click bindings are not applied unless trusted content opts in.

If a trusted surface needs the broader pre-hardening behavior, opt out explicitly and keep that decision scoped to the trusted content source:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const trustedMarkdown = `
<iframe src="https://example.com/embed"></iframe>

\`\`\`mermaid
flowchart TD
  A["<b>Trusted HTML label</b><br/>line 2"] --> B
\`\`\`
`
</script>

<template>
  <MarkdownRender
    :content="trustedMarkdown"
    html-policy="trusted"
    :mermaid-props="{ isStrict: false }"
  />
</template>
```

Use `html-policy="escape"` when you want literal HTML text to stay visible instead of rendering any HTML.

## Streaming & heavy-node toggles

| Flag | Default | What it does |
| ---- | ------- | ------------ |
| `render-code-blocks-as-pre` | `false` | Render non‑Mermaid/Infographic/D2 `code_block` nodes as `<pre><code>` (uses `PreCodeNode`). Mermaid/infographic/D2 blocks still route to their dedicated nodes unless you override them via `setCustomComponents`. |
| `code-block-stream` | `true` | Stream code blocks as content arrives. Disable to keep Monaco in a loading state until the final chunk lands—useful when incomplete code causes parser hiccups. |
| `viewport-priority` | `true` | Defers heavy work (Monaco, Mermaid, D2, KaTeX) when elements are offscreen. Turn off if you need deterministic renders for PDF/print pipelines. |
| `defer-nodes-until-visible` | `true` | When enabled, heavy nodes can render as placeholders until they approach the viewport (non-virtualized mode only). |

## Rendering performance (virtualization & batching)

| Prop | Default | Notes |
| ---- | ------- | ----- |
| `max-live-nodes` | `320` | Virtualization threshold; set `0` to disable virtualization (renders everything). |
| `live-node-buffer` | `60` | Overscan window (how many nodes to keep before/after the focus range). |
| `batch-rendering` | `true` | Incremental rendering batches (only when `max-live-nodes <= 0`). |
| `smooth-streaming` | `'auto'` | Built-in stream pacing in typewriter/incremental mode (`typewriter` or `max-live-nodes <= 0`). Set `true` to force-enable, `false` for raw chunk cadence. |
| `smooth-streaming-options` | – | Fine-tune pacing: `minCharsPerSecond`, `maxCharsPerSecond`, `targetLatencyMs`, `catchUpLatencyMs`, `catchUpThreshold`, `maxCommitFps`, `startDelayMs`, `maxCharsPerCommit`, `flushOnFinish`. Read once when the renderer is created; use a different component `key` to apply new options dynamically. |
| `initial-render-batch-size` | `40` | How many nodes render immediately before batching begins. |
| `render-batch-size` | `80` | How many nodes render per batch tick. |
| `render-batch-delay` | `16` | Extra delay (ms) before each batch after rAF. |
| `render-batch-budget-ms` | `6` | Time budget (ms) before adaptive batch sizes shrink. |
| `render-batch-idle-timeout-ms` | `120` | Timeout (ms) for `requestIdleCallback` slices (when available). |

## Global code block options (forwarded from `MarkdownRender`)

These props are forwarded to `CodeBlockNode` / `MarkdownCodeBlockNode` (but **not** to Mermaid/D2/Infographic blocks, which route to their dedicated nodes):

- `code-block-dark-theme`, `code-block-light-theme`
- `code-block-monaco-options`
- `code-block-min-width`, `code-block-max-width`
- `code-block-props` (extra code-block props such as `showHeader`, `showFontSizeButtons`, `showTooltips`, `htmlPreviewAllowScripts`, and `htmlPreviewSandbox`, plus any custom forwarded keys)
- `themes` (theme list forwarded to `stream-monaco` when present)

Note: `code-block-monaco-options` is only used by the Monaco-backed `CodeBlockNode`. If you override `code_block` with `MarkdownCodeBlockNode`, treat `code-block-dark-theme` / `code-block-light-theme` as Shiki theme names, and `themes` as the Shiki theme list to preload. `htmlPreviewAllowScripts` and `htmlPreviewSandbox` only affect the built-in `CodeBlockNode` inline HTML iframe preview; they do not affect `previewCode` event handlers, `MarkdownCodeBlockNode`, or external artifact renderers.

Only `ts twoslash` and `vue twoslash` fences in this docs site enable hoverable type details. Hover the object keys below, or `:code-block-monaco-options` in the template, instead of the imported type name.

```vue twoslash
<script setup lang="ts">
import type { CodeBlockMonacoOptions } from 'markstream-vue'
import MarkdownRender from 'markstream-vue'

const md = '```ts\nconsole.log("hover monaco options")\n```'
const monacoOptions = {
  themes: ['vitesse-dark', 'vitesse-light'],
  languages: ['typescript', 'vue', 'json'],
  theme: 'vitesse-dark',
  MAX_HEIGHT: 640,
  diffHideUnchangedRegions: {
    enabled: true,
    contextLineCount: 2,
  },
  diffHunkActionsOnHover: true,
  diffHunkHoverHideDelayMs: 240,
} satisfies CodeBlockMonacoOptions
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="md"
    :code-block-monaco-options="monacoOptions"
  />
</template>
```

`code-block-props` is also strongly typed through the renderer props surface, so you can reuse it without falling back to `any`:

```ts twoslash
import type { NodeRendererProps } from 'markstream-vue'

const codeBlockProps: NonNullable<NodeRendererProps['codeBlockProps']> = {
  showHeader: false,
  showFontSizeButtons: false,
  showTooltips: false,
  htmlPreviewAllowScripts: false,
}
```

## Diagram node props forwarded from `MarkdownRender`

Use these to control specialized block renderers without overriding components manually:

- `mermaid-props` forwards props to `MermaidBlockNode`
- `d2-props` forwards props to `D2BlockNode`
- `infographic-props` forwards props to `InfographicBlockNode`

For Mermaid and Infographic fences, `MarkdownRender` injects an `estimatedPreviewHeightPx` value when the caller does not provide one. This reserves a stable first-preview height for async loading and remounts. Custom `mermaid` and `infographic` renderers receive the same prop, so forward or consume it if the custom block renders its own preview shell.

Example:

```vue
<MarkdownRender
  :content="md"
  :mermaid-props="{ showHeader: false, renderDebounceMs: 180, previewPollDelayMs: 500 }"
  :d2-props="{ progressiveIntervalMs: 450, showCopyButton: false }"
/>
```

`mermaid-props` is especially useful for streaming tuning. Common keys include:

- `isStrict` (set `false` only for trusted diagrams that need Mermaid's loose config; SVG output is still sanitized)
- `enableMermaidInteractions` (set `true` only for trusted diagrams that need Mermaid-generated click bindings)
- `renderDebounceMs`
- `contentStableDelayMs`
- `previewPollDelayMs`
- `previewPollMaxDelayMs`
- `previewPollMaxAttempts`
- toolbar toggles such as `showHeader`, `showModeToggle`, `showExportButton`, `showZoomControls`

## Code block header controls

Pass these props directly to `CodeBlockNode` / `MarkdownCodeBlockNode / MermaidBlockNode`, or globally via `code-block-props` on `MarkdownRender`:

- `show-header`
- `show-copy-button`
- `show-expand-button`
- `show-preview-button`
- `show-collapse-button`
- `show-font-size-buttons`
- `show-tooltips` (global tooltip switch for `LinkNode` + code-block nodes + mermaid-block nodes)
- `html-preview-allow-scripts` / `html-preview-sandbox` (built-in `CodeBlockNode` inline HTML preview only; `htmlPreviewSandbox` takes precedence, invalid non-string overrides such as `null` fall back to `sandbox=""`, omitting the override leaves `htmlPreviewAllowScripts` in control, and only trusted content should opt into scripts)

See `/guide/codeblock-header` and the `CodeBlockNode` types for the exhaustive list.

Example (global defaults):

```vue
<template>
  <MarkdownRender
    :content="md"
    :code-block-props="{ showHeader: false, showFontSizeButtons: false, showTooltips: false }"
  />
</template>
```

## Quick example

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Title\n\nSome content here.'
</script>

<template>
  <MarkdownRender
    :content="md"
    custom-id="docs"
    :viewport-priority="true"
    :code-block-stream="true"
  />
</template>
```

## Styling & troubleshooting reminders

1. **Import a reset first** (`modern-css-reset`, `@tailwind base`, or `@unocss/reset`), then use `@import 'markstream-vue/index.css' layer(components);` so Tailwind/Uno utilities don’t override node styles. See the [Tailwind guide](/guide/tailwind) for concrete snippets.
2. **Scope overrides** with `custom-id` and `[data-custom-id="docs"]` selectors.
3. **Confirm peer CSS** (KaTeX) is imported; Mermaid/D2 do not require extra CSS.
4. **Check the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here)** whenever visuals look off.
