---
title: Legacy Builds & iOS Compatibility
description: How to ship markstream-vue legacy builds for older browsers and iOS Safari, covering Vite plugin-legacy, Webpack dual builds, polyfills, and RegExp engine limits that polyfills cannot fix.
keywords:
  - legacy builds markstream
  - iOS Safari compatibility
  - Vite plugin-legacy
  - Webpack polyfills
---
# Legacy build & compatibility guide (Vite / Webpack)

Purpose
- This document explains how to use legacy builds to improve compatibility with older browsers (for example older iOS / Safari) and when you should instead fix issues in source code.

Key reminder
- Some problems (notably RegExp engine-level syntax like lookbehind `(?<!...)`) cannot be fixed by polyfills. Legacy builds transform syntax and inject API polyfills but cannot add RegExp engine features to an older JS runtime. If you encounter such issues, you must either rewrite the code or delay construction/runtime-detect and fallback. See `ios-regex-compat.md` for details.

What this page covers
- Vite: `@vitejs/plugin-legacy` usage and caveats
- Webpack: common two-build (modern + legacy) approaches
- Managing polyfills (`core-js`, `regenerator-runtime`) and targets
- Testing, CI and quick debug checklist

Vite (recommended if your project uses Vite)

Install:

```bash
pnpm add -D @vitejs/plugin-legacy
```

Example `vite.config.ts`:

```ts
import legacy from '@vitejs/plugin-legacy'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'iOS >= 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      renderLegacyChunks: true,
    })
  ]
})
```

Notes
- `targets` controls which transforms/polyfills are applied. Set to your minimum supported browsers.
- `additionalLegacyPolyfills` injects runtime libraries into the legacy bundle.
- `renderLegacyChunks` enables differential chunks served via `type="module"` / `nomodule`.
- Important: plugin-legacy cannot rewrite engine-level RegExp syntax (lookbehind). Keep incompatible regex out of literal module scope or rewrite them.

Webpack

Webpack does not provide a single plugin equivalent to Vite's plugin-legacy. Common approach: build two bundles with Babel (modern + legacy) and serve them with `type="module"` / `nomodule`.

Key deps:

```bash
pnpm add -D @babel/core babel-loader @babel/preset-env core-js regenerator-runtime webpack webpack-cli
```

Example approach
- Create a `babel.config.js` that supports `BABEL_ENV=legacy` to enable `useBuiltIns: 'usage'` and a legacy `targets` set. Run two webpack builds: one modern, one legacy. Serve modern bundle with `<script type="module">` and legacy with `<script nomodule>`.

Polyfills
- Use `core-js` for standard API polyfills (v3). For generators/async: `regenerator-runtime/runtime`.
- Prefer differential serving so modern bundles stay small.

RegExp and engine-level syntax
- RegExp features such as lookbehind are implemented by the JS engine. Polyfills cannot add them. Either
  - rewrite the regex to a compatible form, or
  - delay regex construction (use `new RegExp(...)`) and use runtime feature-detection + fallback.

Testing & CI
- Add `pnpm run build` (modern + legacy) in CI and run smoke tests on older browsers (BrowserStack / SauceLabs or Xcode simulator).
- Add a static check to block new lookbehind/unicode-regex features (see examples below).

Quick local checks

```bash
# Static scan for advanced regex in source
pnpm dlx rg "\\(\\?<!|\\(\\?<=|\\\\p\\{" --glob "**/*.{js,ts,vue,jsx,tsx,mjs,cjs}" -n
```

Summary
- Legacy builds are useful for many syntax & API gaps, but they are not a replacement for fixing engine-level RegExp syntax in source. Prefer: source fix -> legacy bundle -> CI + old-device smoke tests.

Quick test — run a local legacy build (Vite + plugin-legacy):

```bash
pnpm build
# verify modern + legacy bundles output and test on an older device or simulator
```
