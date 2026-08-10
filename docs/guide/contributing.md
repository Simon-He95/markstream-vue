---
title: Contributing
description: Development commands and contribution guidance for the markstream-vue monorepo, including testing, linting, and building the library.
keywords:
  - contribute markstream
  - development commands
  - build test lint
  - monorepo contribution
---
# Contributing

Thanks for wanting to contribute!

Development commands to know:

- `pnpm dev` — start the library playground
- `pnpm play` — start the playground (same as dev)
- `pnpm build` — build the library
- `pnpm build:analyze` — build with bundle visualizer reports
- `pnpm size:check` — enforce package size budgets
- `pnpm test` — run unit tests
- `pnpm docs:dev` — start the VitePress docs server

Size budget env overrides (optional):

- `MAX_DIST_BYTES`
- `MAX_JS_CHUNK_BYTES`
- `MAX_PACK_TGZ_BYTES`
- `MAX_PACK_UNPACKED_BYTES`

How to add a docs page:

1. Add a markdown file under `docs/` or `docs/guide`.
2. Update `docs/.vitepress/config.ts` sidebar if needed.
3. Run `pnpm docs:dev` to preview the page locally and ensure everything builds.
4. Open a PR with your changes.

Guidelines:

- Keep docs concise and example-driven
- If adding code snippets to docs, verify they run in `playground` or tests
- Add tests for any new features in `test/` and update `README` / docs accordingly

Quick try — run the docs site locally and add a simple page to verify the flow:

```bash
pnpm docs:dev
# open http://localhost:5173, add docs/guide/new-page.md and confirm build
```
