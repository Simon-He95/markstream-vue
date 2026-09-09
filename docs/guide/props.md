---
title: Component props & options
description: Fine-tune markstream-vue with MarkdownRender props for streaming, dark mode, custom tags, parser options, and heavy-node control.
keywords:
  - markdownrender props
  - streaming options
  - custom tags vue
  - heavy node control
  - dark mode markdown
---

# Component props & options

Use this page when you need to fine-tune streaming behaviour, control heavy nodes, or understand how `MarkdownRender` interacts with Tailwind/UnoCSS projects.

<PrereqChips :items="[
  { text: 'Vue Quick Start', link: '/guide/quick-start' },
  { text: 'Usage: content vs nodes', link: '/guide/usage' },
]" />

## 2.x API tiers

Stable props for 2.x: `content`, `nodes`, `final`, `parseOptions`, `customMarkdownIt`, `customHtmlTags`, `htmlPolicy`, `mode`, `domMode`, `showTooltips`, `isDark`, `customId`, `typewriter`, `smoothStreaming`, `smoothStreamingOptions`, `renderCodeBlocksAsPre`, `codeBlockStream`, `codeBlockProps`, `codeBlockOptions`, `codeBlockDarkTheme`, `codeBlockLightTheme`, `mermaidProps`, `d2Props`, `infographicProps`, `batchRendering`, `deferNodesUntilVisible`, `maxLiveNodes`, `liveNodeBuffer`, `nodeVirtual`, and `virtualScroll`.

Advanced performance tuning prop: `parseCoalesceMs` is available in 2.x, but its scheduling semantics may be refined.

Experimental/internal props: `indexKey`, `renderAsFragment`, `debugPerformance`, `initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`, `renderBatchBudgetMs`, `renderBatchIdleTimeoutMs`, `viewportPriority`, and `viewportPriorityOptions`. They are available for advanced integrations and internal tests, but are not part of the stable compatibility promise.

## Core props on `MarkdownRender`

| Prop | Type | Default | Notes |
| ---- | ---- | ------- | ----- |
| `content` | `string` | – | Raw Markdown string (required unless `nodes` is provided). |
| `nodes` | `BaseNode[]` | – | Pre-parsed AST structure (typically `ParsedNode[]` from `parseMarkdownToStructure`). Skip this when you want the component to parse internally. |
| `custom-id` | `string` | – | Scopes `setCustomComponents` mappings and lets you target CSS via `[data-custom-id="..."]`. |
| `is-dark` | `boolean` | `false` | Theme flag forwarded to heavy nodes (Mermaid/D2/KaTeX/CodeBlock). Also adds `.dark` on the root container. |
| `index-key` | `number \| string` | – | Key prefix for internal node keys; set this when nesting or rendering multiple MarkdownRender instances in the same list. |
| `final` | `boolean` | `false` | Marks the input as end-of-stream. Disables streaming mid-state (loading) parsing so trailing delimiters (like `$$` or an unclosed code fence) won’t get stuck in a perpetual loading state. |
| `parse-options` | `ParseOptions` | – | Parser hooks (`preTransformTokens`, `postTransformTokens`, `postTransformNodes`). Applies only when `content` is provided. |
| `custom-html-tags` | `string[]` | – | Extra HTML-like tags treated as common during streaming mid‑states and emitted as custom nodes (`type: 'thinking'`, etc.) for `setCustomComponents` mapping (forwarded to `getMarkdown`, e.g. `['thinking']`). |
| `html-policy` | `'safe' \| 'escape' \| 'trusted'` | `'safe'` | Controls `html_block` / `html_inline` rendering. `safe` blocks active/embed/form tags, `escape` shows literal HTML text, and `trusted` keeps the older broad HTML behavior while still removing scripts and unsafe attrs. |
| `mode` | `'docs' \| 'chat' \| 'minimal'` | `'docs'` | Preset renderer tuning. Use `chat` for AI/SSE output, `docs` for rich document surfaces, and `minimal` for lightweight non-chat surfaces. |
| `dom-mode` | `'full' \| 'minimal'` | `'full'` | Best-effort DOM structure mode. `minimal` skips per-node `.node-slot` / `.node-content` wrappers only when wrappers are not needed; it falls back to `full` for fade, batching, deferral, virtualization, host virtual-scroll, typewriter, or custom components. Disable those features explicitly when you need stable minimal output. |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | – | Customize the internal MarkdownIt instance (add plugins, tweak options). |
| `debug-performance` | `boolean` | `false` | Logs parse/render timing, virtualization stats, and `parse(stream)` details such as `streamMode` / `streamDelta` (dev only). |
| `typewriter` | `boolean \| 'simple' \| 'precise'` | `false` | Shows the blinking typewriter cursor while streamed content grows. `true` / `'precise'` uses Range-based precise positioning; `'simple'` uses a lightweight CSS cursor. |
| `smooth-streaming` | `boolean \| 'auto'` | `'auto'` | Enables built-in pacing for streaming `content` updates. `'auto'` enables when `typewriter` is `true`, `'simple'`, `'precise'`, or `max-live-nodes<=0`. Set `true` to force-enable, `false` to render with raw chunk cadence. |
| `smooth-streaming-options` | `SmoothMarkdownStreamOptions` | – | Options for built-in stream pacing (`minCharsPerSecond`, `maxCharsPerSecond`, `targetLatencyMs`, `catchUpLatencyMs`, `catchUpThreshold`, `maxCommitFps`, `startDelayMs`, `maxCharsPerCommit`, `flushOnFinish`). Read when the renderer is created; recreate the renderer with a different `key` if you need to change them dynamically. |
| `parse-coalesce-ms` | `number` | `80` | Performance tuning knob for the minimum interval between parse commits while built-in smooth streaming coalesces character-only updates. It does not throttle raw `content` prop updates when `smooth-streaming=false` and has no effect in `nodes` mode. Set `0` to parse every smooth-stream commit. Default scheduling may be optimized in future releases. |
| `fade` | `boolean` | `true` | Enables non-code-node enter fade and appended-text fade. Disable if you need zero animation for SSR snapshots. |
| `node-virtual` | `boolean \| 'auto'` | `'auto'` | Controls node-level virtualization inside this Markdown document only. It does not virtualize a chat or timeline list. |
| `viewport-priority` | `boolean` | `true` | Defers built-in heavy nodes until they approach the viewport. Set `false` to render them immediately. Heavy node components imported and mounted on their own also render immediately. |
| `virtual-scroll` | `MarkstreamVirtualScrollOptions` | – | Advanced host virtual-scroll coordination. Use this when an outer timeline virtualizer needs logical `totalHeight`, restore state, and settle/final events instead of reading the current DOM height. When `enabled=true`, pass a stable `sessionKey`. |
| `viewport-priority-options` | `{ rootMargin?: string; heavyBlockMargin?: string; maxTargets?: number }` | `{ rootMargin: '400px', heavyBlockMargin: rootMargin, maxTargets: 640 }` | Experimental observer tuning for `viewportPriority`. `rootMargin` controls MarkdownRender node-shell visibility; `heavyBlockMargin` currently controls built-in code block renderers and deferred HTML blocks; `maxTargets` only controls the node-shell deferral auto-disable threshold and does not cap child renderer observers. |

