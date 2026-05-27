# Contributing to markstream-vue

Thanks for helping improve the project! This guide keeps contributions fast and consistent.

## Quick start

1) Fork and clone the repo.
2) Install deps with `pnpm install` (repo uses `pnpm@10.x`).
3) Run the playground while you work: `pnpm dev` (or `pnpm play` for the alias).
4) Make changes under `src/` (library), `packages/` (parser), or `playground/` (demo).

## Checks to run

- `pnpm lint` — ESLint (Vue + TS).
- `pnpm typecheck` — vue-tsc.
- `pnpm test` — Vitest suite; use `pnpm test:update` to refresh snapshots.
- `pnpm build` — library + CSS build (ensures workers/CSS are emitted).

## Pull requests

- Follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
- Add/extend tests for parser changes or rendering behaviors when possible.
- Include screenshots/GIFs for UI-visible changes (playground/demo).
- Note any prop/API changes in the PR description; update README or docs if needed.
- Be kind and follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Issues

- Use the provided issue templates for bugs/feature requests.
- For rendering bugs, the interactive test page helps generate a shareable repro: https://markstream-vue.simonhe.me/test

## Code style

- Vue 3 + TypeScript-first, 2-space indent, LF endings (see `.editorconfig`).
- Components in `src/components` use PascalCase directories/files; utils are camel/kebab as existing.

## Releases & tags (monorepo)

This repository publishes multiple packages (`markstream-vue`, `markstream-vue2`, `markstream-react`, `markstream-angular`, `markstream-svelte`, `markstream-core`, `stream-markdown-parser`). To keep tags unambiguous, we use **namespaced tags**:

- `markstream-vue@<version>`
- `markstream-vue2@<version>`
- `markstream-react@<version>`
- `markstream-angular@<version>`
- `markstream-svelte@<version>`
- `markstream-core@<version>`
- `stream-markdown-parser@<version>`

Framework package releases now run an automated check that blocks publish when the required `markstream-core` version is not on npm yet. If it fails, release `markstream-core` first.

Avoid creating bare `v<version>` tags (they mix different package versions in a monorepo).

### Stable vs Nightly

- **Stable**: tags are semver-based (`<pkg>@<version>`) and should match npm releases.
- **Nightly**: tags are commit snapshots (`<pkg>@nightly-YYYYMMDD-<sha>`) and are published as GitHub **Pre-releases**.

Nightly tags can be **dependency-driven**: when `stream-markdown-parser` changes, nightly tags are also created for `markstream-vue`, `markstream-vue2`, and `markstream-react` so consumers can test the whole stack against the latest parser.

### Common commands

- Tag current version of a package: `pnpm tag:vue3` / `pnpm tag:vue2` / `pnpm tag:react` / `pnpm tag:angular` / `pnpm tag:core` / `pnpm tag:parser`
- Tag + push to remote: `pnpm tag:vue3:push` / `pnpm tag:vue2:push` / `pnpm tag:react:push` / `pnpm tag:angular:push` / `pnpm tag:core:push` / `pnpm tag:parser:push`
- Backfill namespaced tags from existing legacy `v*` tags (dry run): `pnpm tag:backfill:dry`
- Apply backfill locally: `pnpm tag:backfill` (add `-- --push` to also push tags)
