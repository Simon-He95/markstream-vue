---
name: markstream-svelte
description: Integrate markstream-svelte in Svelte 5 apps. Svelte 4 unsupported.
---

# Markstream Svelte

- Confirm Svelte 5; ask Svelte 4 users to upgrade.
- Add package and only requested peers.
- Import CSS after resets; KaTeX CSS for math.
- Default to `<MarkdownRender {content} />`.
  - For streaming AI chat, keep `content` and use built-in smooth streaming first.
    - `smoothStreaming="auto"` is the default and activates when `typewriter={true}` or `maxLiveNodes <= 0`.
    - `typewriter` only controls the blinking cursor and defaults to `false`.
    - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
  - **Streaming vs recovering history**: in chat UIs the same renderer starts streaming and later switches to history when `final={true}`.
    - Streaming: `smoothStreaming="auto"`, `fade={false}`, `typewriter={true}`. Smooth pacing handles gradual appearance; fade would flicker.
    - Recovering history: `smoothStreaming={false}`, `fade={true}`, `typewriter={false}`. Content is already complete — pacing would slow it down, but fade gives a polished entry animation.
    - Dynamic switch: `smoothStreaming={isStreaming ? 'auto' : false}`, `fade={!isStreaming}`.
  - Use `nodes` + `final` for worker-preparsed content, shared AST stores, or custom AST control.
- Use `$props()` and callbacks.
- Workers: `setKaTeXWorker`, `setMermaidWorker`, `workers/*?worker`.
- Custom UI: scoped `setCustomComponents`, `customId`, `customHtmlTags`.
- Verify with `svelte-check`, build, or e2e.
