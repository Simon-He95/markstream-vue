---
name: markstream-react
description: Integrate markstream-react into a React 18+ or Next app. Use when Codex needs to add the React renderer, import CSS correctly, choose between `content` and `nodes`, keep Next client boundaries safe, convert renderer overrides, or prepare a repo for `react-markdown` migration.
---

# Markstream React

Use this skill when the host app is React or Next and the task is to wire Markstream safely.

## Workflow

1. Confirm the repo is React, Next, or another React-based host.
2. Install `markstream-react` plus only the requested optional peers.
3. Import `markstream-react/index.css` from the app shell or client entry.
4. Start with `content`.
   - For streaming or high-frequency AI output, keep `content` and use built-in smooth streaming first.
     - `smoothStreaming="auto"` is the default and activates when `typewriter={true}` or `maxLiveNodes <= 0`.
     - `typewriter` only controls the blinking cursor and defaults to `false`.
     - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
   - **Streaming vs recovering history**: in chat UIs the same renderer starts streaming and later switches to history when `final={true}`.
     - Streaming: `smoothStreaming="auto"`, `fade={false}`, `typewriter={true}`. Smooth pacing handles gradual appearance; fade would flicker.
     - Recovering history: `smoothStreaming={false}`, `fade={true}`, `typewriter={false}`. Content is already complete — pacing would slow it down, but fade gives a polished entry animation.
     - Dynamic switch: `smoothStreaming={isStreaming ? 'auto' : false}`, `fade={!isStreaming}`.
   - Move to `nodes` + `final` only for worker-preparsed content, shared AST stores, or custom AST control.
   - Remember that `htmlPolicy` now defaults to `safe`, and Mermaid strict mode is on by default through `mermaidProps`.
5. Respect SSR boundaries in Next.
   - Prefer `use client`, dynamic imports with `ssr: false`, or other client-only boundaries when browser-only peers are involved.
6. Use scoped Markstream overrides before custom parser work.
7. Validate with the smallest useful dev, build, or typecheck command.

## Default Decisions

- Renderer wiring first, migration cleanup second.
- If the repo already uses `react-markdown`, pair this skill with `markstream-migration`.
- Prefer `content` with built-in smooth streaming for most AI chat / token streaming surfaces.
- Streaming vs recovering history: when a chat message transitions from streaming to history (e.g. `final` becomes `true`), switch props dynamically — `smoothStreaming="auto"`, `fade={false}` for streaming; `smoothStreaming={false}`, `fade={true}` for history. See `docs/guide/ai-chat-streaming.md` for full examples.
- Move to `nodes` only when another layer owns parsing or AST transforms.
- Prefer the smallest client-only boundary that solves the SSR issue.
- Avoid `smoothStreaming={true}` for first-screen SSR content unless intentionally starting from blank; auto mode uses the mounted gate.
- Keep `htmlPolicy="safe"` and Mermaid strict mode unless the request is preserving trusted legacy rendering.
- If a trusted surface needs older behavior, use `htmlPolicy="trusted"` and `mermaidProps={{ isStrict: false }}` only on that surface and explain why.

## Useful Doc Targets

- `docs/guide/react-quick-start.md`
- `docs/guide/react-installation.md`
- `docs/guide/react-markdown-migration.md`
- `docs/guide/component-overrides.md`
