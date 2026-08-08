---
title: Vue 2 Markdown renderer installation
description: Install markstream-vue2 in Vue 2.6, Vue 2.7, Nuxt 2, Vue CLI, or Webpack 4 projects with Composition API setup, vue-demi notes, optional peers, workers, CSS paths, and legacy Vue2 troubleshooting.
keywords:
  - markstream-vue2 installation
  - Vue 2 Markdown renderer installation
  - Vue 2.6 Composition API Markdown
  - Vue 2.7 Markdown renderer
  - Nuxt 2 Markdown renderer
  - Vue CLI Markdown renderer
  - Webpack 4 Vue2 Markdown
  - vue-demi Vue2 Markdown
  - Vue2 Mermaid Markdown setup
  - Vue2 KaTeX Markdown setup
  - Vue2 code block Markdown setup
  - legacy Vue2 Markdown setup
---

# Vue 2 Installation

Install markstream-vue2 with pnpm, npm or yarn.

```bash
pnpm add markstream-vue2
# or
npm install markstream-vue2
# or
yarn add markstream-vue2
```

## Requirements

markstream-vue2 requires:
- **Vue 2.6.14+** (Vue 2.7 is recommended for better TypeScript support)
- **@vue/composition-api** (if using Vue 2.6.x)

## Composition API compatibility (Vue 2.6 / 2.7 / 3.x)

| Vue version | Composition API availability | What to install | How to import |
|-------------|------------------------------|-----------------|---------------|
| **2.6.x** | Not built-in | `@vue/composition-api` | `import { ref, computed, defineComponent } from '@vue/composition-api'` |
| **2.7.x** | Built-in | None | `import { ref, computed, defineComponent } from 'vue'` |
| **3.x** | Built-in | None | `import { ref, computed, defineComponent } from 'vue'` |

Notes:
- For **Vue 2.6.x**, you must install and **register the plugin** (`Vue.use(@vue/composition-api)`), otherwise you will get runtime errors.
- For **Vue 2.7.x**, **do not** install `@vue/composition-api` — it is already included in Vue 2.7.
- For **Vue 3.x**, use **markstream-vue** (not markstream-vue2).

## Quick start by version (dependencies + entry)

### Vue 2.6.x

Dependencies:

```bash
pnpm add markstream-vue2 vue@2.6.14 vue-template-compiler@2.6.14 @vue/composition-api
```

App entry:

```ts
import VueCompositionAPI from '@vue/composition-api'
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueCompositionAPI)
Vue.use(VueRendererMarkdown)

new Vue({
  render: h => h(MarkdownRender, { props: { content: '# Vue 2.6' } }),
}).$mount('#app')
```

Composition API usage in components:

```ts
import { defineComponent, ref } from '@vue/composition-api'
```

Example in this repo:
- `playground-vue2-cli` (Vue 2.6 + Vue CLI / Webpack 4)

Path and start command:

```bash
pnpm -C playground-vue2-cli dev
```

From repo root you can also run:

```bash
pnpm play:vue2-cli
```

### Vue 2.7.x

Dependencies:

```bash
pnpm add markstream-vue2 vue@2.7.16 vue-template-compiler@2.7.16
```

App entry:

```ts
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueRendererMarkdown)

new Vue({
  render: h => h(MarkdownRender, { props: { content: '# Vue 2.7' } }),
}).$mount('#app')
```

Composition API usage in components:

```ts
import { defineComponent, ref } from 'vue'
```

Example in this repo:
- `playground-vue2` (Vue 2.7 + Vite)

Path and start command:

```bash
pnpm -C playground-vue2 dev
```

From repo root you can also run:

```bash
pnpm play:vue2
```

### Vue 3.x (use markstream-vue)

Dependencies:

```bash
pnpm add markstream-vue vue@^3
```

App entry:

```ts
import MarkdownRender from 'markstream-vue'
import { createApp, h } from 'vue'
import 'markstream-vue/index.css'

createApp({
  render: () => h(MarkdownRender, { content: '# Vue 3' }),
}).mount('#app')
```

If your workspace also installs Vue 3, make sure `vue-demi` targets Vue 2:

```bash
pnpm vue-demi-switch 2
```

If you cannot run `vue-demi-switch` (or want a per-app fix), alias `vue-demi` to the Vue 2 build in your bundler config. This avoids errors like `defineComponent is not a function`:

```js
// vue.config.js / webpack config
module.exports = {
  configureWebpack: {
    resolve: {
      alias: {
        'vue-demi$': 'vue-demi/lib/v2/index.cjs',
      },
    },
  },
}
```

## Optional Peer Dependencies

markstream-vue2 supports various features through optional peer dependencies. Install only what you need:

