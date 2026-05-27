---
description: Migration notes for moving from beta or rc releases to markstream-vue 1.0.
---

# Migrating to 1.0

`markstream-vue@1.0` stabilizes the Vue 3 renderer package. Release `markstream-vue`, `markstream-core`, and `stream-markdown-parser` together at `1.0.0`.

## Stable in 1.x

- `MarkdownRender`, `VueRendererMarkdown`, and `useSmoothMarkdownStream`.
- Raw `content` rendering and pre-parsed `nodes` rendering.
- Safe HTML rendering with `htmlPolicy="safe"` by default.
- Optional Mermaid, KaTeX, D2, Infographic, and Monaco integrations.
- CSS exports, Tailwind safelist export, worker client exports, SSR imports, and app-scoped custom components.

## Before upgrading

1. Replace any dependency pins for the rc packages with the final Vue package:

```bash
pnpm add markstream-vue@1.0.0
```

Only pin `markstream-core` or `stream-markdown-parser` directly if your app imports their APIs.

2. Import one published CSS file:

```ts
import 'markstream-vue/index.css'
```

3. Prefer app-scoped custom components for SSR or multi-tenant apps:

```ts
app.use(VueRendererMarkdown, {
  components: {
    thinking: ThinkingNode,
  },
})
```

4. Keep cross-framework packages, low-level worker implementation files, repository skills/prompts, and height-estimation experiments out of your 1.x compatibility assumptions.

## Breaking or intentional changes from beta/rc

- The npm package publishes `dist` only and no longer exposes a CLI `bin`.
- Low-level CDN/worker implementation files are importable only for bundler compatibility; documented worker client exports are the stable surface.
- Safe HTML and URL protocol allowlists are stricter by default.
- Mermaid SVG is sanitized before mounting, and Mermaid interactions are disabled unless explicitly enabled for trusted diagrams.
- `VueRendererMarkdown({ components })` is the preferred custom component registration path. Global `setCustomComponents()` remains supported.

## Release validation

Run the 1.0 publish dry run before publishing:

```bash
pnpm run release:dry-run:1.0
```

Attach the `1.0 Benchmark` workflow artifact, or a generated local benchmark report with its environment disclosure, to the release notes.
