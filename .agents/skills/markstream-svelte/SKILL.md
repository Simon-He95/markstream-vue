---
name: markstream-svelte
description: Integrate the beta markstream-svelte package in Svelte 5 or SvelteKit apps. Use when Codex needs Svelte 5 runes, CSS and optional peers, smooth streaming, worker setup, renderer-local or scoped custom components, or SSR-safe boundaries. Svelte 4 is unsupported.
---

# Markstream Svelte

- Confirm Svelte 5; ask Svelte 4 users to upgrade.
- Add package and only requested peers.
- Import CSS after resets; KaTeX CSS for math.
- Treat the package as beta and confirm the app accepts that API maturity.
- Default to `<MarkdownRender {content} />`.
  - For streaming AI chat, keep `content` and use built-in smooth streaming first.
    - `smoothStreaming="auto"` is the default and activates when `typewriter={true}` or `maxLiveNodes <= 0`.
    - `typewriter` only controls the blinking cursor and defaults to `false`.
    - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
  - **Streaming vs recovering history**: in chat UIs the same renderer starts streaming and later switches to history when `final={true}`.
    - Streaming: `smoothStreaming="auto"`, `fade={false}`, `typewriter={true}`. This is a conservative visual/performance choice, not an API incompatibility. This adapter has not adopted Vue 3's bounded append fades, so verify its animation behavior before enabling both.
    - Recovering history: `smoothStreaming={false}`, `fade={true}`, `typewriter={false}`. Content is already complete — pacing would slow it down, but fade gives a polished entry animation.
    - Dynamic switch: `smoothStreaming={isStreaming ? 'auto' : false}`, `fade={!isStreaming}`.
  - Use `nodes` + `final` for worker-preparsed content, shared AST stores, or custom AST control.
- Use `$props()` and callbacks.
- Workers: `setKaTeXWorker`, `setMermaidWorker`, `workers/*?worker`.
- Custom UI: prefer the renderer-local `customComponents` prop for one surface; use scoped `setCustomComponents`, `customId`, and `customHtmlTags` when shared registration is intentional.
- Keep browser-only workers and heavy peers behind SvelteKit client boundaries.
- Verify with `svelte-check`, build, or e2e.

## Useful Doc Targets

- `docs/guide/svelte.md`
- `docs/frameworks/svelte.md`