| Feature | Required Packages | Install Command |
|---------|------------------|-----------------|
| Enhanced code blocks (recommended) | `stream-diffs` | `pnpm add stream-diffs` |
| Mermaid Diagrams | `mermaid` | `pnpm add mermaid` |
| D2 Diagrams | `@terrastruct/d2` | `pnpm add @terrastruct/d2` |
| Math Rendering (KaTeX) | `katex` | `pnpm add katex` |

Enhanced code blocks use the optional `stream-diffs` peer. When it is not installed, a plain `<pre>` is rendered instead. Code and diff options use `stream-diffs` built-in defaults, and theming is controlled through `theme` / `darkTheme` / `lightTheme` / `themes`.

## Vue 2.6.x Setup

If you're using Vue 2.6.x, you need to install and configure `@vue/composition-api`:

```bash
pnpm add @vue/composition-api
```

Then in your app entry:

```ts
import VueCompositionAPI from '@vue/composition-api'
import Vue from 'vue'

Vue.use(VueCompositionAPI)
```

Using Composition API in Vue 2.6 components:

```ts
import { defineComponent, ref } from '@vue/composition-api'
```

## Vue 2.7.x Setup (no plugin required)

Vue 2.7 has Composition API built-in. Do **not** install `@vue/composition-api`.

```ts
import { defineComponent, ref } from 'vue'
```

## Feature loaders (Mermaid / KaTeX / D2)

After installing optional peers, the default loaders are already enabled. Only call these helpers if you disabled them earlier or need a custom loader (for example, a CDN build):

```ts
import { enableD2, enableKatex, enableMermaid } from 'markstream-vue2'

// optional: re-enable or override loaders
enableMermaid()
enableKatex()
enableD2()
```

Also remember required CSS (when the feature is used):

```ts
import 'markstream-vue2/index.css'
import 'katex/dist/katex.min.css'
```

Note: `markstream-vue2/index.css` is scoped under an internal `.markstream-vue2` container to reduce global style conflicts. `MarkdownRender` renders inside that container by default. If you render node components standalone, wrap them with `<div class="markstream-vue2">...</div>`.

## Vue CLI (Webpack 4) Notes

Vue CLI 4 uses **Webpack 4** by default, and Webpack 4 doesn't support `package.json#exports`. That commonly breaks:

- `import 'markstream-vue2/index.css'`
- `import('mermaid')`
- Vite-style worker imports: `?worker` / `?worker&inline`

Recommended setup (see `playground-vue2-cli`):

1) Import CSS via the real file path (no `exports` needed):

```ts
import 'markstream-vue2/dist/index.css'
```

2) For Mermaid, prefer the CDN global build (avoids Webpack 4 `exports` / ESM chains):

```html
<!-- public/index.html -->
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
```

3) For KaTeX / Mermaid workers, prefer CDN workers to avoid Webpack 4 worker limitations:

```ts
import { createKaTeXWorkerFromCDN, createMermaidWorkerFromCDN, setKaTeXWorker, setMermaidWorker } from 'markstream-vue2'

const { worker: katexWorker } = createKaTeXWorkerFromCDN({
  mode: 'classic',
  katexUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.js',
  mhchemUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/contrib/mhchem.min.js',
})
if (katexWorker)
  setKaTeXWorker(katexWorker)

const { worker: mermaidWorker } = createMermaidWorkerFromCDN({
  mode: 'classic',
  mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
})
if (mermaidWorker)
  setMermaidWorker(mermaidWorker)
```

If you want to keep using subpath imports like `markstream-vue2/index.css`, add `resolve.alias` mappings in `vue.config.js` (see `playground-vue2-cli/vue.config.js`).

### Code blocks: prefer the `stream-diffs` override

The enhanced code block runtime (`stream-diffs`) is the only code block renderer in markstream-vue2. It falls back to a plain `<pre>` when the optional peer is not installed. For Webpack 4, `stream-diffs` is the recommended (and only) code block runtime — there is no Monaco fallback.

1) Install the optional peer:

```bash
pnpm add stream-diffs
```

2) (Optional) Override `code_block` with your own component using `setCustomComponents` when you need custom behavior:

```ts
import { setCustomComponents } from 'markstream-vue2'

setCustomComponents({ code_block: MyCodeBlock })
```

3) Webpack config pitfalls:

- If you use `webpack.IgnorePlugin` for optional dependencies, ensure `stream-diffs` is **not** ignored, otherwise code blocks fall back to `<pre>`.
- `stream-diffs` is ESM-only. In a CJS `vue.config.js`, `require.resolve('stream-diffs')` can fail even when installed. Use a filesystem fallback (check `node_modules/stream-diffs`) and alias it to `dist/index.js`. See `playground-vue2-cli/vue.config.js`.

