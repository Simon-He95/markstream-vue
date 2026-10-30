# markstream-solid

Native SolidJS 1.9 renderer using Markstream's shared parser and stream controller. Vue 3's public renderer capabilities are implemented with Solid components, accessors and context; see [PARITY.md](./PARITY.md) and [VALIDATION.md](./VALIDATION.md).

## Install and compiler setup

The package is currently a workspace preview; npm publication is pending. From this repository:

```bash
pnpm install
pnpm build:solid
pnpm play:solid
```

Applications in the same pnpm workspace can depend on `markstream-solid` using `workspace:*`, with `solid-js@^1.9`. For external apps, build and pack `stream-markdown-parser`, `markstream-core`, and `markstream-solid` together; see the [Solid installation guide](https://markstream.simonhe.me/guide/solid#install-and-requirements) and [packed consumer smoke](../../scripts/smoke-solid-package.mjs).

Compile application TSX with `vite-plugin-solid` in Vite, and use `"jsx": "preserve"` / `"jsxImportSource": "solid-js"` in TypeScript. SolidStart manages its own compiler setup. The distributed library contains compiled browser/server JavaScript and declarations.

Import exactly one stylesheet: `index.css`, `index.px.css` for apps that change the root font size, or `index.tailwind.css`. Math also needs `katex/dist/katex.min.css`.

## Component and API reference

[English API reference](https://markstream.simonhe.me/guide/solid-api) / [中文组件与 API](https://markstream.simonhe.me/zh/guide/solid-api) cover all components, props, callbacks, defaults, lifecycle/virtual handles and runtime exports. Vite workers require `worker.format: 'es'` and non-inline `?worker` imports; the packed-worker smoke validates the emitted subpaths.

## Basic usage

```tsx
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, done: boolean }) {
  return <MarkdownRender content={props.content} final={props.done} />
}
```

Pass accumulated Markdown in `content`, set `final` at completion, and set it to false before resuming a stream. A non-empty `nodes` array renders your AST directly; an empty array falls back to `content`, matching Vue 3. Replacing content resets the smooth stream. Keep Solid prop reads reactive.

## Modes and long documents

| Mode | Fade / tooltips | Initial / next batch | Delay | Live nodes / buffer |
| --- | --- | --- | --- | --- |
| `docs` (default) | true / true | 40 / 80 | 16 ms | 220 / 60 |
| `chat` | false / false | 32 / 48 | 6 ms | 0 / 0 |
| `minimal` | false / false | 32 / 48 | 6 ms | 0 / 0 |

Explicit options override the preset. Completed history in chat/minimal mode can automatically use a 50-node window when live limits were omitted and no non-final content was observed. `maxLiveNodes={0}` explicitly disables the window; `nodeVirtual={false}` also disables it. `domMode="minimal"` removes wrappers when fade, typewriter, deferral and virtualization do not require them.

`smoothStreaming` defaults to `'auto'`. `smoothStreamingOptions` configures the initial shared controller; `parseCoalesceMs` defaults to 80 when pacing. `typewriter` accepts true, false, `'simple'` and `'precise'`; `fade` controls text animation independently. `batchRendering`, batch sizes/delay/budget/idle timeout, `deferNodesUntilVisible`, `viewportPriority` and its margins are available.

For immediate full DOM rendering, pass `final`, `smoothStreaming={false}`, `batchRendering={false}`, `maxLiveNodes={0}`, `deferNodesUntilVisible={false}` and `viewportPriority={false}`. Retain the default window and deferral for large interactive histories.

## Code, previews and diagrams

`codeBlockProps` configures header/copy/collapse/expand/preview/font controls, line numbers, theme, width and clipboard writer. `codeBlockOptions` forwards native runtime options including split/unified diffs. `renderCodeBlocksAsPre` uses the native code path, with a copy header and line-number/diff rendering. Custom language components retain priority.

HTML preview uses a body Portal and an iframe with an empty sandbox by default. `htmlPreviewAllowScripts` opts into `allow-scripts`; `htmlPreviewSandbox` explicitly overrides it. An `onHandleArtifactClick` callback receives HTML/SVG artifact payloads instead of opening built-in preview. Standalone `CodeBlockNode` also supports `onPreviewCode`, `headerLeft` and `headerRight`.

`mermaidProps`, `d2Props` and `infographicProps` control the corresponding source/preview toolbars. Mermaid and infographic support zoom/pan/fullscreen; all three provide copy, SVG export and collapse. Mermaid copy/export/modal/mode events are cancelable. Stream updates retain the previous preview until a new one is ready, and canceled work cannot replace newer output.

Install optional peers as needed: `stream-diffs` for enhanced code/diffs, `katex` plus `katex/dist/katex.min.css` for math, `mermaid`, `@terrastruct/d2`, or `@antv/infographic`. Enable infographic before mounting with `enableInfographic(() => import('@antv/infographic'))`. Worker clients, CDN helpers and worker subpaths are exported; host-owned highlighting pools use `setStreamDiffsWorkerPool`.

## Custom components and scoped configuration

```tsx
import type { NodeComponentProps } from 'markstream-solid'
import MarkdownRender, { MarkstreamProvider } from 'markstream-solid'

function Thinking(props: NodeComponentProps) {
  return <aside>{props.node.content}</aside>
}

<MarkstreamProvider
  components={{ thinking: Thinking }}
  defaultI18nMap={{ 'common.copy': '复制' }}
>
  <MarkdownRender
    content="<thinking>reasoning</thinking>"
    customHtmlTags={['thinking']}
  />
</MarkstreamProvider>
```

`setCustomComponents(mapping)`, scoped `setCustomComponents(id, mapping)` plus `customId`, and local `customComponents` remain available. Use provider/local configuration for request-specific SSR state. `streamingComponents` / `defineStreamingComponents` receive parser nodes; `htmlComponents` / `defineHtmlComponents` receive sanitized HTML inputs. `withMarkstreamComponentDisplay` controls block/inline boundaries.

## Capture and restore

A renderer `ref` receives `MarkstreamRendererHandle`, providing metrics, state capture/restore, forceMeasure, settle and scrollToNode. Coordinate an outer scroller with `virtualScroll={{ enabled: true, sessionKey, scrollRoot }}`. Captured height entries include node signatures; width, measurement key and session/thread compatibility are checked before importing them. Bump `measurementKey` for host layout changes such as custom fonts or renderer styles.

`MarkstreamVirtualTimeline` and `useMarkstreamVirtualAdapter` support outer conversation windows, item measurement, bottom/item anchors, per-thread state and stale-callback cleanup. They use native Solid callbacks instead of Vue refs or slots.

Separate compiled browser/node entries support SSR and hydration. The server emits the complete document; hydration preserves it before applying the client window. Asynchronous enhancements start on the client.

## Development and checks

```bash
pnpm install
pnpm play:solid
pnpm build:solid
pnpm test:solid
pnpm test:smoke:solid
pnpm test:e2e:solid-playground
```

The production browser suite verifies streaming, full restoration, virtual scrolling, toolbar and iframe interactions, all three diagram integrations, artifact events and hydration. Performance comparisons warm up once and measure three rounds, alternating framework order. They include plain and rich documents plus continued streaming after a 1,000-node history; raw results and screenshots are in `.tmp/solid/`.

## Documentation and playground

- [Solid framework overview](https://markstream.simonhe.me/frameworks/solid)
- [English guide](https://markstream.simonhe.me/guide/solid) / [中文指南](https://markstream.simonhe.me/zh/guide/solid)
- [Playground source and local commands](../../playground-solid/README.md)
- [Online playground](https://markstream-solid.pages.dev/) — deployment pending; use `pnpm play:solid` locally.

The guide covers reactive SSE input, optional peers, workers, custom components, i18n/provider scope, HTML previews, SSR/hydration and virtual-history restoration. The playground follows the same Pages naming convention as Svelte.

Before publishing Solid, release the new `markstream-core` and `stream-markdown-parser` versions first. Packed dependencies must match those versions; registry-only installation is blocked by the publish gate until they exist. The release-family pipeline publishes parser/core before the adapters.
