---
name: markstream-install
description: Install and wire markstream-vue, markstream-react, markstream-vue2, markstream-angular, or markstream-svelte into an existing repository. Use when Codex needs to choose the right package, install the smallest framework-specific peer-dependency set, fix CSS/reset order, choose Vue 3 renderer mode and built-in, plain, or custom code-block paths, decide between `content`, `nodes`, and Vue 3 virtual-scroll coordination, or add a minimal working renderer example.
---

# Markstream Install

Use this skill when the task is "add markstream to an app" or "fix a broken markstream install".

Read [references/scenarios.md](references/scenarios.md) before making dependency choices.

## Workflow

1. Detect the target framework and CSS stack.
   - Check `package.json`, app entry files, Tailwind or UnoCSS config, and whether the repo is SSR or streaming-focused.
   - Choose the package that matches the host app: `markstream-vue`, `markstream-vue2`, `markstream-react`, `markstream-angular`, or `markstream-svelte`.
   - Use `markstream-svelte` only for Svelte 5 apps.
2. Install the smallest peer set that matches the requested features.
   - Add peers only for features the user actually needs. Check the chosen package's `peerDependencies`; peer availability differs by renderer.
   - Vue 3 fenced code uses the built-in renderer automatically. Add `stream-diffs` for the enhanced File/Diff surface, omit it for automatic `<pre><code>` fallback, or set `render-code-blocks-as-pre` to force the plain path.
   - Add `@antv/infographic` plus `setInfographicLoader(...)` only when infographic fences are needed.
   - Do not install every optional peer by default.
   - For Vue 3 enhanced code-block preloading, use `preloadCodeBlockRuntime` from `markstream-vue`. If the application intentionally owns a runtime controller, import that advanced API directly from `stream-diffs`.
3. Fix CSS order.
   - Put reset styles before Markstream styles.
   - In Tailwind or UnoCSS projects, use `@import 'markstream-*/index.css' layer(components);`.
   - Do not rely on renderer imports to inject CSS; import the package CSS subpath explicitly.
   - Import `katex/dist/katex.min.css` when math is enabled.
4. Add the smallest working render example.
    - Use `content` for static or low-frequency rendering.
    - In Vue 3 apps with long AI conversations, thread restore, or an existing message virtualizer such as `vue-virtual-scroller`, do not stop at a trivial renderer. Use `MarkstreamVirtualTimeline` or `useMarkstreamVirtualAdapter()` and follow `docs/guide/performance.md`.
    - For Vue 3, choose renderer `mode` by surface before tuning lower-level props.
      - `mode="chat"`: AI chat or SSE output; lightweight batches, `fade=false`, `max-live-nodes=0`, and `smooth-streaming="auto"`.
      - `mode="docs"`: rich document surfaces; default mode, larger batches, tooltips, and fade.
      - `mode="minimal"`: lightweight non-chat surfaces.
      - In Vue 3 (including Nuxt), `smooth-streaming` controls output pacing and `fade` controls opacity; they can be enabled together. `mode="chat"` keeps `fade=false` as a lightweight default. Add `fade` when gradual text reveal is desired; keep it off when animation cost matters more.
      - Regular fenced code uses the built-in renderer, enhanced by `stream-diffs` when installed. Use `render-code-blocks-as-pre` for a forced plain path or `setCustomComponents(customId, { code_block: ... })` for a scoped application-owned renderer.
    - For streaming AI chat in other Markstream packages, start with `content` and built-in smooth streaming.
      - Auto mode is the default: `smoothStreaming="auto"` / `smooth-streaming="auto"`.
      - Auto pacing activates when `typewriter=true` or `maxLiveNodes <= 0` / `max-live-nodes <= 0`.
      - `typewriter` only controls the blinking cursor and defaults to `false`.
      - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
      - For high-frequency smooth streams, consider `fade=false` / `:fade="false"` / `[fade]="false"` to avoid fade stacking.
    - **Streaming vs recovering history**: in chat UIs the same renderer starts streaming and later switches to history when `final` becomes `true`.
      - Vue 3 streaming: `mode="chat"`, `final`, optional `fade` for gradual reveal, and optional `typewriter` for a cursor.
      - Vue 3 recovering/completed chat history: keep `mode="chat"` on the same chat row; use `:smooth-streaming="false"`, `typewriter=false`, and choose fade independently; it may remain enabled during both streaming and history display.
      - Use `mode="minimal"` for lightweight non-chat recovered content, and use `mode="docs"` only for rich document surfaces.
      - Other packages streaming: `smoothStreaming="auto"` / `smooth-streaming="auto"`, `fade=false`, `typewriter=true`.
      - Other packages recovering history: `smoothStreaming=false` / `smooth-streaming=false`, `fade=true`, `typewriter=false`.
      - Optional policy for other packages: `smoothStreaming={isStreaming ? 'auto' : false}`, `fade={!isStreaming}`; this is not a required coupling.
    - Use `nodes` + `final` only for worker preparsing, shared AST stores, or custom AST control.
    - In Vue 3, use `typewriter="simple"` for a lightweight cursor on high-frequency streams; use precise mode only when the cursor must follow complex inline layout.
    - For a non-virtual Vue 3 chat scroller, import `useStickToBottom` from `markstream-vue/utils`; call `scheduleScrollToBottom()` after the content update instead of starting a smooth `scrollIntoView()` animation for every token. Use `MarkstreamVirtualTimeline` with `stick-to-bottom="auto"` for long mixed timelines.
    - For manual pacing with `nodes`, use `useSmoothMarkdownStream`: `enqueue()` chunks, `finish()` when done, render from `visible`, wait for `caughtUp` before final parsing.
    - Preserve the default hardening: HTML policies now default to `safe`, and Mermaid runs in strict mode by default.
