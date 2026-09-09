---
name: markstream-migration
description: Audit and migrate existing Markdown rendering to Markstream, or upgrade a markstream-vue 1.x integration to 2.x. Use when Codex needs to replace another renderer, classify direct vs custom vs plugin-heavy adoption, preserve behavior during adoption, migrate custom renderers into scoped Markstream overrides, decide when `nodes` streaming is worth adopting, or replace removed 1.x code-block dependencies, APIs, preview payloads, and parser types.
---

# Markstream Migration

Use this skill when a repo already renders Markdown and the task is either to adopt Markstream safely or to upgrade an existing `markstream-vue` 1.x integration to 2.x.

## Choose The Migration Route

Inspect `package.json`, the lockfile, imports, and renderer props before changing code.

- If the repo already depends on `markstream-vue` 1.x, read [references/vue-1x-to-2x.md](references/vue-1x-to-2x.md) and follow **Route B**. Confirm the package dependency instead of routing only from shared names such as `MarkdownCodeBlockNode` or `InternalParseOptions`, which can also appear in other adapters.
- Otherwise, when replacing `react-markdown`, `markdown-it`, `marked`, or another renderer with a Markstream package, read [references/adoption-checklist.md](references/adoption-checklist.md) and follow **Route A**.
- If both apply, complete the 1.x to 2.x package and API upgrade first, then audit the separate renderer replacement as an adoption task.

## Route A: Adopt Markstream From Another Renderer

1. Audit the repo's current renderer usage.
   - Search for markdown renderers, plugin chains, raw HTML handling, security props, and custom renderers.
   - List every call site that will be touched.
2. Classify the migration.
   - `direct`: simple string-in renderer swap.
   - `renderer-custom`: custom renderers but limited parser work.
   - `plugin-heavy`: remark, rehype, markdown-it, or other transform-heavy pipelines.
   - `security-heavy`: allow or deny lists, URL rewriting, sanitization, or raw HTML policies.
3. Swap the renderer first.
    - Introduce the correct Markstream package and CSS.
    - Import Markstream CSS through the package CSS subpath; do not rely on the renderer import to inject styles.
    - Preserve user-visible behavior before adding richer Markstream-only features.
    - Audit whether the old renderer allowed broad raw HTML or Mermaid loose-mode HTML labels before claiming parity.
4. Migrate custom renderers.
   - Convert built-in node renderers into scoped node-type overrides.
   - In React, prefer renderer-local `streamingComponents` for parser-backed tags and `htmlComponents` for sanitized HTML-prop components; use `setCustomComponents` for built-in node overrides or shared compatibility registration.
   - In Svelte or Angular, prefer the renderer-local `customComponents` input when the mapping does not need shared registration.
   - For trusted tag-like content, prefer `customHtmlTags`.
   - Use `parseOptions.preTransformTokens`, `postTransformTokens`, or `postTransformNodes` only when the old pipeline truly requires token or AST transforms.
5. Review gaps honestly.
   - Do not claim 1:1 parity where none exists.
   - Call out parser, plugin, security, or HTML behavior that still needs manual review.
6. Consider renderer mode and smooth streaming before jumping to `nodes`.
   - For Vue 3, choose `mode="chat"` for AI/SSE output, `mode="docs"` for rich document surfaces, and `mode="minimal"` for lightweight non-chat surfaces.
   - If the app streams `content` and only needs pacing, `smooth-streaming="auto"` (the default) handles it without requiring `nodes`.
   - Move to `nodes` only when the app needs custom AST control, worker preparsing, or high-frequency structural updates.
   - In Vue 3 (including Nuxt), `smooth-streaming` controls output pacing and `fade` controls opacity; they can be enabled together. `mode="chat"` keeps `fade=false` as a lightweight default. Add `fade` when gradual text reveal is desired; keep it off when animation cost matters more. Do not carry a legacy `:fade="!isStreaming"` binding into a Vue 3 migration unless the host wants that policy.
   - **Streaming vs recovering history**: when migrating a chat UI, keep `mode="chat"` on the same chat row and switch pacing/animation props instead. Vue 3 streaming: `mode="chat"`, `final`, and optional `fade`. Vue 3 completed chat history: keep `mode="chat"`, use `:smooth-streaming="false"` when pacing is unnecessary, and choose fade independently. Use `mode="docs"` only for separate rich document surfaces.
7. Validate and summarize.
   - Run the smallest relevant tests or build.
   - Report direct mappings, TODOs, and remaining verification work.

## Route B: Upgrade markstream-vue 1.x To 2.x

1. Freeze the current integration surface.
   - Record the installed `markstream-vue` version and package-manager resolution.
   - Find old code-block dependencies, renderer values, props, public types, runtime helpers, preview handlers, and direct parser imports.
   - Identify the smallest build, typecheck, SSR, and code-block checks that prove the current behavior.
2. Choose one release line.
   - Use the coordinated beta family only after it is published and `next` resolves to that generation, or `markstream-vue@2` after stable release.
   - Check registry versions and dist-tags before editing the manifest; repository version bumps do not prove that a package is installable.
   - Install only the adapter used by the application. Add parser or core directly only when the application imports it directly.
   - Keep packages on the same prerelease generation; do not mix unrelated beta versions.
3. Apply only the required dependency and API changes from [references/vue-1x-to-2x.md](references/vue-1x-to-2x.md).
   - Remove both former code-block runtimes. Rename supported `monacoOptions` / `codeBlockMonacoOptions` fields to the shared `codeBlockOptions` contract and delete unsupported Monaco-only fields.
   - Add `stream-diffs` only when enhanced code or diff blocks are required; otherwise use the plain fallback.
   - Preserve the existing Markdown, diagram, math, HTML-policy, worker, CSS, streaming, and virtualization setup unless a documented 2.x break requires a change.
4. Validate the migrated behavior and leave a rollback path.
   - Check package resolution, public types, preview payload consumers, normal and diff fences, themes, responsive diff layout, and SSR or packed installs where relevant.
   - Report the exact 1.x version or legacy dist-tag that restores the previous line.

## Default Decisions

- Renderer swap first, streaming optimization second.
- Do not treat an existing Markstream version upgrade as a renderer-adoption rewrite.
- For 1.x to 2.x, preserve application behavior outside the documented code-block and parser changes.
- Keep a coordinated beta family on one prerelease generation and make rollback explicit before changing dependencies.
- Smooth streaming is an intermediate option between "just content" and "full nodes migration": it paces visible output without requiring AST control.
- Preserve safety over feature parity when HTML or security rules are involved.
- Prefer explicit TODOs over vague claims.
- Prefer renderer-local component maps where the target framework exposes them.
- Recommend against migration when the current stack depends heavily on transforms that Markstream does not mirror directly.
- When preserving trusted legacy behavior is necessary, use scoped `htmlPolicy` / `html-policy="trusted"` and `mermaidProps.isStrict = false` instead of weakening defaults everywhere.

## Useful Doc Targets

- `docs/guide/migration-2-0.md`
- `docs/guide/react-markdown-migration.md`
- `docs/guide/react-markdown-migration-cookbook.md`
- `docs/guide/ai-chat-streaming.md`
- `docs/guide/installation.md`
- `docs/guide/component-overrides.md`
- `docs/guide/advanced.md`