Use `typewriter="simple"` for high-frequency streaming or performance-sensitive chat surfaces. Use `typewriter="precise"` when the cursor must closely follow complex inline layout.

::: tip SSR and smooth streaming
For SSR with static initial content, prefer `smooth-streaming="auto"` (the default). The `auto` mode includes a mounted gate that prevents pacing initial content from blank on the first client render. Use `smooth-streaming=true` only when you explicitly want to pace the first client-side content as well — this can cause a hydration mismatch or a first-paint flash of empty content in SSR setups.
:::

### Virtual scroll coordination

Use `MarkstreamVirtualTimeline` for zero-config mixed AI timelines, or `useMarkstreamVirtualAdapter` when you already have a third-party virtualizer. The raw `virtual-scroll` prop is the advanced Markdown item protocol those integrations use internally.

When `virtual-scroll.enabled` is true, `MarkdownRender` reports the logical height of the full Markdown document through `height-change`.

Use `metrics.totalHeight` as the outer virtualizer item size. Do not use the current DOM `offsetHeight`, because the renderer may internally virtualize Markdown nodes and keep only a live window in the DOM.

When passing standalone `heightCache`, also pass `heightCacheWidth`; otherwise the cache is ignored to avoid reusing stale measurements after width changes.

`final` means the source stream has completed. It does not guarantee that the layout has settled. Code blocks, diagrams, images, fonts, and custom components may still change height. `render-final` means this render session has passed the selected settle policy. For virtualized or offscreen nodes, `metrics.confidence` may still be `mixed`. Persist the height cache as authoritative only when `metrics.confidence` is `measured` or `final`, or when you persist the returned per-node `heightCache` together with `width`, `measurementKey`, and `contentHash`.

### `MarkstreamVirtualTimeline` restore UI

#### `restore-loading`

Rendered while a previously measured thread is being restored. The slot is displayed as an absolutely positioned overlay inside the timeline scroll root and does not participate in item measurement.

Slot props:

- `threadKey`: current timeline thread key.
- `visibleRecords`: records in the current virtual window.

Do not insert loading rows into `items`; that changes offsets and can break scroll restoration.

#### `restore-max-loading-ms`

Controls the maximum time the timeline may keep the restore loading overlay visible.

