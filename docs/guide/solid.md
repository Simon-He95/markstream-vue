---
title: SolidJS streaming Markdown guide
description: Set up markstream-solid in SolidJS 1.9 applications with reactive streaming input, optional code and diagram peers, workers, custom components, SSR, hydration, and virtual history restoration.
keywords:
  - markstream-solid guide
  - SolidJS streaming Markdown
  - SolidJS AI chat
  - Solid Markdown SSR
  - Solid playground
---

# SolidJS

`markstream-solid` is the native SolidJS 1.9 renderer. It shares the Markstream parser and framework-independent core with Vue 3, and uses Solid components, signals, accessors, callbacks, and context for rendering.

[Complete component and API reference](/guide/solid-api)

## Install and requirements

Install in a SolidJS 1.9 or SolidStart application:

```bash
pnpm add markstream-solid solid-js@^1.9
```

To run the repository playground:

```bash
pnpm install
pnpm build:solid
pnpm play:solid
```

For another app in the same pnpm workspace, add `markstream-solid` with the `workspace:*` protocol and install `solid-js@^1.9`. To test unpublished workspace changes in an external app, build and pack the parser, core, and Solid packages together:

```bash
pnpm build:solid
mkdir -p .tmp/solid-pack
pnpm -C packages/markdown-parser pack --pack-destination "$PWD/.tmp/solid-pack"
pnpm -C packages/markstream-core pack --pack-destination "$PWD/.tmp/solid-pack"
pnpm -C packages/markstream-solid pack --pack-destination "$PWD/.tmp/solid-pack"
```