If you're in a monorepo/workspace (common with pnpm), make sure your app uses a **single Vue 2 runtime instance**. Otherwise you may see runtime warnings like:
`provide() can only be used inside setup()` / `onMounted is called when there is no active component instance` (caused by duplicated Vue copies and mismatched Composition API context). Fix this by pinning `vue$` to your project's Vue 2 runtime in Webpack (see `playground-vue2-cli/vue.config.js`).

## Tailwind CSS Support

If your app uses Tailwind and you want to avoid duplicate utility CSS, import the Tailwind-ready output instead:

```ts
import 'markstream-vue2/index.tailwind.css'
```

And include the extracted class list in `tailwind.config.js`:

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,vue}',
    require('markstream-vue2/tailwind'),
  ],
}
```

This approach ensures that Tailwind includes all the utility classes used by markstream-vue2 in its purge process, resulting in a smaller final bundle size.

## Troubleshooting (Common Runtime Errors)

### `defineComponent is not a function`
Cause: `vue-demi` is in Vue 3 mode but the app runs Vue 2.x.
Fix (pick one):
- Run `pnpm vue-demi-switch 2`.
- Or alias `vue-demi$` to `vue-demi/lib/v2/index.cjs` in your bundler config (see above).

### `provide() can only be used inside setup()` / `onMounted is called when there is no active component instance`
Cause: duplicate Vue 2 runtime instances in monorepo/pnpm workspace.
Fix: ensure a **single Vue 2 instance** is used across the app and linked packages:
- Alias `vue$` to your app's Vue 2 runtime (see `playground-vue2-cli/vue.config.js`).
- In pnpm workspaces, add `overrides` for `playground-vue2-cli>vue` to pin Vue 2.

### `Vue packages version mismatch`
Cause: `vue` and `vue-template-compiler` versions differ.
Fix: align them (e.g. both `2.6.14` or both `2.7.16`). In pnpm, you can use `packageExtensions` or `overrides`.

### `Cannot read properties of undefined (reading 'props')`
Cause: Vue 2.6 + Composition API missing `_setupProxy` patch, or Composition API not installed.
Fix:
- Ensure `@vue/composition-api` is installed and `Vue.use(VueCompositionAPI)` is executed before using markstream-vue2.
- Upgrade to the latest `markstream-vue2` build in this repo (it patches `_setupProxy` for Vue 2.6).

### Quick Install: All Features

To enable all features at once:

```bash
pnpm add stream-diffs mermaid @terrastruct/d2 katex
# or
npm install stream-diffs mermaid @terrastruct/d2 katex
```

### Feature Details

#### Code Syntax Highlighting

Requires `stream-diffs`:

```bash
pnpm add stream-diffs
```

`stream-diffs` powers the enhanced `CodeBlockNode` runtime with built-in defaults for code and diff options. When it is not installed, code blocks fall back to a plain `<pre>`. You can override the `code_block` renderer via `setCustomComponents` for custom behavior:

```js
import { setCustomComponents } from 'markstream-vue2'

setCustomComponents({ code_block: MyCodeBlock })
```

Theming is controlled through the `theme` / `darkTheme` / `lightTheme` / `themes` props.

#### Mermaid Diagrams

For rendering Mermaid diagrams:

```bash
pnpm add mermaid
```

#### D2 Diagrams

For rendering D2 diagrams:

```bash
pnpm add @terrastruct/d2
```

#### KaTeX Math Rendering

For math formula rendering:

```bash
pnpm add katex
```

Also import the KaTeX CSS in your app entry:

```ts
import 'katex/dist/katex.min.css'
```

## Quick Test

Import and render a simple markdown string:

```vue
<script>
import MarkdownRender from 'markstream-vue2'
import 'markstream-vue2/index.css'

export default {
  components: {
    MarkdownRender
  },
  data() {
    return {
      md: '# Hello from markstream-vue2!'
    }
  }
}
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

## Using with Composition API (Vue 2.7+)

If you're using Vue 2.7 or have `@vue/composition-api` installed:

```vue
<script>
import { defineComponent, ref } from '@vue/composition-api' // or 'vue' for 2.7
import MarkdownRender from 'markstream-vue2'
import 'markstream-vue2/index.css'

export default defineComponent({
  components: {
    MarkdownRender
  },
  setup() {
    const md = ref('# Hello from markstream-vue2 with Composition API!')
    return { md }
  }
})
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

## TypeScript Support

markstream-vue2 includes TypeScript definitions. For Vue 2.6.x, you may need to configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@vue/composition-api"]
  }
}
```

For Vue 2.7+, types are included automatically.
