---
description: Define the markstream-vue 1.0 stable scope, API tiers, package validation, security commitments, and release checklist.
---

# 1.0 Release Readiness

`markstream-vue@1.0` means the Vue 3 package is safe to put in production and that 1.x will keep stable API, behavior, security defaults, and package exports unless a major version changes them.

## Stable in 1.0

- `MarkdownRender` for Vue 3.
- Raw `content` rendering and pre-parsed `nodes` rendering.
- Streaming mid-state rendering with `final`, `typewriter`, `smoothStreaming`, and `useSmoothMarkdownStream`.
- Safe HTML rendering with `htmlPolicy="safe"` as the default.
- Optional Mermaid, KaTeX, D2, Infographic, and Monaco integrations.
- SSR import and render-to-string support for Vue / Vite / Nuxt / VitePress.
- Published CSS exports: `index.css`, `index.tailwind.css`, and `index.px.css`.
- Documented worker client exports:
  - `markstream-vue/workers/katexWorkerClient`
  - `markstream-vue/workers/mermaidWorkerClient`
- `markstream-vue/tailwind` default and named safelist exports.

## Experimental or internal

- Cross-framework packages and playgrounds: Vue 2, React, Angular, Svelte, Next.
- Repository CLI helpers, skills/prompts, and bundled agent assets.
- CDN worker helper subpaths: `markstream-vue/workers/katexCdnWorker` and `markstream-vue/workers/mermaidCdnWorker`.
- Low-level worker implementation files such as `markstream-vue/workers/katexRenderer.worker` and `markstream-vue/workers/mermaidParser.worker`. These are exported for bundler compatibility only and are not part of the 1.x compatibility promise.
- Height-estimation experiment APIs.
- Internal renderer props: `indexKey`, `renderAsFragment`, `debugPerformance`, `initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`, `renderBatchBudgetMs`, `renderBatchIdleTimeoutMs`, and `viewportPriority`.

These may still exist in the repository, but they are not part of the 1.x compatibility promise unless promoted in the API docs.

## Published package surface

The 1.0 npm package publishes `dist` only. It must not include a `bin` field or leak `bin/`, `.agents/`, or `prompts/` into the tarball. CLI helpers for skills and prompts remain repository/internal tooling or future separate-package work.

## Stable public API

```ts
import MarkdownRender, {
  clearGlobalCustomComponents,
  CodeBlockNode,
  D2BlockNode,
  disableD2,
  disableKatex,
  disableMermaid,
  enableD2,
  enableKatex,
  enableMermaid,
  getCustomNodeComponents,
  InfographicBlockNode,
  isD2Enabled,
  isKatexEnabled,
  isMermaidEnabled,
  MarkdownCodeBlockNode,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  PreCodeNode,
  removeCustomComponents,
  setCustomComponents,
  setD2Loader,
  setDefaultI18nMap,
  setDefaultMathOptions,
  setKatexLoader,
  setMermaidLoader,
  useSmoothMarkdownStream,
  VueRendererMarkdown,
} from 'markstream-vue'
```

`VueRendererMarkdown` accepts app-scoped `components`, which is preferred for SSR:

```ts
app.use(VueRendererMarkdown, {
  components: {
    thinking: ThinkingNode,
  },
})
```

The legacy/global `setCustomComponents()` API remains supported, but SSR and multi-tenant apps should prefer app-scoped registration.

Root exports are tiered for 1.x compatibility:

| Export | 1.x status |
| --- | --- |
| `MarkdownRender`, `VueRendererMarkdown`, `useSmoothMarkdownStream` | Stable renderer API. |
| `CustomComponents`, `MarkstreamVuePluginOptions`, `NodeRendererProps`, component prop types | Stable TypeScript surface. |
| `setCustomComponents`, `removeCustomComponents`, `clearGlobalCustomComponents` | Stable legacy/global custom component registry. Prefer app-scoped `components` for SSR and multi-tenant apps. |
| `getCustomNodeComponents` | Legacy registry inspection only. It reads global/customId mappings and does not include app-scoped `components`, because those are provided through Vue injection. |
| `enableKatex` / `disableKatex` / `isKatexEnabled` / `setKatexLoader`, `enableMermaid` / `disableMermaid` / `isMermaidEnabled` / `setMermaidLoader`, `enableD2` / `disableD2` / `isD2Enabled` / `setD2Loader` | Stable optional integration controls. |
| `setDefaultI18nMap`, `setDefaultMathOptions` | Stable customization hooks. |
| Individual node components such as `CodeBlockNode`, `PreCodeNode`, `MarkdownCodeBlockNode`, `MermaidBlockNode`, `MathBlockNode`, `MathInlineNode`, `D2BlockNode`, and `InfographicBlockNode` | Stable override surface for custom renderers when used with documented props. |
| Parser utilities re-exported from `stream-markdown-parser` and documented markdown plugin utilities | Stable as documented, subject to the parser/core version policy below. |
| Low-level utility exports under `markstream-vue/utils/*` | Advanced utility surface; only documented utilities are covered by the 1.x compatibility promise. |

