# Repository Guidelines

## Project Structure & Module Organization
- `src/` is the Vue 3 library source.
  - `src/components/*/` contains SFC components (PascalCase folders, `*.vue` files) and `index.ts` barrel exports.
  - `src/utils/`, `src/types/`, `src/composables/` contain shared helpers, types, and composables.
  - Library entry points and styles are exported via `src/exports.ts` and `src/index.css`.
- `test/` contains Vitest specs (e.g. `test/index.test.ts`, `test/plugins/*.test.ts`).
- `playground/` and `playground-nuxt/` are local demo apps for manual testing.
- `docs/` is the VitePress documentation site.
- `scripts/` contains maintenance utilities (DTS build, peer-deps checks, doc sync scripts).

## Build, Test, and Development Commands
Use `pnpm` (see `package.json#packageManager`). Key commands:
- `pnpm dev` / `pnpm play`: run the Vite playground.
- `pnpm build`: build the library bundles and generate `.d.ts`.
- `pnpm test` / `pnpm test:ui`: run tests (CLI/UI).
- `pnpm typecheck`: run `vue-tsc --noEmit`.
- `pnpm lint` / `pnpm lint:fix`: ESLint checks/fixes.
- `pnpm docs:dev` / `pnpm docs:build`: run/build VitePress.

## Coding Style & Naming Conventions
- TypeScript-first, Vue 3 SFCs.
- Indentation: 2 spaces, LF endings (see `.editorconfig`).
- Components: `PascalCase` folder + file names (e.g. `src/components/CodeBlockNode/CodeBlockNode.vue`).
- Helpers: `camelCase` functions; follow existing file naming in `src/utils/`.
- Linting uses `@antfu/eslint-config` via `eslint.config.mjs`.

## Testing Guidelines
- Framework: Vitest (`pnpm test`).
- Prefer small, focused unit tests for parsers/components; name files `*.test.ts` under `test/`.
- Update snapshots with `pnpm test:update`.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (e.g. `feat:`, `fix:`, `docs:`, `chore:`).
- Link issues using GitHub keywords when applicable (e.g. `close: #123`).
- PRs should include: clear description/rationale, linked issues, and screenshots/GIFs for UI-visible changes.
- Before requesting review: run `pnpm lint`, `pnpm typecheck`, and `pnpm test`, then sanity-check the playground.

## Security & Configuration Tips
- Keep `peerDependencies` accurate; large integrations (e.g. `mermaid`, `katex`) are peers and may be optional.
- Verify local peer installs with `pnpm run check:peer-deps`.
