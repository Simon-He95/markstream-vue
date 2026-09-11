# playground-solid verification (this run)

Date: 2026-09-10. Git baseline `1f51247e`. This file is the playground-migration evidence. Do **not** copy historical rows from `packages/markstream-solid/VERIFICATION.md` (those playground build/browser/hydration claims are unreproducible: this commit had no `playground-solid/` source).

Scratch evidence: `/tmp/grok-goal-7a02a97d93cf/implementer/`.

## This-run re-verification (2026-09-10T18:49–18:56+02:00)

After the HomePage demo-chip / idle-append fixes. First `typecheck`/`build` failed on a jsdom `Worker` stub cast in `test/renderer-demos.test.tsx` (`onmessageerror`); the stub now casts via `unknown`. Re-run:

| Command | Exit | Log | Notes |
| --- | --- | --- | --- |
| `pnpm --filter markstream-solid-playground typecheck` | **0** | `{SCRATCH}/playground-solid-unit.log` | 2026-09-10T18:51:27+02:00 |
| `pnpm --filter markstream-solid-playground test` | **0** | `{SCRATCH}/playground-solid-unit.log` | 7 files, **20 tests** (includes HomePage `data-demo-chip` + `data-append-code` identity; `start()` latest source) |
| `pnpm --filter markstream-solid-playground build` | **0** | `{SCRATCH}/playground-solid-unit.log` | `tsc --noEmit && vite build`; production `dist/` |
| `pnpm --filter markstream-solid-playground hydration:generate` | **0** | `{SCRATCH}/playground-solid-checks.log` | `hydration-dist/index.html` 1344 bytes; `_$HY`, `Server rendered Solid`, `data-hk` all true |
| `pnpm lint` | **0** | `{SCRATCH}/root-regression.log` | 2026-09-10T18:50:32+02:00; plus `eslint playground-solid/test/renderer-demos.test.tsx` after the Worker stub |
| `pnpm typecheck` | **0** | `{SCRATCH}/root-regression.log` | `vue-tsc --noEmit` |
| `pnpm exec vitest run` | **0** | `{SCRATCH}/root-regression.log` | **356 files, 3146 tests**, Vitest 4.1.10, 130.42s |

`{SCRATCH}` = `/tmp/grok-goal-7a02a97d93cf/implementer`.

## Earlier this-run commands (same session, still valid)

| Command | Exit | Notes |
| --- | --- | --- |
| `pnpm --filter markstream-solid typecheck` | 0 | |
| `pnpm --filter markstream-solid test` | 0 | 51 tests (includes new unmount listener regression) |
| `pnpm --filter markstream-solid build` | 0 | ESM, SSR, CSS, Worker subpaths |
| `pnpm --filter markstream-solid test:ssr` | 0 | `markstream-solid SSR smoke test passed` |
| `pnpm play:solid` launch 1 | ready | `http://127.0.0.1:4177/` — `/`, `/test`, `/line-number-handoff-check`, `/migration-demo` 200 |
| `pnpm play:solid` launch 2 | ready | same bodies/modules |
| `pnpm play:solid:preview` | ready | production HTML + bundle contains Test Lab / Start / React-only / `useSmoothMarkdownStream` / 批量渲染 |
| Playwright Chromium (`playwright-core` 1.63.0, `channel: chrome`) | 0 | home filled, Start grew chat text 102→193 chars; `/test` 858 chars; screenshot `playground-solid-home.png` |
| tarball consumers | 0 | packed `markstream-solid`, `markstream-core`, `stream-markdown-parser` locally; with peers and without optional peers both `renderToString` Markdown |
| `pnpm play:react18:build` / `play:react19:build` | 0 | after `pnpm --filter markstream-react build` (this worktree had no `markstream-react` dist) |

Other logs: `solid-package-checks.log`, `play-solid-launch-1.log`, `play-solid-launch-2.log`, `play-solid-preview.log`, `tarball-consumer.log`.

## Pages / demos

All GOAL-PLAYGROUND.md source pages, buttons, settings, samples, and Solid demos are **已验证** in `PORTING_STATUS.md`. Framework-only notes: no `memo`/`startTransition`; `render-window` is not virtualization; SSE/WebSocket names are cadence presets.

## Package fix in this run

`NodeRenderer` subscribed to custom components by `return`ing unsubscribe from `onMount` (Solid ignores that). Now `onCleanup(subscribeCustomComponents(...))`. Regression: `does not keep custom-component listeners after the renderer unmounts`.

## Production consumption

- Dev aliases `markstream-solid` to package source.
- Production `playground-solid/dist` has no `packages/markstream-solid/src` strings. CSS is `.markstream-solid`. Workers are imported from public `markstream-solid/workers/*?worker&inline` and bundled.

## Hydration

`hydration-dist/index.html` includes Solid `generateHydrationScript()` (`window._$HY`), server markup for `HydrationApp` (`data-hydration-root`, heading `Server rendered Solid`, `data-hk` node identity), and a client `hydrate()` entry. Generate uses the package **SSR** export so source `iframe sandbox` is not evaluated on the server.

## Tarball

`solid-consumer-with-peers` and `solid-consumer-no-peers` under the scratch dir. No registry versions of unpublished workspace packages; no historical `/tmp/markstream-solid-current-consumer` path.