In the consuming app, install the three generated `.tgz` files and `solid-js@^1.9`, using the absolute path to that artifact directory. The [packed consumer smoke](https://github.com/Simon-He95/markstream-vue/blob/main/scripts/smoke-solid-package.mjs) exercises an external TSX consumer and SSR without Vue or React.

For a Vite app, compile application TSX with `vite-plugin-solid`:

```ts
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid({ ssr: true })],
  worker: { format: 'es' },
})
```

Use `"jsx": "preserve"` and `"jsxImportSource": "solid-js"` in TypeScript. SolidStart manages its own Solid compiler setup.

## First render and CSS

```tsx
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, done: boolean }) {
  return <MarkdownRender content={props.content} final={props.done} />
}
```

Read reactive props inside JSX or accessors. The default export, `MarkdownRender`, and `NodeRenderer` refer to the same component. Pass accumulated Markdown to `content`; a non-empty `nodes` array renders an existing AST, and an empty array falls back to `content`.

Import exactly one renderer stylesheet from your app entry:

| Stylesheet | Use |
| --- | --- |
| `markstream-solid/index.css` | Default renderer styles, scoped to `.markstream-solid` |
| `markstream-solid/index.px.css` | Pixel dimensions when the app changes the root font size |
| `markstream-solid/index.tailwind.css` | The package's Tailwind CSS entry |

Math also needs `katex/dist/katex.min.css`. JavaScript imports do not inject the renderer stylesheet.

## Streaming SSE input

This example expects raw Markdown chunks in SSE `message` events and a named `done` event at completion:

```tsx
import MarkdownRender from 'markstream-solid'
import { createSignal, onCleanup, onMount } from 'solid-js'
import 'markstream-solid/index.css'

export function StreamingMessage() {
  const [content, setContent] = createSignal('')
  const [final, setFinal] = createSignal(false)

  onMount(() => {
    const source = new EventSource('/api/chat')
    source.onmessage = (event) => {
      setContent(previous => previous + event.data)
    }
    source.addEventListener('done', () => {
      setFinal(true)
      source.close()
    })
    onCleanup(() => source.close())
  })

  return <MarkdownRender mode="chat" content={content()} final={final()} />
}
```

Set `final` only when input completes. Set it back to `false` before appending to a resumed response. A replacement string resets the smooth stream; clearing `content` starts a new response. Decode transport payloads according to your API before appending them.

`smoothStreaming="auto"` is the default. Explicit `smoothStreaming`, `smoothStreamingOptions`, `parseCoalesceMs`, `typewriter` (`true`, `false`, `'simple'`, `'precise'`), and `fade` control pacing and display. `useSmoothMarkdownStream()` exposes `source()`, `visible()`, `done()`, `final()`, and `snapshot()` accessors and cleans up with its Solid owner. Choose either the renderer's pacing or an external controller for a given stream.

## Optional peers and enhanced blocks

| Feature | Optional peer |
| --- | --- |
| Enhanced code blocks and diffs | `stream-diffs` |
| Inline/block math | `katex` |
| Mermaid diagrams | `mermaid` |
| D2 diagrams | `@terrastruct/d2` |
| Infographic blocks | `@antv/infographic` |

Install only the peers you use. Enhanced code blocks use a native `<pre>` fallback when `stream-diffs` is absent or still loading. Code typography, line-number gutter, padding, and pre/highlight surface CSS share the Vue 3 core contract.

```tsx
<MarkdownRender
  content={content()}
  final={final()}
  codeBlockLightTheme="vitesse-light"
  codeBlockDarkTheme="vitesse-dark"
  codeBlockProps={{ showLineNumbers: true, showCopyButton: true }}
  codeBlockOptions={{ overflow: 'wrap', diffStyle: 'unified', maxHeight: 500 }}
/>
```

`codeBlockProps` controls the header and toolbar. `codeBlockOptions` configures the native File/FileDiff runtime, including numeric CSS-pixel `padding` and `maxHeight`; `themes` is the `[dark, light]` pair of registered theme names. `renderCodeBlocksAsPre` keeps the native pre path. Standalone `CodeBlockNode` accepts `headerLeft` / `headerRight` JSX or render functions.

Enable infographic before rendering it:

```ts
import { enableInfographic } from 'markstream-solid'

enableInfographic(() => import('@antv/infographic'))
```

## Workers

Vite-compatible browser entries can inject KaTeX and Mermaid workers once at app startup:

```ts
import { setKaTeXWorker, setMermaidWorker } from 'markstream-solid'
import KatexWorker from 'markstream-solid/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-solid/workers/mermaidParser.worker?worker'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
```

Keep worker creation in a browser entry or `onMount` when the app uses SSR. Worker clients and CDN helper subpaths are also exported. A host-owned highlighting pool can be passed through `setStreamDiffsWorkerPool`; see [code-block runtime](/guide/code-block-runtime) for the shared runtime options.

## Custom components and scoped configuration

```tsx
import type { NodeComponentProps } from 'markstream-solid'
import MarkdownRender, { MarkstreamProvider } from 'markstream-solid'

function Thinking(props: NodeComponentProps) {
  return <aside>{String(props.node.content ?? '')}</aside>
}

export function Answer(props: { content: string, done: boolean }) {
  return (
    <MarkstreamProvider
      components={{ thinking: Thinking }}
      defaultI18nMap={{ 'common.copy': 'Copy code' }}
    >
      <MarkdownRender
        content={props.content}
        final={props.done}
        customHtmlTags={['thinking']}
      />
    </MarkstreamProvider>
  )
}
```

Local `customComponents`, scoped `setCustomComponents(id, mapping)` plus `customId`, and global registration are available. Use provider/local configuration for request-specific SSR state. `streamingComponents` receives parser nodes; `htmlComponents` receives sanitized HTML inputs. Vue events and slots map to Solid callbacks and JSX/render props.

## HTML previews and safety

`htmlPolicy` accepts `'safe'`, `'trusted'`, or `'escape'`; use [Security](/guide/security) to choose a policy for your input. HTML preview uses a Portal and an iframe with an empty sandbox by default. `codeBlockProps.htmlPreviewAllowScripts` enables scripts; an explicit `htmlPreviewSandbox` takes precedence. `onHandleArtifactClick` receives HTML/SVG payloads for host-owned previews.

## Long documents and restoration

`mode="docs"` enables batching, deferral, and a bounded live-node window. `mode="chat"` and `mode="minimal"` have chat-oriented defaults. Explicit props override mode settings.

For an immediate full DOM restoration, use:

```tsx
<MarkdownRender
  content={savedMarkdown}
  final
  smoothStreaming={false}
  batchRendering={false}
  maxLiveNodes={0}
  deferNodesUntilVisible={false}
  viewportPriority={false}
/>
```

For long interactive documents, retain windowing and use the `ref` callback to capture or restore virtual state:

```tsx
import type { MarkstreamRendererHandle, MarkstreamVirtualState } from 'markstream-solid'
import MarkdownRender from 'markstream-solid'

export function History(props: { content: string }) {
  let renderer!: MarkstreamRendererHandle
  let saved: MarkstreamVirtualState | null = null
  return (
    <>
      <button onClick={() => saved = renderer.captureVirtualState()}>Save position</button>
      <button onClick={() => saved && renderer.restoreVirtualState(saved, { restoreAnchor: true })}>Restore position</button>
      <MarkdownRender ref={handle => renderer = handle} content={props.content} final />
    </>
  )
}
```

State restoration checks node signatures, width, measurement key, session, and thread compatibility. Coordinate an outer scroll root with `virtualScroll`; `MarkstreamVirtualTimeline` and `useMarkstreamVirtualAdapter` provide native Solid conversation windows and per-thread caches.

## SSR and hydration

The root export selects the server or browser build through package conditions. Server rendering emits the complete document; hydration keeps the existing DOM before applying the client window. Use the same initial `content` and `final` values on both sides, then resume input after hydration. Asynchronous editors, diagrams, and workers initialize on the client.

## Solid playground {#playground}

Run `pnpm play:solid` from the repository root and open `http://localhost:4178`. The page follows the Vue 3 playground and provides Controls, TPS/random chunk playback, themes, source editing, pause/resume, full restoration, a long-document fixture, and toolbar/HTML/SVG examples.

`/line-number-handoff-check` compares pre with highlighting. Add `?theme=dark&codeOverflow=scroll` for the dark scrolling case.

- [Online playground](https://markstream-solid.pages.dev/) — deployment pending.
- [Playground instructions](/guide/playground#solid-playground)
- [Playground source](https://github.com/Simon-He95/markstream-vue/tree/main/playground-solid)
- [API parity and shared core](https://github.com/Simon-He95/markstream-vue/blob/main/packages/markstream-solid/PARITY.md)
- [Validation and performance data](https://github.com/Simon-He95/markstream-vue/blob/main/packages/markstream-solid/VALIDATION.md)

Mermaid split modules require file workers with `worker.format="es"`; avoid inline Blob mode. See the component/API reference for CDN setup and complete options.
