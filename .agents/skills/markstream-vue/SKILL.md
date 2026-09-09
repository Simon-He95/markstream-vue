---
name: markstream-vue
description: Integrate markstream-vue into a Vue 3 app. Use when Codex needs to add the Vue 3 renderer, import CSS in the right order, choose renderer and DOM modes, choose built-in, plain, or custom code-block paths, choose between `content` and `nodes`, coordinate long AI timelines with `MarkstreamVirtualTimeline`, `useMarkstreamVirtualAdapter`, or `vue-virtual-scroller`, enable optional peers such as stream-diffs, Mermaid, KaTeX, D2, or Infographic, or wire scoped custom components in a non-Nuxt Vue repository.
---

# Markstream Vue 3

Use this skill when the host app is plain Vue 3, typically Vite-based, and not Nuxt.

## Workflow

1. Confirm the repo is Vue 3 and not Nuxt.
2. Install `markstream-vue` plus only the optional peers required by the requested features.
3. Import `markstream-vue/index.css` after resets.
   - In Tailwind or UnoCSS projects, use `@import 'markstream-vue/index.css' layer(components);`.
   - The root JS import does not inject styles; use `markstream-vue/index.css` or `markstream-vue/index.px.css` explicitly.
4. Start with `content` and choose the renderer mode by surface.
   - Use `mode="chat"` for AI chat or SSE output. It uses lightweight batches, `fade=false`, and `max-live-nodes=0`; `smooth-streaming="auto"` paces visible output.
   - Use `mode="docs"` for rich document surfaces. It is the default and enables larger batches, tooltips, and fade.
   - Use `mode="minimal"` when the surface is lightweight but not chat.
   - Regular fenced code uses the built-in `CodeBlockNode`, enhanced by `stream-diffs` when that optional peer is installed and otherwise falling back to `<pre><code>`. Set `render-code-blocks-as-pre=true` to force the plain path, or replace `code_block` through scoped `setCustomComponents(...)` when the app owns the renderer.
   - Use `dom-mode="minimal"` only when the surface can also disable wrapper-dependent features such as fade, batching, deferral, virtualization, typewriter, and custom components; otherwise it falls back to full DOM.
   - `typewriter` only controls the blinking cursor and defaults to `false`. Prefer `typewriter="simple"` for high-frequency chat and precise mode for complex inline cursor placement.
   - Set `:smooth-streaming="false"` to preserve raw chunk cadence; set `:smooth-streaming="true"` to force smooth pacing even on first-screen content (may cause hydration mismatch in SSR).
   - In Vue 3 (including Nuxt), `smooth-streaming` controls output pacing and `fade` controls opacity; they can be enabled together. `mode="chat"` keeps `fade=false` as a lightweight default. Add `fade` when gradual text reveal is desired; keep it off when animation cost matters more. Vue 3 append fades use stable batches (200 ms, 50 ms coalescing window, at most four batches per text node); later appends do not restart earlier batches.
   - **Streaming vs recovering history**: in chat UIs the same `MarkdownRender` starts streaming and later switches to history when `final=true`.
     - Streaming: start with `mode="chat"` and `final`; add `fade` for text reveal and `typewriter` only when a cursor is wanted.
     - Recovering/completed chat history: keep `mode="chat"` on the same chat row to avoid switching layout strategy when `final=true`; use `:smooth-streaming="false"`, `typewriter=false`, and choose `fade` independently for the desired entry/reveal effect. Do not bind it to the inverse of streaming state unless that visual policy is intentional.
     - Use `mode="minimal"` for lightweight non-chat recovered content, and use `mode="docs"` only for rich document surfaces, not for finalizing an existing chat message.
   - Switch to `nodes` plus `final` only when the app needs custom AST control, worker preparsing, or structural updates beyond pacing.
   - Remember that `html-policy` now defaults to `safe`, and Mermaid strict mode is on by default through `mermaid-props`.
