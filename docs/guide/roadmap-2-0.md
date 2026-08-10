---
title: 2.0.0 Roadmap
description: markstream-vue 2.0.0 roadmap and task checklist. Tracks the breaking changes, release validation, runtime verification, and leftover cleanup planned for 2.0.
keywords:
  - markstream 2.0 roadmap
  - breaking changes
  - run-time verification
  - release validation
---

# 2.0.0 Roadmap

`markstream-vue@2.0.0` is a breaking major release. This page is the living roadmap for the 2.0 scope: each goal carries a task checklist, completed items point at their commit/PR, and the same checklist is tracked on GitHub under the `2.0.0` milestone.

## Goal 1: Remove Monaco and stream-markdown, keep only `stream-diffs` ✅

The 2.0 headline breaking change: the Monaco-based code block API and the Shiki-based `stream-markdown` renderer are removed. Code blocks are rendered by `stream-diffs` only (or a plain `<pre>` fallback when the optional peer is absent).

Tracked in [issue #615](https://github.com/Simon-He95/markstream-vue/issues/615). The implementation lives on branch `2.0.0-remove-monaco` and has not been merged into `main` yet; merge it via PR before closing the checklist. In this page, "— `2.0.0-remove-monaco` 分支" marks items completed on that branch.

- [x] Remove `monacoOptions` / `codeBlockMonacoOptions` and all `CodeBlockMonaco*` params/APIs (no replacement; diff options fall back to stream-diffs built-in defaults) — `2.0.0-remove-monaco` 分支
- [x] Delete the `stream-markdown` `MarkdownCodeBlockNode` component and its styles — `2.0.0-remove-monaco` 分支
- [x] Rename `codeRenderer` value `'monaco'` → `'stream-diffs'`; drop the `'shiki'` / `'markdown'` renderer kinds — `2.0.0-remove-monaco` 分支
- [x] Rename public identifiers to drop Monaco naming (`CodeBlockTheme`, `resolveLanguageId`, `getStreamDiffsRuntime`) — `2.0.0-remove-monaco` 分支
- [x] Migrate vue2 / react / svelte / angular / octane to stream-diffs only — `2.0.0-remove-monaco` 分支
- [x] Update tests and snapshots; full suite green (313 files / 2684 tests) — `2.0.0-remove-monaco` 分支
- [x] Clean playgrounds (deps, vite config, sandbox pages) — `2.0.0-remove-monaco` 分支
- [x] Update documentation (en + zh), LLM docs, package descriptions — `2.0.0-remove-monaco` 分支

## Goal 2: 2.0.0 release validation

Get the breaking release through the normal release gates before publishing.

- [ ] Run the full library build (`pnpm build`) and DTS generation
- [ ] `pnpm test:api:strict` (public API snapshot, exports, subpath isolation)
- [ ] Framework smoke tests: react / octane / vue2-cjs / minimal / pack (optional peers)
- [ ] Reconcile `check:peer-deps` for workspace-root optional peers
- [ ] Bump version to 2.0.0 and write release notes

## Goal 3: Runtime visual verification

Verify the stream-diffs handoff in a real browser (the migration so far is verified by unit/type checks only).

- [ ] Playground: code-block height sync, diff theme switching, inline vs side-by-side behavior
- [ ] `test:e2e:octane-playground` green against stream-diffs selectors
- [ ] Svelte diff color mapping on `.is-diff .code-block-body`

## Goal 4: Leftover cleanup (low priority)

Small consistency cleanups that were intentionally left out of Goal 1.

- [ ] Rename internal Monaco-named variables in svelte / react / vue2 packages (e.g. `resolvedMonacoOptions`)
- [ ] Update manual e2e debug scripts that still use old `.stream-monaco-diff-*` selectors (`e2e-diff-theme-switch.mjs`, `e2e-codeblock-diff-line-info-debug.mjs`)
- [ ] Remove the unused `langs` field from react / vue2 code block theme types
- [ ] Known pre-existing typecheck issues (out of 2.0 scope): `markstream-core` rootDir TS6059, `HtmlPreviewFrame.vue` `import.meta.env`

## Related

- GitHub milestone: `2.0.0`
- Roadmap checklist issue: tracked alongside this page on the `2.0.0` milestone
- 1.0 baseline: [1.0 Release Readiness](/guide/release-1-0)
