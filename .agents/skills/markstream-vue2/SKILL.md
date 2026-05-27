---
name: markstream-vue2
description: Integrate markstream-vue2 into a Vue 2.6 or 2.7 app. Use when Codex needs Vue 2-compatible setup, `@vue/composition-api` decisions, CSS wiring, optional peer setup, or scoped Markstream overrides in a Vue 2 repository that is not specifically Vue CLI / Webpack 4 constrained.
---

# Markstream Vue 2

Use this skill when the host app is Vue 2 and not specifically a Vue CLI / Webpack 4 edge case.

## Workflow

1. Confirm the repo is Vue 2.6 or 2.7.
2. Install `markstream-vue2`.
   - Add `@vue/composition-api` only when the repo is Vue 2.6 and uses Composition API patterns.
3. Import `markstream-vue2/index.css` after resets.
4. Start with `<MarkdownRender :content="markdown" />`.
   - For AI chat or streaming UIs, keep `content` and use built-in smooth streaming first.
     - `smooth-streaming="auto"` is the default and activates when `typewriter=true` or `max-live-nodes <= 0`.
     - `typewriter` only controls the blinking cursor and defaults to `false`.
     - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
   - **Streaming vs recovering history**: in chat UIs the same `MarkdownRender` starts streaming and later switches to history when `final=true`.
     - Streaming: `smooth-streaming="auto"`, `:fade="false"`, `typewriter=true`. Smooth pacing handles gradual appearance; fade would flicker.
     - Recovering history: `:smooth-streaming="false"`, `:fade="true"`, `typewriter=false`. Content is already complete — pacing would slow it down, but fade gives a polished entry animation.
     - Dynamic switch: `:smooth-streaming="isStreaming ? 'auto' : false"`, `:fade="!isStreaming"`.
   - Move to `nodes` + `final` only for worker-preparsed content, shared AST stores, or custom AST control.
   - Remember that `html-policy` now defaults to `safe`, and Mermaid strict mode is on by default through `mermaid-props`.
5. Use scoped custom component mappings when the task needs overrides or trusted tags.
6. Validate with the smallest useful dev or build command.

## Default Decisions

- Vue 2.7 can use built-in Composition API support.
- Vue 2.6 needs `@vue/composition-api` only when the codebase actually relies on Composition API.
- If the repo is Vue CLI / Webpack 4, prefer `markstream-vue2-cli`.
- If the repo is Vue 2 plus Vite worker imports, prefer `markstream-vue2-vite`.
- Keep `html-policy="safe"` and Mermaid strict mode unless the task is preserving trusted legacy rendering.
- If a trusted surface needs older behavior, use `html-policy="trusted"` and `:mermaid-props="{ isStrict: false }"` only on that surface and explain why.

## Useful Doc Targets

- `docs/guide/vue2-quick-start.md`
- `docs/guide/vue2-installation.md`
- `docs/guide/vue2-components.md`
- `docs/guide/troubleshooting.md`
