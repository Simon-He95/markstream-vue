# Solid port verification

Last run: 2026-09-10.

| Check | Result |
| --- | --- |
| `pnpm --filter markstream-solid typecheck` | passed |
| `pnpm exec eslint packages/markstream-solid/src packages/markstream-solid/test packages/markstream-solid/scripts` | passed |
| `pnpm --filter markstream-solid test` | passed, 50 tests |
| `pnpm --filter markstream-solid build` | passed; ESM, declarations, CSS and Worker subpaths emitted |
| `pnpm --filter markstream-solid test:ssr` | passed; Node resolves the SSR condition and renders Markdown HTML |
| `pnpm --filter markstream-solid-playground build` | passed; ESM KaTeX and Mermaid parser worker artifacts emitted |
| `pnpm --filter markstream-solid-playground hydration:generate` | passed; generated SSR markup and Solid hydration bootstrap artifacts |
| `npx agent-browser --args "--no-sandbox"` against `http://127.0.0.1:5174/` | passed; page loaded, **Append token** appended `· next token`; HTML Preview produced an iframe with the source; Collapse added `is-collapsed` and hid code content; CodeBlock font control changed 12px to 13px; real Mermaid, D2 and Infographic rendered SVG output, KaTeX rendered `.katex`; injected Vite `katexRenderer.worker` and `mermaidParser.worker` resources completed; real stream-diffs retained its shell, constrained scroll position and native `Solid` selection through **Append code line**; Mermaid and Infographic Source showed their source, and their Collapse controls hid both source and SVG/render regions; no enhanced-block fallback was shown |
| CSS namespace browser check via `npx agent-browser --args "--no-sandbox"` | passed; `.markstream-solid` resolved its theme variables and baseline font, Solid enhanced blocks resolved as `display: block`, and streamed Solid text resolved `white-space: pre-wrap` |
| Packed consumer at `/tmp/markstream-solid-current-consumer` | passed; installed the freshly packed `markstream-solid-2.0.11.tgz` and built with Vite using the public default export and `index.css`; optional peer fallbacks were bundled as expected |
| `pnpm lint` | passed |
| `pnpm typecheck` | passed |
| `pnpm exec vitest run` | passed; 355 files and 3144 tests. jsdom emitted its pre-existing Canvas `getContext` notice, while the command exited 0. Solid tests are excluded from the root Vue Vite config and run through their package's own Solid/Vitest configuration |

The tests cover parsing, DOM rendering, empty `nodes` mode, safe HTML, pre mode,
append-only DOM ownership, insertion/reorder slots, nested custom tags, type
replacement, custom component registration, language routing, batching, i18n,
rich-block helpers, render-window limits, stale Mermaid/KaTeX/D2 completion,
and Infographic reuse/unmount cleanup. Mermaid coverage verifies an injected
worker's incomplete-source prefix is used during streaming; KaTeX coverage
verifies an injected worker is preferred over the main-thread renderer.
The Mermaid/D2/Infographic regressions cover source-mode, collapsed fallback visibility, controls, gated Mermaid bindFunctions, D2 dark theme override options, and D2/Infographic progressive-stream coalescing.

The local playground streaming flow was verified in Chromium via `npx agent-browser`.

The hydration fixture renders the same `HydrationApp` on server and client. Its
generated page includes `generateHydrationScript()`; without that Solid bootstrap,
`hydrate()` leaves the server DOM inert.

The native-print regression intentionally receives a 30-second per-test timeout:
it mounts and verifies 260 nodes, and passed in 14 seconds in this environment.
