---
name: markstream-angular
description: Integrate markstream-angular into an Angular app. Use when Codex needs standalone component imports, signal-based examples, CSS wiring, custom HTML tags or customComponents setup, or optional peer integration in an Angular repository.
---

# Markstream Angular

Use this skill when the host app is Angular and the task is to adopt the Angular package cleanly.

## Workflow

1. Confirm the repo is Angular.
2. Install `markstream-angular` plus only the requested optional peers.
3. Import `markstream-angular/index.css` from the app shell.
   - Add `katex/dist/katex.min.css` when math is enabled.
4. Prefer standalone Angular integration.
   - Use `MarkstreamAngularComponent` in `imports` and keep examples signal-friendly.
5. Start with `[content]`.
   - For streaming AI chat, keep `[content]` and use built-in smooth streaming first.
     - `[smoothStreaming]="'auto'"` is the default and activates when `[typewriter]="true"` or `[maxLiveNodes]="0"`.
     - `[typewriter]` only controls the blinking cursor and defaults to `false`.
     - `[fade]` controls node enter and streamed-text fade animations and defaults to `true`.
   - **Streaming vs recovering history**: in chat UIs the same component starts streaming and later switches to history when `[final]="true"`.
     - Streaming: `[smoothStreaming]="'auto'"`, `[fade]="false"`, `[typewriter]="true"`. Smooth pacing handles gradual appearance; fade would flicker.
     - Recovering history: `[smoothStreaming]="false"`, `[fade]="true"`, `[typewriter]="false"`. Content is already complete — pacing would slow it down, but fade gives a polished entry animation.
     - Dynamic switch: `[smoothStreaming]="isStreaming ? 'auto' : false"`, `[fade]="!isStreaming"`.
   - Use `[final]` for end-of-stream state; final parsing is gated until visible content catches up when smooth streaming is active.
   - Move to `nodes` + `final` only for worker-preparsed content, shared AST stores, or custom AST control.
   - Remember that `[htmlPolicy]` now defaults to `'safe'`, and Mermaid strict mode is on by default through `[mermaidProps]`.
6. Use `[customHtmlTags]` and `[customComponents]` for trusted tag workflows.
7. Validate with the smallest useful Angular dev or build command.

## Default Decisions

- Standalone Angular first, NgModule-era patterns only when the repo still depends on them.
- Treat the cursor as opt-in (`typewriter=false` by default), but keep fade animations enabled by default (`fade=true`).
- Keep optional peers minimal and explicit.
- Keep `[htmlPolicy]="'safe'"` and Mermaid strict mode unless the task is preserving trusted legacy rendering.
- If a trusted surface needs broader old behavior, opt out locally with `[htmlPolicy]="'trusted'"` and `[mermaidProps]="{ isStrict: false }"`, and document that trust boundary.

## Useful Doc Targets

- `docs/guide/angular-quick-start.md`
- `docs/guide/angular-installation.md`
- `docs/guide/playground.md`
- `docs/guide/troubleshooting.md`
