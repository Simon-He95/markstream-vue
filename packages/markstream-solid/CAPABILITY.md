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
| `setCustomComponents` and registry helpers | supported | Global and `customId` scoped maps |
| Optional loaders (`setKatexLoader`, `disableMermaid`, …) | supported | Peers may be absent |
| Worker clients / CDN helpers / worker entries | supported | Subpath exports |
| `sanitizeHtmlContent`, `renderMarkdownToHtml`, `enhanceRenderedHtml` | supported | Shared HTML/SVG safety path |
| `renderWindow` helpers (`computeLiveRange`, …) | tool-only | Exported; **not** wired into `NodeRenderer` |
| `buildRenderContext`, `resolveParsedNodes`, node-outlet helpers | internal | Useful for tests and advanced hosts |
| `resetCodeBlockRuntimeReadyForTest` | test hook | Keep for compatibility; not a product API |
| `viewportPriority`, `deferNodesUntilVisible`, `liveNodeBuffer`, `debugPerformance` | documented-not-wired | Accepted and ignored; Svelte main renderer also does not virtualize |

## Renderer behavior

| Behavior | Status | Verified by |
| --- | --- | --- |
| `stream ?? context.codeBlockStream ?? true` | implemented | `packages/markstream-solid/test/stream-and-smooth.test.tsx` |
| That flag gates editor create/update (stream-diffs `stream` option stays `false`, matching Svelte) | implemented | `test/code-block-runtime.test.tsx` |
| Nested `smoothStreaming="auto"` does not double-smooth; explicit `true` still opts in | implemented | `test/stream-and-smooth.test.tsx` |
| Live theme / line-numbers / artifact click without remount | implemented | `test/code-block-runtime.test.tsx` |
| SSR `renderToString` + `hydrate` on the same DOM | implemented | `scripts/e2e-solid-hydration.mjs` (`pnpm test:e2e:solid-hydration`); package `test:ssr` for hydratable `renderToString` |
| Packed consumer with optional peers present and absent | implemented | `pnpm test:smoke:solid` / `test:smoke:solid:optional` |
| Browser diagrams SVG, code shadow text, append identity | implemented | `pnpm test:e2e:solid-playground` |
| Virtualization (`viewportPriority` / `liveNodeBuffer`) | known limit | Compatibility no-op; `render-window` is a tool export only |
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

Ubuntu CI runs the same scripts after parser/core build. macOS/Windows CI does not claim Solid coverage.

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