- `false` (default): keep the overlay visible until the restored viewport is ready.
- `number`: reveal after this many milliseconds even if the viewport readiness check has not passed.

Keep the default when scroll and height stability are more important than showing partial content. Use a number only when your product prefers a bounded loading duration over strict visual stability.

### smooth-streaming and fade — independent controls

In Vue 3 (including Nuxt), these props can be enabled together. `smooth-streaming` contains no opacity animation; it schedules the visible content passed to the renderer. `fade` animates newly rendered text and non-code-node entry.

| | `smooth-streaming` | `fade` |
|---|---|---|
| **How it works** | Paces visible content and catches up when input accumulates | Animates opacity after content is rendered |
| **Where it operates** | String / content layer | DOM / visual layer |
| **Streaming behavior** | Controls when and how much text is revealed | TextNode and InlineCodeNode append fades use 200 ms, opacity 0→1, and `cubic-bezier(0.2, 0, 0.4, 1)` |

Vue 3 append fades coalesce updates within 50 ms and keep at most four batches per text node. Existing batches finish without being restarted by later appends. The window groups animations; it does not delay incoming text. Dense updates may join a batch already partway through its fade. Non-code-node entry transitions retain their separate 280 ms default.

Earlier Vue 3 fades were interrupted by subsequent updates, which led to the old advice to avoid combining these props. That restriction no longer applies to the bounded append-fade implementation. Other framework adapters retain their own fade behavior; this is not a cross-framework animation guarantee.

| Scenario | `smooth-streaming` | `fade` | Why |
|---|---|---|---|
| **Streaming with gradual text reveal** | `'auto'` or `true` | `true` | Smooth cadence plus continuous opacity animation |
| **Streaming with less animation work** | `'auto'` or `true` | `false` | The lightweight `chat`/`minimal` default; avoids fade batches and animation work |
| **Recovering history** | `false` | Optional | Show complete content immediately; choose entry animation independently |
| **Static / print snapshot** | `false` | `false` | No pacing or animation |

To opt into both while keeping chat defaults:

```vue
<MarkdownRender mode="chat" :content="content" :final="isDone" fade />
```

`fade` adds DOM and browser animation work even though batch counts are bounded. Measure the combined configuration on your workload; enabling both is a visual choice, not a performance optimization. In SSR, prefer `smooth-streaming="auto"` over forcing `true` for initial content. Keep a chat row's mode stable and choose fade independently of completion; see [AI Chat & Streaming](/guide/ai-chat-streaming#streaming-vs-recovering-history-switching-props-at-runtime).

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
| `render-code-blocks-as-pre` | `false` | Force the built-in fenced-code path to `<pre><code>` (uses `PreCodeNode`). Scoped language or `code_block` overrides registered with `setCustomComponents` keep priority. |
| `code-block-stream` | `true` | Stream code blocks as content arrives. Disable to keep the enhanced surface in a loading state until the final chunk lands—useful when incomplete code causes parser hiccups. |
| `viewport-priority` | `true` | Defers heavy work (code blocks, Mermaid, D2, KaTeX) when elements are offscreen. Turn off if you need deterministic renders for PDF/print pipelines. |
| `defer-nodes-until-visible` | `true` | When enabled, heavy nodes can render as placeholders until they approach the viewport (non-virtualized mode only). |

## Rendering performance (virtualization & batching)

| Prop | Default | Notes |
| ---- | ------- | ----- |
| `max-live-nodes` | `220` in `docs`; `0` in `chat` / `minimal` | Virtualization threshold selected by `mode`; set an explicit value only when measured tuning requires it. |
| `live-node-buffer` | `60` | Overscan window (how many nodes to keep before/after the focus range). |
| `batch-rendering` | `true` | Incremental rendering batches (only when `max-live-nodes <= 0`). |
| `smooth-streaming` | `'auto'` | Built-in stream pacing in typewriter/incremental mode (`typewriter=true`, `typewriter='simple'`, `typewriter='precise'`, or `max-live-nodes <= 0`). Set `true` to force-enable, `false` for raw chunk cadence. |
| `smooth-streaming-options` | – | Fine-tune pacing: `minCharsPerSecond`, `maxCharsPerSecond`, `targetLatencyMs`, `catchUpLatencyMs`, `catchUpThreshold`, `maxCommitFps`, `startDelayMs`, `maxCharsPerCommit`, `flushOnFinish`. Read once when the renderer is created; use a different component `key` to apply new options dynamically. |
| `initial-render-batch-size` | `40` | How many nodes render immediately before batching begins. |
| `render-batch-size` | `80` | How many nodes render per batch tick. |
| `render-batch-delay` | `16` | Extra delay (ms) before each batch after rAF. |
| `render-batch-budget-ms` | `6` | Time budget (ms) before adaptive batch sizes shrink. |
| `render-batch-idle-timeout-ms` | `120` | Timeout (ms) for `requestIdleCallback` slices (when available). |
| `virtual-scroll` | – | Reports logical height and restore state to an outer virtualizer. Listen to `height-change` and use `metrics.totalHeight` as the message/item size. When `enabled=true`, pass a stable `sessionKey`. |

