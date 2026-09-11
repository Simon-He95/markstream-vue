# Cross-framework sync points (Solid)

Solid copied several pure-logic and worker paths from Svelte during the port. This is the checklist for later shared-behavior fixes. It is not a request to extract a shared renderer engine.

| Area | Solid files | Upstream / siblings | Verification |
| --- | --- | --- | --- |
| HTML sanitize | `src/sanitizeHtmlContent.ts`, `src/sanitizeSvg.ts` | `packages/markstream-svelte/src/sanitizeHtmlContent.ts`, Vue/React equivalents | `pnpm --filter markstream-solid test` (script-stripping renderer test); `pnpm test` root HTML tests for Vue |
| HTML enhancement | `src/enhanceRenderedHtml.ts` | Svelte `enhanceRenderedHtml.ts` | Solid renderer tests for cancelled KaTeX writes; browser e2e for diagrams |
| Worker protocol | `src/workers/katexWorkerClient.ts`, `mermaidWorkerClient.ts`, renderer/CDN workers | Svelte/Vue worker clients | `pnpm --filter markstream-solid test` worker tests; `pnpm test:e2e:solid-playground` |
| Optional loaders | `src/optional-katex.ts`, `optional-mermaid.ts`, `optional-streamDiffs.ts`, `d2.ts`, `infographic.ts` | Svelte `src/optional/*` | Packed smoke without peers; in-process disable tests; browser SVG when peers exist |
| Language / code-block options | `src/languageIcon.ts`, `src/types/codeBlock.ts` | Svelte language + code-block types | Code-block runtime tests |
| Smooth stream core | `src/composables/useSmoothMarkdownStream.ts` | `packages/markstream-core` | Solid owner-cleanup test; playground controller demo |

When changing sanitize, worker message shapes, or optional-peer fallback policy, run at least:

```sh
pnpm --filter markstream-solid test
pnpm --filter markstream-svelte test
pnpm --filter markstream-vue test
pnpm test:smoke:solid
pnpm test:smoke:solid:optional
```

Solid lifecycle and JSX stay in this package. Do not treat unique CSS namespace (`.markstream-solid`) as a merge-back target.
