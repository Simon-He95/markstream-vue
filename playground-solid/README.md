# markstream-solid playground

Solid port of the React 18 playground. Package name: `markstream-solid-playground`.

## Start / build / preview

From the repo root:

```sh
pnpm play:solid
pnpm play:solid:build
pnpm play:solid:preview
```

Or inside this directory:

```sh
pnpm dev          # http://127.0.0.1:4177
pnpm build
pnpm preview
pnpm typecheck
pnpm test
pnpm hydration:generate
```

Dev uses source aliases into `packages/markstream-solid`. Production build consumes the public package, CSS, and Worker subpaths.

## Pages

| Path | What it is |
| --- | --- |
| `/` | Chat demo, stream controls, one-click Solid samples, observation panel |
| `/test` | Test Lab: samples, paste, stream, fullscreen, theme, hash share, preview mode |
| `/line-number-handoff-check` | Static pre vs enhanced code-block line numbers (not an async-handoff proof) |
| `/migration-demo` | Typecheckable Solid usage. react-markdown cases are labeled React-only |

## Home demos

1. **默认混合流** — Start / Pause / Resume / Stop / Reset.
2. **平滑输出 / 追平** — `smoothStreaming` + typewriter + fade. Transport complete is not the same as display catch-up.
3. **Solid controller** — `useSmoothMarkdownStream` enqueue / pause / resume / finish / flush / reset. The page reads `source()` / `visible()` / `pendingChars()` / `caughtUp()` / `final()`. Renderer duplicate smoothing is off.
4. **代码块实例保留** — Append a line; the code-block DOM shell should stay. Diff / language rebuilds are separate.
5. **隔离自定义组件** — Two renderers + ThinkingNode. Unmount the right pane; the left mapping stays.
6. **图表与公式** — Mermaid, D2, Infographic, inline/block KaTeX. Workers are owned by the app, not by a child demo.
7. **批量渲染** — Completed-state batch render of the stress sample. This is not a virtual list.

SSE / WebSocket / proxy-buffered names are cadence presets. Actual transports are `scheduler` and `readable-stream`.

## CSS

Root chrome uses `.markstream-solid`. Tailwind `important` is `.markstream-solid`. The renderer also emits that class.

## Observation panel

Tracked app-private resources: simulator timeouts, auto-scroll rAF, resize observers. Those counts are reactive.

Uncovered (shown as `uncovered`, never `0` “no leak”): subscriptions, Workers, stream-diffs editor runtimes. DOM shell identity is not an editor-create count.

| Control | Meaning |
| --- | --- |
| Pause | Transport paused. Not complete. |
| Resume | Continue transport. |
| Stop | Playground jumps renderer input to the full source. Labeled stop-reveal, not renderer catch-up. |
| Reset | Drops transported text and stop-reveal. |
| Natural complete | Transport caught up with the source. Distinct from internal smooth catch-up. |
| Smooth demo | Renderer input is still transport-side. Use the controller demo for `visible()` / `caughtUp()`. |

## Re-run checks

From the repo root:

```sh
pnpm --filter markstream-solid-playground typecheck
pnpm --filter markstream-solid-playground test
pnpm play:solid:build
pnpm test:e2e:solid-playground
pnpm test:e2e:solid-hydration
```

Packed missing-peer consumption is `pnpm test:smoke:solid` (optional peers absent) and `pnpm test:smoke:solid:optional`. Do not treat in-process `disable*()` tests as a missing-peer proof.

## Historical claims

Process files (`VERIFICATION.md`, `PORTING_STATUS.md`, root `GOAL*.md`, `handoff.md`) are not current product truth. Capability and limits: [`packages/markstream-solid/CAPABILITY.md`](../packages/markstream-solid/CAPABILITY.md).
