# markstream-solid capability and export classification

Current product truth for the Solid renderer. Process files (`GOAL.md`, `handoff.md`, `plans/`, PORTING notes) are historical unless they match this table.

## Public exports

| Export | Class | Notes |
| --- | --- | --- |
| `MarkdownRender` / `NodeRenderer` / default | supported | Content and `nodes` rendering, smooth streaming, batching |
| Node components (`CodeBlockNode`, `MermaidBlockNode`, …) | supported | Same names as Svelte |
| `SolidCodeBlockNode` | alias | Same function as `CodeBlockNode` |
| `useSmoothMarkdownStream` | supported | Solid accessors over `markstream-core` |
| `SMOOTH_STREAMING_CONTEXT` | supported | Nested auto-smooth suppression |
| `setCustomComponents` and registry helpers | supported | Global `setCustomComponents(map)`, scoped `setCustomComponents(id, map)` / `removeCustomComponents(id)`. Renderer `customComponents` overrides the registry |
| Optional loaders (`setKatexLoader`, `disableMermaid`, …) | supported | Peers may be absent |
| Worker clients / CDN helpers / worker entries | supported | Subpath exports |
| `sanitizeHtmlContent`, `renderMarkdownToHtml`, `enhanceRenderedHtml` | supported | Shared HTML/SVG safety path |
| `renderWindow` helpers (`computeLiveRange`, …) | tool-only | Exported; **not** wired into `NodeRenderer` |
| `buildRenderContext`, `resolveParsedNodes` | internal | Useful for tests and advanced hosts |
| `debugPerformance` | supported | Parse-only `console.info('[markstream-solid][perf] parse(sync)', { ms, nodes, contentLength })` |

## Renderer behavior

| Behavior | Status | Verified by |
| --- | --- | --- |
| `stream ?? context.codeBlockStream ?? true` | implemented | `packages/markstream-solid/test/stream-and-smooth.test.tsx` |
| That flag gates editor create/update (stream-diffs `stream` option stays `false`, matching Svelte) | implemented | `test/code-block-runtime.test.tsx` |
| Nested `smoothStreaming="auto"` does not double-smooth; explicit `true` still opts in | implemented | `test/stream-and-smooth.test.tsx` |
| Live theme / line-numbers / artifact click without remount | implemented | `test/code-block-runtime.test.tsx` |
| `showTooltips` default true (link, code toolbar, HTML enhance); `false` disables singleton tooltips; `codeBlockProps.showTooltips` overrides | implemented | `test/renderer.test.tsx` |
| Scoped `setCustomComponents(id)` / `removeCustomComponents`; local `customComponents` wins | implemented | `test/renderer.test.tsx` |
| Code-block / D2 toolbar labels follow `setDefaultI18nMap` | implemented | `test/renderer.test.tsx` |
| SSR `renderToString` + `hydrate` on the same DOM | implemented | `scripts/e2e-solid-hydration.mjs` (`pnpm test:e2e:solid-hydration`) |
| Packed consumer with optional peers present and absent | implemented | `pnpm test:smoke:solid` / `test:smoke:solid:optional` |
| Browser diagrams SVG, code shadow text, append identity | implemented | `pnpm test:e2e:solid-playground` |
| `debugPerformance` parse log | implemented | `test/stream-and-smooth.test.tsx` |
| Virtualization | known limit | Main renderer has no virtualization window. `render-window` helpers may still be exported as a tool |
| `smoothStreamingOptions` hot-swap | known limit | Read when the renderer instance is created |

## Re-run

```sh
pnpm check:solid
pnpm test:smoke:solid
pnpm test:smoke:solid:optional
pnpm play:solid:build
pnpm test:e2e:solid-playground
pnpm test:e2e:solid-hydration
```

The Ubuntu CI workflow is wired to run the same scripts after parser/core build. Confirm the GitHub Actions job actually executed on the PR head before treating CI as proof. macOS/Windows CI does not claim Solid coverage.

## Out-of-scope diffs on this branch (keep / split)

| File | Decision | Reason |
| --- | --- | --- |
| `vite.config.ts` Solid test exclude | keep | Solid JSX must compile with `vite-plugin-solid`, not the root Vue Vitest config |
| `pnpm-workspace.yaml`, lockfile, `play:solid*` | keep | Workspace membership for the new package/playground |
| `playground-shared/testLabFixtures.ts` Solid card | keep | Shared Test Lab catalog includes Solid |
| `.gitignore` hydration-dist / e2e screenshots | keep | Generated artifacts |
| `eslint.config.mjs` `dist` ignore | keep | Built playground/package output is not linted |
| `test/solid-playground-live-preview-config.test.ts` | keep | Guards Solid live-preview origin |
| `test/playground-native-print.test.ts` 30s timeout | keep | Vue playground 260-node print exceeds the 10s default; not Solid behavior, but required for this branch’s root Vitest job. Split only if a reviewer wants a dedicated Vue PR |
| Untracked `HANDOFF-PLAYGROUND-BUGS.md`, `diagnostics/` | keep local | Do not `git add` without authorization. `diagnostics/**` is ESLint-ignored so local evidence does not fail `pnpm lint` |

Do not delete process files or rewrite git history without recorded destination and user authorization.