5. Keep customization scoped.
    - If the task requires overrides, prefer `customId` / `custom-id` plus scoped `setCustomComponents(...)`.
6. Validate.
   - Run the smallest relevant build, typecheck, test, or docs build command.
   - Report which peers were installed, where CSS lives, and whether the repo should later adopt `nodes`.

## Default Decisions

- Prefer the minimal peer set over "install everything".
- For Vue 3, omit `mode` only when the surface should use rich docs defaults.
- Prefer `content` for most streaming chat now that built-in smooth streaming is available across Vue 3, Vue 2, React, Svelte, and Angular.
- Move to `nodes` only when another layer owns parsing or AST transforms.
- For Vue 3 apps that already virtualize messages, keep the outer virtualizer responsible for mounted rows; use Markstream virtual-scroll coordination so item height comes from `metrics.totalHeight`, not the renderer DOM height.
- When using `content` for streaming, smooth streaming (`smooth-streaming="auto"`) is on by default for `typewriter` or `max-live-nodes <= 0`. Set `:smooth-streaming="false"` to preserve raw chunk cadence.
- Streaming vs recovering history: keep the renderer mode stable. In Vue 3, fade is independent of pacing and can stay enabled throughout a stream. The conservative fade-off streaming examples for other packages are not an API restriction; those adapters have not adopted the Vue 3 bounded fade implementation. See `docs/guide/ai-chat-streaming.md` for Vue 3 examples.
- Treat CSS order as a first-class part of installation, not a later cleanup.
- When the request includes SSR, explicitly gate browser-only peers behind client-only boundaries.
- Do not widen HTML or Mermaid security defaults unless the user explicitly needs trusted legacy compatibility.
- Enhanced code blocks in every Markstream package use `stream-diffs`; there is no `stream-monaco` or Shiki direct integration in current versions.
- Direct `CodeBlockNode` and top-level renderer configuration use the same `codeBlockOptions` / `CodeBlockOptions` contract. Keep component chrome in `codeBlockProps`; do not nest runtime options there.
- In Vue 3, large code blocks can be highlighted off the main thread by injecting an upstream `@pierre/diffs` `WorkerPoolManager` through `setStreamDiffsWorkerPool(...)`. The host builds the pool with its own bundler and adds `@pierre/diffs` as a direct dependency. This is a Vue 3-only enhancement; the other framework packages do not expose it.
- If compatibility requires it, scope the opt-out to the trusted surface with `htmlPolicy` / `html-policy="trusted"` and `mermaidProps.isStrict = false` instead of changing app-wide defaults blindly.

## Useful Doc Targets

- `docs/guide/installation.md`
- `docs/guide/usage.md`
- `docs/guide/performance.md`
- `docs/guide/troubleshooting.md`
- `docs/guide/component-overrides.md`
