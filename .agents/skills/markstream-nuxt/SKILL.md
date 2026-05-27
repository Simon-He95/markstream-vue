---
name: markstream-nuxt
description: Integrate markstream-vue into a Nuxt 3 or Nuxt 4 app. Use when Codex needs client-only boundaries, SSR-safe setup, browser-only peer gating, worker-aware initialization, or a safe `MarkdownRender` integration inside pages, components, or Nuxt plugins.
---

# Markstream Nuxt

Use this skill when the host app is Nuxt and SSR boundaries matter.

## Workflow

1. Confirm the repo is Nuxt 3 or 4.
2. Install `markstream-vue` plus only the optional peers required by the requested features.
3. Keep browser-only peers behind client-only boundaries.
   - Prefer `<client-only>` wrappers, `.client` plugins, or guarded setup paths.
4. Import `markstream-vue/index.css` from a client-safe app shell or plugin.
5. Start with `content`, and move to `nodes` plus `final` only when the UI needs custom AST control.
   - For streaming AI chat, use `typewriter` or `:max-live-nodes="0"` — smooth streaming (`smooth-streaming="auto"`) paces visible output automatically.
   - `typewriter` only controls the blinking cursor and defaults to `false`.
   - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
   - When smooth streaming is on, pair it with `:fade="false"` to avoid delta fade stacking with high-commit pacing.
   - **Streaming vs recovering history**: in chat UIs the same `MarkdownRender` starts streaming and later switches to history when `final=true`.
     - Streaming: `smooth-streaming="auto"`, `fade=false`, `typewriter=true`. Smooth pacing handles gradual appearance; fade would flicker.
     - Recovering history: `smooth-streaming=false`, `fade=true`, `typewriter=false`. Content is already complete — pacing would slow it down, but fade gives a polished entry animation.
     - Dynamic switch: `:smooth-streaming="isStreaming ? 'auto' : false"`, `:fade="!isStreaming"`.
   - In SSR, avoid `smooth-streaming="true"` on first-screen content; the mounted gate inside `auto` prevents hydration mismatch.
   - Remember that `html-policy` now defaults to `safe`, and Mermaid strict mode is on by default through `mermaid-props`.
6. Validate with the smallest relevant Nuxt dev, build, or typecheck command.

## Default Decisions

- SSR safety comes before feature completeness.
- Smooth streaming is SSR-safe in `auto` mode (the default) because it gates on mount. Do not use `smooth-streaming="true"` for first-screen SSR content — it bypasses the mounted gate and can cause hydration mismatch or blank flash.
- Avoid import-time access to browser globals from server code paths.
- Treat Monaco, Mermaid workers, and similar heavy peers as client-only unless the repo already has a proven SSR pattern.
- Keep `html-policy="safe"` and Mermaid strict mode unless the task is preserving trusted legacy rendering.
- If a trusted client-only surface needs older behavior, opt out locally with `html-policy="trusted"` and `:mermaid-props="{ isStrict: false }"`, and document why that surface is trusted.

## Useful Doc Targets

- `docs/nuxt-ssr.md`
- `docs/guide/installation.md`
- `docs/guide/usage.md`
- `docs/guide/troubleshooting.md`
