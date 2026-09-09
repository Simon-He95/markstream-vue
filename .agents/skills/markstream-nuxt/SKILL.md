---
name: markstream-nuxt
description: Integrate markstream-vue into a Nuxt 3 or Nuxt 4 app. Use when Codex needs client-only boundaries, SSR-safe setup, browser-only peer gating, worker-aware initialization, renderer `mode` selection, or a safe `MarkdownRender` integration inside pages, components, or Nuxt plugins.
---

# Markstream Nuxt

Use this skill when the host app is Nuxt and SSR boundaries matter.

## Workflow

1. Confirm the repo is Nuxt 3 or 4.
2. Install `markstream-vue` plus only the optional peers required by the requested features.
3. Keep browser-only peers behind client-only boundaries.
   - Prefer `<client-only>` wrappers, `.client` plugins, or guarded setup paths.
4. Import `markstream-vue/index.css` from a client-safe app shell or plugin.
   - The root JS import does not inject styles; use `markstream-vue/index.css` or `markstream-vue/index.px.css` explicitly.
5. Start with `content`, choose the renderer mode by surface, and move to `nodes` plus `final` only when the UI needs custom AST control.
   - Use `mode="chat"` for AI chat or SSE output. It uses lightweight batches, `fade=false`, and `max-live-nodes=0`; `smooth-streaming="auto"` paces visible output.
   - Use `mode="docs"` for rich document surfaces. It is the default and enables larger batches, tooltips, and fade.
   - Use `mode="minimal"` for lightweight non-chat surfaces.
   - Regular fenced code uses the built-in renderer, enhanced by `stream-diffs` when the optional peer is installed. Use `render-code-blocks-as-pre` for a forced plain path or `setCustomComponents(customId, { code_block: ... })` for a scoped application-owned renderer.
   - `typewriter` only controls the blinking cursor and defaults to `false`. Prefer `typewriter="simple"` for high-frequency chat.
   - In Vue 3 (including Nuxt), `smooth-streaming` controls output pacing and `fade` controls opacity; they can be enabled together. `mode="chat"` keeps `fade=false` as a lightweight default. Add `fade` when gradual text reveal is desired; keep it off when animation cost matters more. Vue 3 append fades use stable batches (200 ms, 50 ms coalescing window, at most four batches per text node); later appends do not restart earlier batches.
   - **Streaming vs recovering history**: in chat UIs the same `MarkdownRender` starts streaming and later switches to history when `final=true`.
     - Streaming: start with `mode="chat"` and `final`; add `fade` for text reveal and `typewriter` only when a cursor is wanted.
     - Recovering/completed chat history: keep `mode="chat"` on the same chat row; use `:smooth-streaming="false"`, `typewriter=false`, and choose `fade` independently for the desired entry/reveal effect. Do not bind it to the inverse of streaming state unless that visual policy is intentional.
     - Use `mode="minimal"` for lightweight non-chat recovered content, and use `mode="docs"` only for rich document surfaces.
   - In SSR, avoid `smooth-streaming="true"` on first-screen content; the mounted gate inside `auto` prevents hydration mismatch.
   - Remember that `html-policy` now defaults to `safe`, and Mermaid strict mode is on by default through `mermaid-props`.
6. Validate with the smallest relevant Nuxt dev, build, or typecheck command.

## Default Decisions

- SSR safety comes before feature completeness.
- Omit `mode` only when the surface should use rich docs defaults.
- Smooth streaming is SSR-safe in `auto` mode (the default) because it gates on mount. Do not use `smooth-streaming="true"` for first-screen SSR content — it bypasses the mounted gate and can cause hydration mismatch or blank flash.
- For a non-virtual chat scroller, import `useStickToBottom` from `markstream-vue/utils` and call `scheduleScrollToBottom()` after Vue commits new content. The composable attaches browser listeners after mount; use `MarkstreamVirtualTimeline` with `stick-to-bottom="auto"` for long mixed timelines.
- Avoid import-time access to browser globals from server code paths.
- Treat the enhanced code runtime, Mermaid workers, and similar heavy peers as client-only unless the repo already has a proven SSR pattern.
- For large code blocks, the optional off-thread highlight pool (`setStreamDiffsWorkerPool` from `markstream-vue`, backed by an upstream `@pierre/diffs` `WorkerPoolManager`) is also client-only: inject it in a client-only plugin/component, never in server code paths.
- Enhanced code blocks in every Markstream package use `stream-diffs`; do not install `stream-monaco`.
- Use top-level `code-block-options` for supported built-in code-surface configuration. Keep theme, code/language, streaming lifecycle, header, mounting, reveal, and disposal under Markstream's control.
- Keep `html-policy="safe"` and Mermaid strict mode unless the task is preserving trusted legacy rendering.
- If a trusted client-only surface needs older behavior, opt out locally with `html-policy="trusted"` and `:mermaid-props="{ isStrict: false }"`, and document why that surface is trusted.

## Useful Doc Targets

- `docs/nuxt-ssr.md`
- `docs/guide/installation.md`
- `docs/guide/usage.md`
- `docs/guide/troubleshooting.md`
