---
name: markstream-solid
description: Integrate markstream-solid in SolidJS 1.9 or SolidStart apps. Use for reactive TSX, SSR and hydration, Markdown streaming/restoration, emitted KaTeX/Mermaid workers, scoped components and translations, virtual timelines, or standalone component/API usage.
---

# Markstream Solid

Read the [Solid guide](https://markstream.simonhe.me/guide/solid) for setup and the [Solid component/API reference](https://markstream.simonhe.me/guide/solid-api) for exact contracts. The [repository source](https://github.com/Simon-He95/markstream-vue/tree/main/packages/markstream-solid) contains workspace commands and validation records. Check the selected package's actual version and publication status before installing it.

## Setup

1. Detect `solid-js` / `@solidjs/start` in the host. TSX alone does not imply React. Require Solid 1.9 and the Solid compiler; SolidStart owns its compiler setup.
2. While the package is a workspace preview, build and pack the parser, core and Solid packages together. For npm releases, use the package's declared dependency versions; never substitute an older published core/parser for the workspace build.
3. Add only required peers: `katex`, `mermaid`, `stream-diffs`, `@terrastruct/d2` or `@antv/infographic`. Math also requires `katex/dist/katex.min.css`.
4. Load resets before exactly one `markstream-solid/index.css`, `index.px.css` or `index.tailwind.css`. Use `.markstream-solid` around standalone basic nodes.
5. Keep props reactive: read `props.content` in JSX/accessors. Avoid destructuring reactive props or treating signals as Vue refs.

## Streaming and restoration

```tsx
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, done: boolean }) {
  return <MarkdownRender mode="chat" content={props.content} final={props.done} />
}
```

- Append decoded Markdown to accumulated `content`. Set `final` at completion and back to false before resuming. Replacement/empty content starts a new source session.
- Use `mode="chat"` for conversations and `mode="docs"` for documents. `smoothStreaming` controls pacing; `fade` controls animation. Solid and Vue 3 share the bounded text fade implementation.
- `useSmoothMarkdownStream` returns accessors (`visible()`, `source()`, `final()`, `done()`, `snapshot()`). Use one pacing owner per response.
- Use non-empty `nodes` for shared/preparsed ASTs; an empty array falls back to content.
- For full immediate DOM restoration, disable pacing, batching, viewport priority, deferral and live windows explicitly. Use the default window/timeline for large interactive histories.
- Use `MarkstreamVirtualTimeline` for mixed message windows. Markdown items use its built-in renderer; `renderItem` supplies the non-Markdown fallback. Use `useMarkstreamVirtualAdapter` when an existing outer virtualizer owns rows.

## Workers and SSR

- Configure Vite `worker: { format: 'es' }`.
- Import `markstream-solid/workers/katexRenderer.worker?worker` and `markstream-solid/workers/mermaidParser.worker?worker`, then call `setKaTeXWorker` / `setMermaidWorker` once in the browser entry or `onMount`.
- Use file workers for Mermaid: its diagram chunks need a resolvable module base. Do not copy the old inline-worker example.
- KaTeX worker renders block/inline math and includes mhchem. Mermaid worker handles parsing/prefix discovery; SVG rendering still runs on the main thread, matching Vue 3.
- CDN helpers are a separate path; supply dependency URLs and CSP/CORS permissions as documented. Host-owned highlighter pools use `setStreamDiffsWorkerPool`.
- Keep browser-only constructors behind the client boundary. SSR and hydration must start with identical content/final values. Prefer `MarkstreamProvider` for request-scoped translations/components.

## Components and callbacks

- Use `ComponentProps<typeof Component>` from `solid-js` or the exported interfaces for exact TSX props.
- Use local `customComponents`, a `MarkstreamProvider`, or scoped `setCustomComponents(id, mapping)` for overrides. Mark block-level overrides with `withMarkstreamComponentDisplay`.
- Use callbacks instead of Vue emits, JSX/render functions instead of slots, and a callback ref for renderer/timeline handles.
- `ReferenceNode` forwards click/enter/leave with `(event, id, messageId, threadId)`.
- `MathBlockNode.cacheScope` namespaces the renderer-owned pending-height cache with `indexKey`; it is not a global KaTeX macro/HTML-cache namespace.
- Mermaid stability/poll options control stable source-to-preview switching and bounded preview retries. Preserve cleanup and stale-result cancellation.
- Read the per-component/API tables before configuring previews, diagrams, virtual state or advanced worker clients.

## Verification

Run the host's build and typecheck. In this repository use `pnpm test:solid`, `pnpm test:smoke:solid`, `pnpm test:smoke:solid-workers`, `pnpm test:e2e:solid-playground` and `pnpm play:solid:seo`. Verify worker consumption through packed subpaths, streaming/final/full restore, user scroll detachment, and SSR/hydration where applicable.
