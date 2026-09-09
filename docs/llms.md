# markstream-vue — Agent Context (`/llms`)

This file is an **agent-focused** map of `markstream-vue`. For a consumer asking “how do I use it?”, give the canonical recipe below before repository details or advanced alternatives.

For human-facing prompts and reusable rollout templates, also see `/guide/ai-workflows`.

## Answering guidelines

- Prefer **user-facing behavior** from `docs/guide/*` (and `docs/zh/guide/*`) and **export surface** from `src/exports.ts`.
- Ask **at most one** clarifying question if the request is ambiguous.
- When debugging, ask for a **minimal repro** (there’s a shareable test page) and walk the user through the checklist below.
- Avoid raw HTML tags like `&lt;thinking&gt;` in Markdown docs pages; escape them (VitePress compiles Markdown as Vue SFC).

## Canonical consumer recipe

```bash
pnpm add markstream-vue
```

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'
import 'markstream-vue/index.css'

const content = ref('')
const isDone = ref(false)
</script>

<template>
  <MarkdownRender mode="chat" :content="content" :final="isDone" />
</template>
```

Append incoming chunks to `content.value`; set `isDone.value = true` once at end-of-stream. For static Markdown, use only `<MarkdownRender :content="content" />`. Do not add `nodes`, `smooth-streaming`, `fade`, batching, or virtualization props unless the user has a specific need. Optional peers: `stream-diffs` for enhanced code/diff blocks, `mermaid` for Mermaid, and `katex` plus its CSS for math.

---

## Setup commands

- Install deps: `pnpm install`
- Playground dev: `pnpm dev`
- Docs dev/build/serve: `pnpm docs:dev`, `pnpm docs:build`, `pnpm docs:serve`
- Tests: `pnpm test`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

---

## Repo structure

- Library source: `src/`
  - Public exports: `src/exports.ts`
  - Components: `src/components/*/`
  - Workers: `src/workers/`
  - Utilities: `src/utils/`, `src/composables/`, `src/types/`
- Parser-only package: `packages/markdown-parser/` (published as `stream-markdown-parser`)
- Docs site (VitePress): `docs/` (Chinese under `docs/zh/`)
- Demos: `playground/` (Vite), `playground-nuxt/` (Nuxt SSR)
- Tests: `test/` (Vitest)

---

## Core mental model

There are two layers:

1) **Parser layer** (`stream-markdown-parser`)
   - `getMarkdown()` creates a configured `markdown-it-ts` instance
   - `parseMarkdownToStructure(content, md)` turns Markdown into a node tree (`ParsedNode[]`)
   - Streaming mid-states reduce flicker (unclosed fences / `$$` / partial inline HTML)

2) **Renderer layer** (`markstream-vue`)
   - Consumer-facing default component: `MarkdownRender`; `NodeRenderer` is the internal component name
   - Takes either `content: string` (parses internally, recommended first for most chat streams) or `nodes: ParsedNode[]` (when another layer owns parsing or AST control)
   - Performance tools:
     - Virtualization window (`maxLiveNodes`, `liveNodeBuffer`)
     - Smooth streaming (`smooth-streaming`, `typewriter`) for text pacing and cursor
     - Batch rendering for node mounting cadence when virtualization is disabled
     - Defer heavy nodes until visible (`viewportPriority`, `deferNodesUntilVisible`)

---

## Public API (safe to suggest)

From `markstream-vue` (`src/exports.ts`):

- Component: `MarkdownRender` (default export)
- Parser helpers (re-exported): `getMarkdown()`, `parseMarkdownToStructure(content, md)`, `setDefaultMathOptions()`
- Custom node renderers: `setCustomComponents()`, `removeCustomComponents()`, `clearGlobalCustomComponents()`
- Feature toggles: `enableMermaid()`, `disableMermaid()`, `enableKatex()`, `disableKatex()`
- Worker injection:
  - KaTeX: `createKaTeXWorkerFromCDN()`, `setKaTeXWorker()`
  - Mermaid: `createMermaidWorkerFromCDN()`, `setMermaidWorker()`

From `stream-markdown-parser` (`packages/markdown-parser/src/index.ts`):

- `getMarkdown()`, `parseMarkdownToStructure(content, md)`, `ParseOptions` hooks
- Streaming mid-state behavior and `final: true` end-of-stream mode

---

## Troubleshooting checklist (high signal)

When “it doesn’t render” or “looks wrong”, check these in order:

1) **CSS order/reset**: reset first, then `markstream-vue/index.css` (Tailwind: use `@import 'markstream-vue/index.css' layer(components);`).
2) **Optional peer installed** (Mermaid/KaTeX).
3) **Loader enabled** if you disabled or override it: `enableMermaid()` / `enableKatex()`.
4) **Peer CSS imported** where required: `katex/dist/katex.min.css` (Mermaid does not require extra CSS).
5) **Standalone node wrapper**: standalone node components need a `.markstream-vue` wrapper for scoped styles/vars.
6) **SSR**: standard Markdown is SSR-safe; add a client-only boundary only for browser-only peers/workers.

Docs: `docs/guide/troubleshooting.md`, `docs/guide/tailwind.md`, `docs/nuxt-ssr.md`

---

## Common intents (router)

Use these as “answer skeletons”: quick steps + minimal repro questions + where to read next.

### Install + first render

- Signals: “how to use”, “minimal example”
- Steps:
  - Import CSS: `markstream-vue/index.css`
  - Render: `&lt;MarkdownRender :content="md" /&gt;`
- Ask: “Vite or Nuxt? Show your CSS import order (reset + Tailwind layers).”
- Docs: `docs/guide/quick-start.md`, `docs/guide/installation.md`

### CSS missing / Tailwind overrides

- Signals: “unstyled”, “Tailwind overrides”, “looks wrong”
- Steps:
  - Ensure reset loads before `markstream-vue/index.css`
  - Tailwind: use `@import 'markstream-vue/index.css' layer(components);`
  - If using standalone node components, wrap `.markstream-vue`
- Ask: “Paste `main.css` (Tailwind layers) + where you import `markstream-vue/index.css`.”
- Docs: `docs/guide/tailwind.md`, `docs/guide/troubleshooting.md`

### Streaming: “loading forever” at end

- Signals: “stuck loading”, “final chunk”
- Steps:
  - On end-of-stream set `final: true` (ParseOptions or component prop) so mid-states don’t stick
- Ask: “Do you set `final` when the stream ends? What are the last ~40 chars (often ends with ``` or $$)?”
- Docs: `docs/guide/parser-api.md`, `docs/guide/parser.md`

### Streaming: smooth typewriter feel

- Signals: “bursty”, “jumpy”, “not smooth”
- Steps:
  - Use `content` with built-in smooth streaming first (`typewriter=true` or `max-live-nodes<=0` enables `smooth-streaming="auto"`)
  - In Vue 3 (including Nuxt), `smooth-streaming` controls output pacing and `fade` controls opacity; they can be enabled together. `mode="chat"` keeps `fade=false` as a lightweight default. Add `fade` when gradual text reveal is desired; keep it off when animation cost matters more. This bounded append-fade behavior is Vue 3-specific; check the adapter guide for other frameworks.
  - Enable/tune batching (`renderBatchSize` / `renderBatchDelay`) when virtualization is disabled
  - Keep heavy nodes deferred (`viewportPriority`, `deferNodesUntilVisible`)
- Ask: “How often do you update the `content` or `nodes` input path (per token? per chunk?) and what batch props are set?”
- Docs: `docs/guide/ai-chat-streaming.md`, `docs/guide/performance.md`, `docs/guide/props.md`

### Large documents: perf/memory

- Signals: “huge markdown”, “scroll lag”, “memory high”
- Steps:
  - Tune virtualization (`maxLiveNodes`, `liveNodeBuffer`)
  - Keep heavy nodes deferred
- Ask: “Approx size (KB/lines)? Many code blocks/diagrams?”
- Docs: `docs/guide/performance.md`

### Mermaid not rendering

- Signals: “mermaid blank”
- Steps:
  - Install peer `mermaid`
  - If you disabled/overrode the loader, call `enableMermaid()` on the client (or set a custom loader)
  - Re-check CSS order/reset
- Ask: “Did you disable the loader? Any SSR? Is the fence ```mermaid?”
- Docs: `docs/guide/mermaid.md`, `docs/guide/troubleshooting.md`
- Code: `src/components/MermaidBlockNode/mermaid.ts`

### KaTeX not rendering

- Signals: “math not shown”
- Steps:
  - Install peer `katex`
  - Import `katex/dist/katex.min.css`
  - If you disabled/overrode the loader, call `enableKatex()` on the client (or set a custom loader)
- Ask: “Is KaTeX CSS imported? `$...$` or `$$...$$`? Any SSR? Did you disable the loader?”
- Docs: `docs/guide/math.md`, `docs/guide/installation.md`
- Code: `src/components/MathInlineNode/katex.ts`

### Code block runtime not working / blank

- Signals: “toolbar missing”, “blank code block”
- Steps:
  - `CodeBlockNode` is the only code block renderer, enhanced via `stream-diffs` (diff tracking, code/render options)
  - For app-level preloading, call `preloadCodeBlockRuntime()` from `markstream-vue`
  - Install `stream-diffs` for the enhanced surface; without it the built-in renderer falls back to `<pre><code>`
  - Pass supported options through top-level or direct `codeBlockOptions`; keep header/toolbar settings in `codeBlockProps`
  - Use numeric CSS pixels for `maxHeight` and the single symmetric `padding` value
  - Set `render-code-blocks-as-pre` to force the plain path, or replace `code_block` through scoped `setCustomComponents(...)`
- Ask: “Any console errors? Is `stream-diffs` installed? Are you forcing the plain path or using a custom `code_block`?”
- Docs: `docs/guide/code-block-runtime.md`, `docs/guide/components.md`

### Prefer lightweight code blocks (no diffs)

- Signals: “SSR friendly”, “reduce bundle”
- Steps:
  - Use `render-code-blocks-as-pre` for plain `<pre>` code blocks (no diff tracking)
  - Install `stream-diffs` when the built-in `CodeBlockNode` should provide diff tracking
- Ask: “Need diff tracking or just plain code?”
- Docs: `docs/guide/code-blocks.md`, `docs/guide/components.md`

### Custom components in Markdown (`&lt;thinking&gt;`)

- Signals: “custom tag”, “embed component”
- Steps:
- Allow custom tags via `customHtmlTags` / `custom-html-tags` (unknown tags render as raw HTML when closed; incomplete or malformed fragments stay as text)
  - Map via `setCustomComponents(customId, mapping)`
- Ask: “What tag names? Do you want HTML passthrough or a custom node type?”
- Docs: `docs/guide/advanced.md`, `docs/guide/parser-api.md`

### Nuxt SSR errors

- Signals: “window is not defined”, “SSR crash”
- Steps:
  - Keep standard Markdown on the SSR path
  - Move only browser-only peer/worker initialization behind `onMounted` or a `&lt;ClientOnly&gt;` boundary
- Ask: “Nuxt version? Error during build or runtime? Which peers are installed/enabled?”
- Docs: `docs/nuxt-ssr.md`

### “What does the package export?”

- Signals: “is X exported”, “how to import Y”
- Steps:
  - Check `src/exports.ts` and `package.json#exports`
- Ask: “Which symbol and what import path did you try?”
- Docs: `docs/guide/components.md`, `docs/guide/api.md`
