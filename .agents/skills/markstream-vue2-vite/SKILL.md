---
name: markstream-vue2-vite
description: Integrate markstream-vue2 into a Vue 2 plus Vite app. Use when Codex needs Vite-friendly worker imports, `?worker` or `?worker&inline` setup for Mermaid or KaTeX, modern CSS ordering, or Vue 2 compatibility in a Vite-based repository.
---

# Markstream Vue 2 Vite

Use this skill when the host app is Vue 2 and the bundler is Vite.

## Workflow

1. Confirm the repo is Vue 2 with Vite-based tooling.
2. Install `markstream-vue2` plus only the requested optional peers.
3. Import `markstream-vue2/index.css` after resets.
4. Use Vite worker imports when the repo needs bundled workers.
   - `markstream-vue2/workers/... ?worker` or `?worker&inline` patterns are allowed here.
5. Keep Composition API decisions explicit for Vue 2.6 repos.
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
6. Validate with the smallest useful Vite dev or build command.

## Default Decisions

- Prefer bundled workers over CDN workers in Vite-based Vue 2 repos.
- Keep UnoCSS or Tailwind resets before Markstream CSS.
- Use the generic `markstream-vue2` skill only when the bundler-specific choice does not matter.
- Keep `html-policy="safe"` and Mermaid strict mode unless the task is preserving trusted legacy rendering.
- If a trusted surface needs older behavior, use `html-policy="trusted"` and `:mermaid-props="{ isStrict: false }"` only on that surface and explain why.

## Useful Doc Targets

- `docs/guide/vue2-quick-start.md`
- `docs/guide/vue2-installation.md`
- `docs/guide/tailwind.md`
- `docs/guide/troubleshooting.md`
