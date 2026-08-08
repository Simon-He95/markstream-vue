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
   - Use `mode="chat"` for AI chat or SSE output. It uses lightweight batches, `<pre>` code rendering by default, `fade=false`, and `max-live-nodes=0`; `smooth-streaming="auto"` paces visible output.
   - Use `mode="docs"` for rich document surfaces. It is the default, enables larger batches, tooltips, fade, and enhanced `stream-diffs` code blocks when the peer is installed.
   - Use `mode="minimal"` for lightweight non-chat surfaces.
   - Choose regular fenced-code rendering with `code-renderer="stream-diffs" | "pre"`. `stream-diffs` renders enhanced File/Diff code blocks; `pre` needs no code peer.
   - `typewriter` only controls the blinking cursor and defaults to `false`. Prefer `typewriter="simple"` for high-frequency chat.
   - When overriding mode defaults on a high-frequency stream, pair smooth streaming with `:fade="false"` to avoid delta fade stacking with high-commit pacing.
   - **Streaming vs recovering history**: in chat UIs the same `MarkdownRender` starts streaming and later switches to history when `final=true`.
     - Streaming: `mode="chat"`, `smooth-streaming="auto"`, `:fade="false"`, `typewriter=true`.
     - Recovering/completed chat history: keep `mode="chat"` on the same chat row; use `:smooth-streaming="false"`, `typewriter=false`, and only set `:fade="true"` when the host explicitly wants a history-entry animation.
     - Use `mode="minimal"` for lightweight non-chat recovered content, and use `mode="docs"` only for rich document surfaces.
   - In SSR, avoid `smooth-streaming="true"` on first-screen content; the mounted gate inside `auto` prevents hydration mismatch.
   - Remember that `html-policy` now defaults to `safe`, and Mermaid strict mode is on by default through `mermaid-props`.
6. Validate with the smallest relevant Nuxt dev, build, or typecheck command.

## Default Decisions

- SSR safety comes before feature completeness.
- Omit `mode` only when the surface should use rich docs defaults.
- Smooth streaming is SSR-safe in `auto` mode (the default) because it gates on mount. Do not use `smooth-streaming="true"` for first-screen SSR content — it bypasses the mounted gate and can cause hydration mismatch or blank flash.
- Avoid import-time access to browser globals from server code paths.
- Treat the enhanced code runtime, Mermaid workers, and similar heavy peers as client-only unless the repo already has a proven SSR pattern.
- Enhanced code blocks in every Markstream package use `stream-diffs`; do not install `stream-monaco`.
- Keep `html-policy="safe"` and Mermaid strict mode unless the task is preserving trusted legacy rendering.
- If a trusted client-only surface needs older behavior, opt out locally with `html-policy="trusted"` and `:mermaid-props="{ isStrict: false }"`, and document why that surface is trusted.

## Useful Doc Targets

- `docs/nuxt-ssr.md`
- `docs/guide/installation.md`
- `docs/guide/usage.md`
- `docs/guide/troubleshooting.md`
