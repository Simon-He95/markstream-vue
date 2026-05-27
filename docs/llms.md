# markstream-vue — Agent Context (`/llms`)

This file is a **compact, agent-focused** map of `markstream-vue`: where things live, how to answer common questions, and what to check first when users report issues.

For human-facing prompts and reusable rollout templates, also see `/guide/ai-workflows`.

## Answering guidelines

- Prefer **user-facing behavior** from `docs/guide/*` (and `docs/zh/guide/*`) and **export surface** from `src/exports.ts`.
- Ask **at most one** clarifying question if the request is ambiguous.
- When debugging, ask for a **minimal repro** (there’s a shareable test page) and walk the user through the checklist below.
- Avoid raw HTML tags like `&lt;thinking&gt;` in Markdown docs pages; escape them (VitePress compiles Markdown as Vue SFC).

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
   - Default component: `MarkdownRender` (also referred to as `NodeRenderer`)
   - Takes either `content: string` (parses internally) or `nodes: ParsedNode[]` (recommended for streaming)
   - Performance tools:
     - Virtualization window (`maxLiveNodes`, `liveNodeBuffer`)
     - Batch rendering (steady “typewriter” feel)
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
2) **Optional peer installed** (Mermaid/KaTeX/Monaco/Shiki).
3) **Loader enabled** if you disabled or override it: `enableMermaid()` / `enableKatex()`.
4) **Peer CSS imported** where required: `katex/dist/katex.min.css` (Mermaid does not require extra CSS).
5) **Standalone node wrapper**: standalone node components need a `.markstream-vue` wrapper for scoped styles/vars.
6) **SSR**: in Nuxt, wrap with `&lt;client-only&gt;` when using browser-only peers/workers.

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
  - Enable/tune batching (`renderBatchSize` / `renderBatchDelay`)
  - Keep heavy nodes deferred (`viewportPriority`, `deferNodesUntilVisible`)
- Ask: “How often do you update `content/nodes` (per token? per chunk?) and what batch props are set?”
- Docs: `docs/guide/performance.md`, `docs/guide/props.md`

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

### Monaco code blocks missing features / blank

- Signals: “toolbar missing”, “blank editor”
- Steps:
  - Install peer `stream-monaco`
  - Ensure Monaco workers are bundled (Vite plugin) and you’re on the client
  - For app-level preloading, call `preloadCodeBlockRuntime()` from `markstream-vue`; do not import `stream-monaco` directly just to warm workers
- Ask: “Any worker-related console errors? Are Monaco workers bundled in production?”
- Docs: `docs/guide/monaco.md`, `docs/guide/components.md`

### Prefer lightweight code blocks (no Monaco)

- Signals: “SSR friendly”, “reduce bundle”
- Steps:
  - Use `MarkdownCodeBlockNode` (Shiki) or `render-code-blocks-as-pre`
  - If using Shiki, install `stream-markdown`
- Ask: “Need highlighting or just plain code?”
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
  - Wrap renderer in `&lt;client-only&gt;`
  - Ensure heavy peers/workers initialize only in browser
- Ask: “Nuxt version? Error during build or runtime? Which peers are installed/enabled?”
- Docs: `docs/nuxt-ssr.md`

### “What does the package export?”

- Signals: “is X exported”, “how to import Y”
- Steps:
  - Check `src/exports.ts` and `package.json#exports`
- Ask: “Which symbol and what import path did you try?”
- Docs: `docs/guide/components.md`, `docs/guide/api.md`
