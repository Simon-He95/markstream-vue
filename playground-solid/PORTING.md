# Solid playground mapping

Baseline: React 18 playground at `playground-react18/` (HEAD `1f51247e` plus auto-scroll fix `f808226c`). React 19 reuses those shared modules; only branding differs. This file is the mapping contract for `playground-solid/`.

## React → Solid

| React | Solid |
| --- | --- |
| `useState` | `createSignal` / store. Read `props.x` and accessors on each use; never snapshot dynamic props in setup. |
| `useMemo` | `createMemo` or a pure function. Do not create Workers, editors, or subscriptions inside memos. |
| `useCallback` | Plain functions in the owner scope. Not preserved mechanically. |
| `useEffect` | `createEffect` for reactive work; `onMount` for one-shot DOM; `onCleanup` on the real owner. **Do not** `return` a teardown from `onMount` — Solid ignores it. |
| `useRef` | DOM: `let el` / `ref={el => { … }}` / `createSignal<HTMLElement>()`. Mutable handles: `let` in owner scope. |
| `memo` / `startTransition` | Not product features. Routing uses `popstate` + a path signal. |
| Lists | `For` for keyed identity; `Index` only for static index slots. Append must not rebuild the whole tree. |
| Event handlers | Read latest signals/options inside the handler. Do not close over old `source` or settings. |

## Resource ownership

| Resource | Create | Update | Cancel / destroy |
| --- | --- | --- | --- |
| Stream scheduler timeout | `useStreamSimulator` `scheduleNext` via `trackedTimeout` | Next chunk only; mid-stream setting changes update `optionsRef` and do not kill the current run | `stop` / `reset` / owner `onCleanup` |
| ReadableStream + reader + AbortController | `startReadableStream` | Pause via `shouldPause`; new options apply to later chunks | `abort()` on stop/reset/unmount; old `onChunk` must not write a newer run |
| Auto-scroll rAF | `createChatAutoScroll.scheduleScrollToBottom` | Content key and ResizeObserver | `detach` / owner `onCleanup` |
| ResizeObserver | attach on the messages container and `.chatbot-renderer-shell` | Height growth while sticky | `disconnect` on detach |
| KaTeX / Mermaid Workers | App owner in `src/workers.ts` (`ensurePlaygroundWorkers`) | Shared for the page lifetime | Never terminate from a child unmount; process teardown only |
| Custom component registration | `setCustomComponents(PLAYGROUND_CUSTOM_ID, …)` in App owner | Isolated per `customId` | `removeCustomComponents` on App `onCleanup` |
| stream-diffs editor runtime | `preloadCodeBlockRuntime` from the app owner (skipped on `/line-number-handoff-check`) | CodeBlockNode reuses the instance on ordinary append | CodeBlockNode owner cleanup; app does not disable peers on demo leave |
| Smooth stream controller | `useSmoothMarkdownStream` inside the demo that owns it | Accessors `source` / `visible` / `pendingChars` / `caughtUp` / `final` | `onCleanup` → `unsubscribe` + `controller.destroy()` |
| Hydration fixture | `hydration:generate` renders `HydrationApp` with `renderToString` + `generateHydrationScript` | Client `hydrate` on the same component | No leftover server timers; post-hydrate append uses client signals |

## Stream semantics

- Pause is not completion. `stop`, `reset`, replacing input, and leaving the page each cancel the old transport/reader/timer.
- Transport names `sse` / `websocket` / `proxy-buffered` are cadence presets. Transport implementations are `scheduler` and `readable-stream` only.
- External `useSmoothMarkdownStream` demos pass `smoothStreaming={false}` (and turn off typewriter/fade) so the renderer does not double-smooth.
- `render-window` is not wired in the Solid renderer. UI copy says **批量渲染**, never 虚拟列表.

## CSS / package

- Root chrome class: `.markstream-solid` (Tailwind `important`).
- `NodeRenderer` also emits `.markstream-solid`.
- Dev Vite aliases `markstream-solid` to package source. Production build uses public package/CSS/Worker subpaths.

## React 19

No extra product surface. Shared Test Lab, simulator, auto-scroll, line-number page, and migration layout come from React 18. `startTransition` / `memo` / StrictMode are React-only and are not ported.
