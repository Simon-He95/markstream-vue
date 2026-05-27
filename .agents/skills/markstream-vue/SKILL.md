---
name: markstream-vue
description: Integrate markstream-vue into a Vue 3 app. Use when Codex needs to add the Vue 3 renderer, import CSS in the right order, choose between `content` and `nodes`, enable optional peers like Mermaid, KaTeX, D2, Monaco, or stream-markdown, or wire scoped custom components in a non-Nuxt Vue repository.
---

# Markstream Vue 3

Use this skill when the host app is plain Vue 3, typically Vite-based, and not Nuxt.

## Workflow

1. Confirm the repo is Vue 3 and not Nuxt.
2. Install `markstream-vue` plus only the optional peers required by the requested features.
3. Import `markstream-vue/index.css` after resets.
   - In Tailwind or UnoCSS projects, use `@import 'markstream-vue/index.css' layer(components);`.
4. Start with `<MarkdownRender :content="markdown" />`.
   - For AI chat or streaming UIs, use `typewriter` or `:max-live-nodes="0"` — smooth streaming is auto-enabled (`smooth-streaming="auto"`, the default) and paces visible output so bursty chunks appear steadily.
   - `typewriter` only controls the blinking cursor and defaults to `false`.
   - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
   - Set `:smooth-streaming="false"` to preserve raw chunk cadence; set `:smooth-streaming="true"` to force smooth pacing even on first-screen content (may cause hydration mismatch in SSR).
   - When smooth streaming is on, pair it with `:fade="false"` to avoid delta fade (280 ms) stacking with high-commit pacing.
   - **Streaming vs recovering history**: in chat UIs the same `MarkdownRender` starts streaming and later switches to history when `final=true`.
     - Streaming: `smooth-streaming="auto"`, `fade=false`, `typewriter=true`. Smooth pacing handles gradual appearance; fade would flicker.
     - Recovering history: `smooth-streaming=false`, `fade=true`, `typewriter=false`. Content is already complete — pacing would slow it down, but fade gives a polished entry animation.
     - Dynamic switch: `:smooth-streaming="isStreaming ? 'auto' : false"`, `:fade="!isStreaming"`.
   - Switch to `nodes` plus `final` only when the app needs custom AST control, worker preparsing, or structural updates beyond pacing.
   - Remember that `html-policy` now defaults to `safe`, and Mermaid strict mode is on by default through `mermaid-props`.
5. Use `custom-id` plus scoped `setCustomComponents(...)` for overrides.
6. Validate with the smallest useful dev, build, or typecheck command.

## Default Decisions

- Vue 3 apps default to `content`.
- Smooth streaming (`smooth-streaming="auto"`) is on by default when `typewriter` or `max-live-nodes <= 0`. It only paces the `content` path; `nodes` mode is never affected.
- For manual pacing with `nodes`, use `useSmoothMarkdownStream` directly: `enqueue()` chunks, `finish()` when done, render from `visible`, and wait for `caughtUp` before final parsing.
- Streaming vs recovering history: when a chat message transitions from streaming to history (e.g. `final` becomes `true`), switch props dynamically — `smooth-streaming="auto"`, `fade=false` for streaming; `smooth-streaming=false`, `fade=true` for history. See `docs/guide/ai-chat-streaming.md` for full examples.
- Prefer local component registration unless the repo already uses a shared plugin entry.
- When Monaco code blocks need app-level preloading, import `preloadCodeBlockRuntime` from `markstream-vue`. Existing `getUseMonaco()` preloads remain valid; do not import `stream-monaco` directly just to warm workers.
- Keep `html-policy="safe"` and Mermaid strict mode unless the task is explicitly preserving trusted legacy behavior.
- If a trusted surface needs pre-hardening behavior, opt out locally with `html-policy="trusted"` and `:mermaid-props="{ isStrict: false }"`, and call out the trust boundary in the final handoff.
- If the host is actually Nuxt, leave SSR-specific setup to `markstream-nuxt`.

## Useful Doc Targets

- `docs/guide/quick-start.md`
- `docs/guide/installation.md`
- `docs/guide/usage.md`
- `docs/guide/ai-chat-streaming.md`
- `docs/guide/component-overrides.md`
