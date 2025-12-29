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