5. For long AI transcripts or existing message virtualizers, choose the virtual-scroll path.
   - Prefer `MarkstreamVirtualTimeline` when the app does not already own timeline virtualization.
   - If the app already uses `vue-virtual-scroller` `DynamicScroller`, use `useMarkstreamVirtualAdapter()` and bind `adapter.markdownProps(item, index)` to Markdown items.
   - Put `adapter.measureItem(item, index, el)` on the outer timeline row so row chrome is included in item height.
   - Use Markstream's reported logical height (`metrics.totalHeight` through the adapter/virtualizer), not the renderer element's current `offsetHeight`, because Markdown node virtualization may only mount the live window.
   - On thread switches, save `adapter.captureThreadState()` together with the scroller cache; restore the scroller cache before restoring the Markstream anchor.
6. Use `custom-id` plus scoped `setCustomComponents(...)` for local overrides, or import `{ VueRendererMarkdown }` from `markstream-vue` and install it when the repo already has an app-level plugin entry.
7. Validate with the smallest useful dev, build, or typecheck command.

## Default Decisions

- Vue 3 apps default to `content`; choose `mode` before fine-tuning lower-level render props.
- Omit `mode` only when the surface should use rich docs defaults.
- Smooth streaming (`smooth-streaming="auto"`) is on by default when `typewriter` or `max-live-nodes <= 0`. It only paces the `content` path; `nodes` mode is never affected.
- For manual pacing with `nodes`, use `useSmoothMarkdownStream` directly: `enqueue()` chunks, `finish()` when done, render from `visible`, and wait for `caughtUp` before final parsing.
- For a non-virtual chat scroller that should follow streaming output, import `useStickToBottom` from `markstream-vue/utils` and call `scheduleScrollToBottom()` after Vue commits new content. It coalesces writes and preserves manual scrollback; do not run `scrollIntoView({ behavior: 'smooth' })` for every token. For long mixed timelines, use `MarkstreamVirtualTimeline` with `stick-to-bottom="auto"` instead.
- Streaming vs recovering history: keep the same renderer mode for a given chat row; completed history can disable pacing/cursor; fade is an independent visual choice and may remain enabled throughout streaming and completion. Switch to `mode="docs"` only when moving content into a separate rich document surface. See `docs/guide/ai-chat-streaming.md` for full examples.
- Prefer local component registration unless the repo already uses a shared plugin entry.
- If a Vue 3 app already virtualizes messages, keep that outer virtualizer in charge and enable `virtual-scroll` only on large Markdown messages.
- For `vue-virtual-scroller`, keep `sessionKey` tied to content identity (`thread:item:revision`) and `measurementKey` tied to layout identity such as width, theme, font, and density.
- When enhanced code blocks need app-level preloading, use `preloadCodeBlockRuntime`. For intentional low-level controller use, import the advanced API directly from `stream-diffs`; do not depend on a raw-runtime getter from `markstream-vue`.
- The Vue 3 enhanced code surface uses `stream-diffs` only; do not install `stream-monaco`.
- For large code blocks (tens of thousands of lines) in Vue 3, offload Shiki tokenization to Web Workers by injecting an upstream `@pierre/diffs` `WorkerPoolManager` via `setStreamDiffsWorkerPool(...)` from `markstream-vue`. The host builds the pool with its own bundler (`@pierre/diffs/worker/worker.js?worker`) and adds `@pierre/diffs` as a direct dependency; markstream-vue forwards it as the `workerManager` runtime option and syncs the active `isDark`/`theme`/`themes` theme to the pool on every change. Without injection, or when the pool reports itself unavailable, highlighting stays on the main thread (unchanged behavior). Do not bundle or spawn the worker inside the library.
- Configure the built-in surface through top-level `code-block-options` or direct `CodeBlockNode.codeBlockOptions`. Keep header/toolbar props in `code-block-props`; Markstream retains ownership of theme, code/language, streaming lifecycle, header, mount/reveal timing, and disposal.
- Keep `html-policy="safe"` and Mermaid strict mode unless the task is explicitly preserving trusted legacy behavior.
- If a trusted surface needs pre-hardening behavior, opt out locally with `html-policy="trusted"` and `:mermaid-props="{ isStrict: false }"`, and call out the trust boundary in the final handoff.
- If the host is actually Nuxt, leave SSR-specific setup to `markstream-nuxt`.

## Useful Doc Targets

- `docs/guide/quick-start.md`
- `docs/guide/installation.md`
- `docs/guide/usage.md`
- `docs/guide/ai-chat-streaming.md`
- `docs/guide/performance.md`
- `docs/guide/component-overrides.md`
- `docs/guide/code-block-runtime.md`