## Parser and core version policy

The Vue renderer exposes parser node types, parse options, and smooth-streaming behavior through its public API. For 1.0, release the three packages together:

```txt
markstream-vue@1.0.0
markstream-core@1.0.0
stream-markdown-parser@1.0.0
```

If the parser or core package stays below 1.0, `markstream-vue` must pin the exact compatible released versions and absorb breaking parser/core changes behind its own exported types before publishing a 1.x Vue release.

## Required package smoke

Run the unified release gate before publishing:

```bash
pnpm run release:gate:1.0
```

That command builds the parser and core packages, then runs lint, typecheck, the full Vitest suite, strict public API checks, packed-package validation, VitePress docs build, package size budget check, and the 1.0 benchmark report.

Run the full publish-chain dry run before the final publish:

```bash
pnpm run release:dry-run:1.0
```

That repeats the release gate, then dry-runs publishing the parser, core, and Vue packages in order.

For package-only validation, run:

```bash
pnpm release:verify
```

That command builds the parser and core packages, then runs lint, typecheck, the full Vitest suite, strict public API checks, and packed-package validation:

```bash
pnpm test:smoke:pack
pnpm test:smoke:pack:optional
```

The smoke packs the workspace packages, installs the tarball into a fresh Vite app, verifies root imports, CSS exports, Tailwind safelist export, stable worker client subpaths, experimental worker subpaths remain importable, SSR import/render, app-scoped custom components, and optional-peer absence. The optional variant installs Mermaid, KaTeX, D2, Infographic, Monaco, `stream-markdown`, and `vue-i18n`.

## Security release gate

Before 1.0, the security tests must cover:

- `javascript:` / encoded JavaScript URL attempts in links and HTML attrs.
- Unsafe image sources including SVG/data HTML/protocol-relative URLs.
- Event attributes such as `onerror` and inline style script URLs.
- Hard-blocked tags such as `script`, `style`, `form`, `iframe`, `object`, and `template`.
- Streaming mid-states for partially received HTML and links.
- Legacy fence renderer escaping for language labels, DOM ids, and translated copy labels.

Use `htmlPolicy="trusted"` only for content that is fully controlled by the application.

## Performance release gate

The 1.0 public benchmark covers the shipped playground scenarios:

- Diagnostic Studio baseline, thinking, diff, and stress samples in MarkdownCodeBlock and Monaco modes using `/test?benchmark=1`.
- Main playground reverse-flex chat initial load, full-scroll pass, and streaming replay using `/?benchmark=1`.

Track LCP, CLS, settle time, frame sample count, frame p95 `requestAnimationFrame` interval, full-scroll heavy-settle frame p95, max long task, page DOM node count, renderer DOM node count, visible fallback count, heavy-block readiness, scroll drift, and best-effort Chrome-only heap after renderer unmount plus GC. Frame p95 is report evidence for 1.0; the hard release gate stays on fallback counts, heavy-block readiness, DOM budget, CLS, long tasks, and settle time.

Extended synthetic scenarios such as 1 MB documents, 1000 code blocks, 100 Mermaid blocks, and 10k pre-parsed nodes are planned for 1.0.x. Do not use them as 1.0 release evidence until they are implemented in `pnpm benchmark:1.0`.

Generate the public report with:

```bash
pnpm benchmark:1.0
```

The report writes `benchmark/*.json`, `benchmark/*.md`, and `benchmark/latest-summary.md` with environment disclosure. The nightly/manual `1.0 Benchmark` GitHub Actions workflow uploads the same files as artifacts.

## Release operator checklist

Use this checklist during the final 1.0 publish and release-notes pass. Unchecked items are release-day confirmations, not a live 1.0 readiness status.

- [x] Stable and experimental public API documented.
- [x] Parser/core release strategy decided.
- [x] Legacy fence renderer escaping covered by tests.
- [x] Safe HTML docs and XSS regression tests complete.
- [x] App-scoped custom component registry covered by SSR test.
- [ ] `pnpm run release:dry-run:1.0` passes.
- [ ] Current playground benchmark report or the latest workflow artifact is attached to the release notes.
- [x] CSS, Tailwind, and worker subpath exports smoke-tested.
- [ ] Unit, SSR, public API, and package export checks are green.
- [ ] Nuxt SSR smoke or preview deployment is green.
- [ ] VitePress docs build is green.
- [x] Migration notes and changelog describe beta-to-1.0 breaking changes.