## Events on `MarkdownRender`

| Event | Payload | Fires when |
| ----- | ------- | ---------- |
| `copy` | `string` | A code block copy button copies code. |
| `copy-code` | `string` | Same as `copy` (kebab-case alias kept for the public event contract). |
| `handle-artifact-click` | `CodeBlockPreviewPayload` | A code-block HTML preview artifact is clicked. |
| `click` | `(event: MouseEvent, referenceId?: string)` | A click bubbles up from renderer content. `referenceId` is present when a reference node was clicked. |
| `mouseover` | `MouseEvent` | Mouse enters renderer content. |
| `mouseout` | `MouseEvent` | Mouse leaves renderer content. |
| `height-change` | `MarkstreamVirtualMetrics` | Logical height metrics are emitted (host virtual-scroll coordination; throttled to the configured `emitIntervalMs`). |
| `virtual-state-change` | `MarkstreamVirtualState` | A capture of the virtual layout state (measurements, anchor, height cache) is emitted. |
| `render-settled` | `MarkstreamVirtualMetrics` | Rendering settled after content/measurement changes. |
| `render-final` | `MarkstreamVirtualMetrics` | Final render completion (after `final` content converges). |
| `anchor-change` | `MarkstreamVirtualAnchor` | The virtual scroll anchor changes (used for restore coordination). |

All payload types are exported from `markstream-vue` (`MarkstreamVirtualMetrics`, `MarkstreamVirtualState`, `MarkstreamVirtualAnchor`, `CodeBlockPreviewPayload`).

## Global code block options (forwarded from `MarkdownRender`)

These props are forwarded to `CodeBlockNode` (but **not** to Mermaid/D2/Infographic blocks, which route to their dedicated nodes):

- `code-block-dark-theme`, `code-block-light-theme`
- `code-block-min-width`, `code-block-max-width`
- `code-block-options` (`CodeBlockOptions`, forwarded from the renderer to ordinary `CodeBlockNode` instances and supported by direct `CodeBlockNode` usage under the same name)
- `code-block-props` (extra code-block props such as `showHeader`, `showFontSizeButtons`, `showTooltips`, `htmlPreviewAllowScripts`, and `htmlPreviewSandbox`, plus custom forwarded keys that are not structural renderer keys like `node`, `key`, `ref`, `ctx`, `renderNode`, `indexKey`, `__proto__`, `prototype`, or `constructor`)
- `themes` (the `[dark, light]` registered theme-name pair)

`code-block-options` and `code-block-props` serve different layers. Use `code-block-options` for host-managed typography/layout (`fontSize`, `lineHeight`, `fontFamily`, numeric-pixel `maxHeight`, numeric-pixel symmetric `padding`, `tabSize`) and supported File/FileDiff runtime fields. Use `code-block-props` for the component shell and toolbar. Theme, code/language, stream state, the single header, mount/reveal timing, and disposal remain host-owned and override conflicting runtime values. `htmlPreviewAllowScripts` and `htmlPreviewSandbox` only affect the built-in `CodeBlockNode` inline HTML iframe preview; they do not affect `previewCode` event handlers or external artifact renderers.

`code-block-props` is also strongly typed through the renderer props surface, so you can reuse it without falling back to `any`:

```ts twoslash
import type { CodeBlockOptions, NodeRendererProps } from 'markstream-vue'

const codeBlockOptions: CodeBlockOptions = {
  fontSize: 13,
  overflow: 'wrap',
  diffStyle: 'unified',
  enableLineSelection: true,
}

const codeBlockProps: NonNullable<NodeRendererProps['codeBlockProps']> = {
  showHeader: false,
  showFontSizeButtons: false,
  showTooltips: false,
  htmlPreviewAllowScripts: false,
}
```

Pass both at the renderer top level: `:code-block-options="codeBlockOptions"` and `:code-block-props="codeBlockProps"`. A directly mounted `CodeBlockNode` accepts the same `codeBlockOptions` object. Direct `CodeBlockNode.theme` accepts a registered string name or `{ dark, light }`; register old Monaco JSON theme objects with `registerCustomTheme` from `stream-diffs/pierre`, then reference the registered name.

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

Pass these props directly to `CodeBlockNode` / `MermaidBlockNode`, or globally via `code-block-props` on `MarkdownRender`:

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

<NextStep :items="[
  { text: 'API Overview', link: '/guide/api' },
  { text: 'Features Overview', link: '/guide/features' },
  { text: 'Override Built-in Components', link: '/guide/component-overrides' },
]" />
