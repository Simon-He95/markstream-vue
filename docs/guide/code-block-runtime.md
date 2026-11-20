---
title: Code Block Runtime
description: How the optional stream-diffs runtime powers CodeBlockNode with minimal installation, replacing the historical Monaco editor surface.
keywords:
  - code block runtime
  - stream-diffs runtime
  - runtime preload
  - code editor surface
---
# Code Block Runtime

This page documents the optional `stream-diffs` runtime used by `CodeBlockNode`. In 2.0 the `stream-monaco` fallback is removed and `stream-diffs` is the only enhanced code-block surface. Supported configuration is exposed through the renderer-neutral `CodeBlockOptions` API.

## Install

```bash
pnpm add stream-diffs
```

No worker plugin or package-specific CSS import is required.

If `stream-diffs` is not installed, the loader keeps the `<pre>` fallback and renders the code block without an enhanced surface.

## Runtime boundary

```text
markstream-vue                         stream-diffs
---------------                        ------------
CodeBlockNode                          controller + DOM surface
  - Vue props / unmount                  - HTMLElement target
  - streaming completion                 - code or diff data
  - viewport decision                    - File / FileDiff rendering
  - header and toolbar                   - syntax highlighting
```

The `stream-diffs` root entry is framework-agnostic. It does not import Vue or own a Vue lifecycle. The package also exposes an optional `stream-diffs/vue` convenience entry for direct Vue consumers, but `markstream-vue` does not use that entry.

## CodeBlockNode handoff

`CodeBlockNode` uses one stable visual path:

1. While code is streaming, Vue renders the shared `PreCodeBlock`; `renderCodeBlocksAsPre` uses the same component and resolved visual defaults.
2. After the block is complete and visible, the component dynamically imports the `stream-diffs` root runtime and mounts one File or FileDiff surface into its existing container.
3. The component applies the active theme to that surface and removes the temporary `<pre>` only when the surface is ready. Before reveal, both surfaces already share font metrics, padding, gutter geometry, overflow, and theme background; a streaming plain block never inherits a stale restored-height floor.
4. On component unmount, the Vue adapter disposes the controller.

Completion, visibility, and unmount are `CodeBlockNode` concerns. They are not `stream-diffs` lifecycle hooks.

`CodeBlockShell` owns the title and action bar. The File surface is created with its internal `data-diffs-header` disabled so the DOM has one header.

## Theming

Use `theme` with either a registered string name or `{ dark, light }`. The `themes` prop is the `[dark, light]` name pair available to the runtime. `CodeBlockNode` sends theme changes to its mounted surface without recreating the Vue component.

Monaco JSON theme objects are not renamed into the 2.0 API. Use `registerCustomTheme` from `stream-diffs/pierre`, then pass the registered name.

## Options handoff

Direct `CodeBlockNode` usage and the top-level `NodeRenderer` / `MarkdownRender` API both accept `codeBlockOptions`. The same `CodeBlockOptions` contract is available across Vue 3, React, Octane, Svelte, Angular, and Vue 2.

The supported surface includes:

- host-managed typography and layout: `fontSize`, `lineHeight`, `fontFamily`, numeric-pixel `maxHeight`, numeric-pixel symmetric `padding`, and `tabSize`;
- File options such as `disableLineNumbers`, `overflow`, highlighting limits, and virtualization/highlighter controls; `overflow: 'wrap'` is passed to the compatibility runtime as `wordWrap: 'on'`, while `overflow: 'scroll'` is passed as `wordWrap: 'off'`; the default is `overflow: 'wrap'`.
- FileDiff layout, indicators, unchanged-region folding, and line-diff controls;
- line/token interactions, selection callbacks, annotations, `onController`, and `workerManager`.

Markstream applies the host-managed fields to both the streaming `<pre>` and finalized surface, then forwards the remaining supported fields to `stream-diffs`. Theme, language/content, streaming state, the single header, mount/reveal timing, and disposal remain host-owned and take precedence over conflicting runtime values.

## Optional preload

If a route is known to contain completed, visible code blocks, preload the module during idle time:

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

This only warms the optional module. It does not create a surface, finalize a streaming block, or bypass the completion-and-visibility gate.

## Worker pool (off-thread highlighting)

`stream-diffs` highlights with Shiki on the main thread by default. Rendering a code block with tens of thousands of lines blocks the UI for the whole highlight pass. `@pierre/diffs` ships an experimental `WorkerPoolManager` that moves Shiki tokenization into Web Workers; `markstream-vue` forwards an injected pool to every enhanced surface as the `workerManager` runtime option.

`markstream-vue` deliberately does **not** bundle or spawn the worker itself — worker assets are bundler-specific and fragile inside a multi-bundler library. Instead, the host app creates the pool with its own bundler and injects it once:

```ts
import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker'
// vite.config.ts / any module evaluated once before code blocks render
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { setStreamDiffsWorkerPool } from 'markstream-vue'

const pool = getOrCreateWorkerPoolSingleton({
  poolOptions: {
    poolSize: 4,
    workerFactory: () => new DiffsWorker(),
  },
  highlighterOptions: {
    // Align with the theme(s) used by the code blocks.
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
  },
})

setStreamDiffsWorkerPool(pool)
```

Use the equivalent worker import for your bundler (webpack 5, Rollup, etc.). The same manager is shared across all code blocks. Lifecycle and termination stay under application control:

```ts
import { clearStreamDiffsWorkerPool, terminateStreamDiffsWorkerPool } from 'markstream-vue'

terminateStreamDiffsWorkerPool() // calls pool.terminate() (if available) and clears it
clearStreamDiffsWorkerPool() // clears without terminating (host keeps ownership)
```

Behavior notes:

- **No pool injected** — highlighting stays on the main thread, exactly as before. This is the default.
- **Theme sync** — `CodeBlockNode` forwards the active theme to the pool via `setRenderOptions` on every theme change, so worker-generated tokens match the requested theme. No host wiring needed.
- **Per-block override** — a `codeBlockOptions.workerManager` passed to an individual block wins over the shared injected pool.
- **Fallback is automatic** — if the pool reports itself unavailable (`isWorkingPool() === false`), `@pierre/diffs` falls back to main-thread highlighting. A broken or terminated pool never blocks rendering.

## Diff interactions

Diff blocks keep the same adapter boundary. The enhanced diff surface uses `stream-diffs` defaults unless the corresponding `codeBlockOptions` fields are supplied. For example, `diffStyle`, `expandUnchanged`, `collapsedContextThreshold`, `hunkSeparators`, `lineDiffType`, and `parseDiffOptions` configure layout and folding.

The fallback applies the same `collapsedContextThreshold` decision as the finalized surface: an unchanged region is folded only when its hidden line count is greater than the threshold. Unified and split fallbacks derive `No newline at end of file` from each source's actual final-newline state, render it with the same neutral metadata palette as the finalized surface, and preserve the same visible height during handoff. Added/removed line fill is composited once per visual region so its effective color matches the finalized surface. In wrap mode, content fill, gutter marker, and line-number fill span the complete measured logical-row height. Switching between wrap and scroll clears the old synchronized row height before the next layout is painted. The finalized host preserves every row below `maxHeight` and uses scrollable overflow above it; it never hides overflowing diff rows behind a larger shell.
