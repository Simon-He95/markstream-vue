---
name: markstream-install
description: Install and wire markstream-vue, markstream-react, markstream-vue2, markstream-angular, or markstream-svelte into an existing repository. Use when Codex needs to choose the right package, install the smallest peer-dependency set, fix CSS/reset order, decide between `content` and `nodes`, or add a minimal working renderer example.
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
   - Add peers only for features the user actually needs: Monaco, Mermaid, D2, KaTeX, or lightweight highlighting via `stream-markdown`.
   - Do not install every optional peer by default.
   - For Vue 3 Monaco preloading, use `preloadCodeBlockRuntime` from `markstream-vue` so the renderer runtime knows Monaco is warm. Existing `getUseMonaco()` calls are still compatible.
3. Fix CSS order.
   - Put reset styles before Markstream styles.
   - In Tailwind or UnoCSS projects, use `@import 'markstream-*/index.css' layer(components);`.
   - Import `katex/dist/katex.min.css` when math is enabled.
4. Add the smallest working render example.
    - Use `content` for static or low-frequency rendering.
    - For streaming AI chat, start with `content` and built-in smooth streaming.
      - Auto mode is the default: `smoothStreaming="auto"` / `smooth-streaming="auto"`.
      - Auto pacing activates when `typewriter=true` or `maxLiveNodes <= 0` / `max-live-nodes <= 0`.
      - `typewriter` only controls the blinking cursor and defaults to `false`.
      - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
      - For high-frequency smooth streams, consider `fade=false` / `:fade="false"` / `[fade]="false"` to avoid fade stacking.
    - **Streaming vs recovering history**: in chat UIs the same renderer starts streaming and later switches to history when `final` becomes `true`.
      - Streaming: `smoothStreaming="auto"` / `smooth-streaming="auto"`, `fade=false`, `typewriter=true`. Smooth pacing handles gradual appearance; fade would flicker.
      - Recovering history: `smoothStreaming=false` / `smooth-streaming=false`, `fade=true`, `typewriter=false`. Content is already complete — pacing would slow it down, but fade gives a polished entry animation.
      - Dynamic switch: `smoothStreaming={isStreaming ? 'auto' : false}`, `fade={!isStreaming}`.
    - Use `nodes` + `final` only for worker preparsing, shared AST stores, or custom AST control.
    - For manual pacing with `nodes`, use `useSmoothMarkdownStream`: `enqueue()` chunks, `finish()` when done, render from `visible`, wait for `caughtUp` before final parsing.
    - Preserve the default hardening: HTML policies now default to `safe`, and Mermaid runs in strict mode by default.
5. Keep customization scoped.
    - If the task requires overrides, prefer `customId` / `custom-id` plus scoped `setCustomComponents(...)`.
6. Validate.
   - Run the smallest relevant build, typecheck, test, or docs build command.
   - Report which peers were installed, where CSS lives, and whether the repo should later adopt `nodes`.

## Default Decisions

- Prefer the minimal peer set over "install everything".
- Prefer `content` for most streaming chat now that built-in smooth streaming is available across Vue 3, Vue 2, React, Svelte, and Angular.
- Move to `nodes` only when another layer owns parsing or AST transforms.
- When using `content` for streaming, smooth streaming (`smooth-streaming="auto"`) is on by default for `typewriter` or `max-live-nodes <= 0`. Set `:smooth-streaming="false"` to preserve raw chunk cadence.
- Streaming vs recovering history: when a chat message transitions from streaming to history, switch props dynamically — `smooth-streaming="auto"`, `fade=false` for streaming; `smooth-streaming=false`, `fade=true` for history. See `docs/guide/ai-chat-streaming.md` for full examples.
- Treat CSS order as a first-class part of installation, not a later cleanup.
- When the request includes SSR, explicitly gate browser-only peers behind client-only boundaries.
- Do not widen HTML or Mermaid security defaults unless the user explicitly needs trusted legacy compatibility.
- If compatibility requires it, scope the opt-out to the trusted surface with `htmlPolicy` / `html-policy="trusted"` and `mermaidProps.isStrict = false` instead of changing app-wide defaults blindly.

## Useful Doc Targets

- `docs/guide/installation.md`
- `docs/guide/usage.md`
- `docs/guide/troubleshooting.md`
- `docs/guide/component-overrides.md`
