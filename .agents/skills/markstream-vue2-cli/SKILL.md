---
name: markstream-vue2-cli
description: Integrate markstream-vue2 into a Vue 2 Vue CLI or Webpack 4 app. Use when Codex needs Webpack 4-friendly setup, CDN worker fallbacks for Mermaid or KaTeX, `dist/index.css` imports, Vue 2 composition-api shims, or safer code block defaults that avoid fragile Monaco worker setups.
---

# Markstream Vue 2 CLI

Use this skill when the host app is Vue 2 on Vue CLI or another Webpack 4-style stack.

## Workflow

1. Confirm the repo uses Vue 2 plus Vue CLI or Webpack 4-era tooling.
2. Install `markstream-vue2` and only the peers required for the requested features.
3. Import `markstream-vue2/dist/index.css` in the app shell.
4. Avoid Vite-style `?worker` imports.
   - Use `createKaTeXWorkerFromCDN(...)` and `createMermaidWorkerFromCDN(...)` when workers are needed.
5. Prefer stable code block defaults over brittle Monaco wiring.
   - `MarkdownCodeBlockNode` plus `stream-markdown` is safer than Monaco in Webpack 4-era repos.
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
6. Validate with the smallest useful local dev or build command.

## Default Decisions

- Treat Monaco and worker-heavy setups as opt-in and fragile on Webpack 4.
- Prefer CDN workers over bundler workers for Mermaid and KaTeX.
- Keep the Vue 2 composition-api shim explicit when the repo is on Vue 2.6.
- Keep `html-policy="safe"` and Mermaid strict mode unless the task is preserving trusted legacy rendering.
- If a trusted surface needs older behavior, use `html-policy="trusted"` and `:mermaid-props="{ isStrict: false }"` only on that surface and explain why.

## Useful Doc Targets

- `docs/guide/vue2-quick-start.md`
- `docs/guide/vue2-installation.md`
- `docs/guide/troubleshooting.md`
