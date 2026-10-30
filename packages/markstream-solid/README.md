# markstream-solid

Native SolidJS 1.9 renderer using Markstream's shared parser and stream controller. Vue 3's public renderer capabilities are implemented with Solid components, accessors and context; see [PARITY.md](./PARITY.md) and [VALIDATION.md](./VALIDATION.md).

This is a workspace package. The changes here do not publish it to npm. Tracking: [#799](https://github.com/Simon-He95/markstream-vue/issues/799).

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
