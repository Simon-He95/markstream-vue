# Webpack 4 Compatibility Setup

This project demonstrates how to configure `markstream-vue2` to work with Vue CLI (which uses Webpack 4 by default).

## The Problem

Many modern npm packages (like `@antv/infographic`, `measury`, `mermaid`) use the `package.json` `exports` field to define subpath exports. However, **Webpack 4 does not support the `exports` field**, which was introduced in Webpack 5. Additionally, pnpm uses symlinks for dependency management, which can cause additional resolution issues in Webpack 4.

## Solution

This playground includes a working `vue.config.js` and app entry that address the most common Webpack 4 issues:

1) Subpath imports like `markstream-vue2/index.css` fail because Webpack 4 ignores `exports`.
2) Worker imports like `?worker` are Vite-specific and won’t work in Vue CLI (Webpack 4).
3) Some peers (e.g. `mermaid`) have `exports` and no `main` entry; Webpack 4 can’t resolve them.

### `vue.config.js` (resolver + aliases)

The `vue.config.js` file contains the necessary configuration to work around these Webpack 4 limitations. Key differences from the older “hardcoded .pnpm path” approach:

- Use `require.resolve()` to resolve the *real* file paths at install time (no version pinning in aliases).
- Use the resolved package entry to locate `markstream-vue2/dist/*` files.
- Force a single Vue runtime instance via `alias: { 'vue$': ... }` to avoid Composition API runtime warnings caused by duplicated Vue copies in workspace setups.

```js
const path = require('node:path')

module.exports = {
  transpileDependencies: [
    'markstream-vue2',
    'stream-markdown-parser',
    '@antv/infographic',
    'measury',
    'mermaid'
  ],
  configureWebpack: {
    resolve: {
      // Add pnpm store paths to module resolution
      modules: [
        'node_modules',
        path.resolve(__dirname, '../node_modules')
      ],
      alias: {
        // Webpack 4 doesn't support package.json exports field.
        // Prefer `require.resolve()` based aliases (see the repo's vue.config.js).
      },
      symlinks: false
    }
  },
  chainWebpack: (config) => {
    // Disable eslint to avoid linting dist files
    config.module.rules.delete('eslint')
  }
}
```

### App entry: CDN workers + explicit mermaid loader

In `src/main.js`, this playground avoids Webpack 4 worker import limitations by using the built-in CDN worker helpers:

- `createKaTeXWorkerFromCDN()` + `setKaTeXWorker()`
- `createMermaidWorkerFromCDN()` + `setMermaidWorker()`

Also, this playground loads Mermaid via a global CDN build (see `public/index.html`) to avoid pulling Mermaid's modern ESM dependency graph into a Webpack 4 bundle.

## Key Points

1. **`transpileDependencies`**: Add packages that use ES2020+ syntax (like `??`, optional chaining) so Babel can transpile them for older browsers.

2. **`resolve.modules`**: Add the parent `node_modules` directory to the module search path since pnpm stores packages differently.

3. **`resolve.alias`**: Manually map subpath exports to their actual file locations since Webpack 4 can't resolve them through `package.json` exports.

4. **`resolve.symlinks: false`**: This helps Webpack resolve pnpm's symlink structure correctly.

5. **Optional features**: On Webpack 4, some optional integrations can pull in `exports`-heavy or modern syntax graphs (e.g. AntV Infographic). This playground keeps the core renderer usable by ignoring those modules in `vue.config.js` via `IgnorePlugin`.

## Recommended Approach

For production projects using Vue CLI, consider **upgrading to Webpack 5** or using **Vite** instead, as they have better support for modern npm package features. You can:

1. Upgrade to Vue CLI 5+ (which uses Webpack 5)
2. Migrate to Vite (which has native ESM support and better package resolution)

## Alternative: Use Webpack 5 Plugin

If you need to stay on Webpack 4, you can use the `exports-field` plugin to add support for the `package.json` exports field:

```bash
npm install --save-dev webpack-exports-field
```

Then add to your `vue.config.js`:

```js
const ExportsFieldPlugin = require('webpack-exports-field')

module.exports = {
  configureWebpack: {
    plugins: [
      new ExportsFieldPlugin()
    ]
  }
}
```

Note: This plugin may not cover all cases, so manual aliases may still be needed.
