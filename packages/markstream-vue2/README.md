# markstream-vue2

Vue 2.6 / 2.7 compatibility renderer for legacy Vue 2 apps that need streaming Markdown, AI chat output, long documents, progressive Mermaid/KaTeX, and streaming code blocks.

- Docs: https://markstream.simonhe.me/frameworks/vue2
- Quick start: https://markstream.simonhe.me/guide/vue2-quick-start

For Vue 3 or new Vue/Nuxt projects, use `markstream-vue` instead.

## Install

```bash
pnpm add markstream-vue2
# npm i markstream-vue2
# yarn add markstream-vue2
```

## Requirements

- Vue 2.6.14+ (Vue 2.7 recommended for better TS support)
- @vue/composition-api (required for Vue 2.6.x)
- `vue` and `vue-template-compiler` must use the same Vue 2 version

## Composition API compatibility

| Vue version | Composition API availability | What to install | How to import |
|-------------|------------------------------|-----------------|---------------|
| **2.6.x** | Not built-in | `@vue/composition-api` | `import { ref, computed, defineComponent } from '@vue/composition-api'` |
| **2.7.x** | Built-in | None | `import { ref, computed, defineComponent } from 'vue'` |
| **3.x** | Built-in | None | `import { ref, computed, defineComponent } from 'vue'` |

Notes:
- **Vue 2.6.x** must install and **Vue.use(@vue/composition-api)**.
- **Vue 2.7.x** should **not** install `@vue/composition-api`.
- **Vue 3.x** should use **markstream-vue** (not markstream-vue2).

## Quick start by version

### Vue 2.6.x

```bash
pnpm add markstream-vue2 vue@2.6.14 vue-template-compiler@2.6.14 @vue/composition-api
```

```ts
import VueCompositionAPI from '@vue/composition-api'
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueCompositionAPI)
Vue.use(VueRendererMarkdown)
```

If your app increases root font size on mobile (`html` / `body`), prefer `markstream-vue2/index.px.css` to avoid `rem`-driven scaling.

Repo example:
- `playground-vue2-cli` (Vue 2.6 + Vue CLI / Webpack 4)

Start:

```bash
pnpm -C playground-vue2-cli dev
```

From repo root:

```bash
pnpm play:vue2-cli
```

### Vue 2.7.x

```bash
pnpm add markstream-vue2 vue@2.7.16 vue-template-compiler@2.7.16
```

```ts
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueRendererMarkdown)
```

Repo example:
- `playground-vue2` (Vue 2.7 + Vite)

Start:

```bash
pnpm -C playground-vue2 dev
```

From repo root:

```bash
pnpm play:vue2
```

### Vue 3.x (use markstream-vue)

```bash
pnpm add markstream-vue vue@^3
```

If your workspace also installs Vue 3, ensure `vue-demi` targets Vue 2:

```bash
pnpm vue-demi-switch 2
```

If you cannot run `vue-demi-switch`, you can force the Vue 2 build via bundler alias (common in Vue CLI / Webpack 4):

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

## Usage (Vue 2.6)

```ts
import VueCompositionAPI from '@vue/composition-api'
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueCompositionAPI)
Vue.use(VueRendererMarkdown)

new Vue({
  render: h => h(MarkdownRender, {
    props: {
      content: '# Hello from Vue 2',
    },
  }),
}).$mount('#app')
```

## Streaming best practices

- For simple chat streaming, passing `content` is the fastest way to integrate.
- For high-frequency SSE / token streaming, long conversations, or very large code/table/math blocks, prefer parsing outside the renderer and pass `nodes` instead of reparsing the whole `content` string every chunk.
- Install `stream-diffs` for enhanced File/FileDiff code blocks. Code stays in the stable `<pre>` while its fence is incomplete or offscreen; Vue 2 creates one final highlighted surface after completion and visibility, then swaps after the first stable frame.
- Keep `viewport-priority` enabled unless you explicitly want eager rendering. Mermaid, Diffs, and D2 blocks stay idle while offscreen and resume when they approach the viewport.

```vue
<template>
  <MarkdownRender
    :nodes="nodes"
    :final="final"
    :viewport-priority="true"
    :defer-nodes-until-visible="true"
  />
</template>
```

## Heavy-node prop forwarding

`MarkdownRender` can forward framework-level props directly into specialized heavy renderers:

```vue
<template>
  <MarkdownRender
    :content="markdown"
    :mermaid-props="{
      showHeader: false,
      renderDebounceMs: 180,
      previewPollDelayMs: 500,
    }"
    :d2-props="{ progressiveIntervalMs: 500 }"
    :infographic-props="{ showHeader: false }"
  />
</template>
```

Notes:
- Use kebab-case in templates: `mermaid-props`, `d2-props`, `infographic-props`.
- These props are forwarded to the built-in Mermaid / D2 / Infographic blocks and to custom `mermaid` / `d2` / `infographic` overrides registered with `setCustomComponents(...)`.

## Language-specific code block overrides

You can also register a renderer for one fenced language directly:

```ts
import { setCustomComponents } from 'markstream-vue2'

setCustomComponents('docs', {
  echarts: EChartsBlockNode,
})
```

Notes:
- `echarts` only catches fences whose language is `echarts`.
- Code block routing priority is exact language key -> built-in `mermaid` / `d2` / `infographic` routes -> `code_block`.
- `mermaid`, `d2`, and `infographic` overrides keep their specialized prop forwarding; other language keys receive the normal code-block-level bindings.

## Mermaid tuning

Common `mermaid-props` keys for streaming scenarios:

- `renderDebounceMs`: delay partial/full progressive work during rapid token bursts.
- `contentStableDelayMs`: how long source mode waits before auto-switching back to preview when content stabilizes.
- `previewPollDelayMs`: initial delay before preview polling tries to upgrade a partial preview into a full render.
- `previewPollMaxDelayMs`: cap for preview polling backoff.
- `previewPollMaxAttempts`: maximum retry count while the Mermaid source is still incomplete.

## Build and size checks

```bash
pnpm --filter markstream-vue2 build
pnpm --filter markstream-vue2 build:analyze
pnpm --filter markstream-vue2 size:check
```

## Bundle size notes

- Optional peers are not bundled; install only the features you need.
- Infrequent language icons are split into an async chunk and loaded on demand.
- If you want to avoid first-hit fallback icons, preload once when the app is idle:

```ts
import { preloadExtendedLanguageIcons } from 'markstream-vue2'

if (typeof window !== 'undefined')
  void preloadExtendedLanguageIcons()
```

## Troubleshooting

### `defineComponent is not a function`
Cause: `vue-demi` is in Vue 3 mode while the app runs Vue 2.x.
Fix: run `pnpm vue-demi-switch 2` or alias `vue-demi$` to `vue-demi/lib/v2/index.cjs`.

### `Vue packages version mismatch`
Cause: `vue` and `vue-template-compiler` versions differ.
Fix: align both to the same version (e.g. `2.6.14` or `2.7.16`).

### `Cannot read properties of undefined (reading 'props')`
Cause: Vue 2.6 + Composition API missing `_setupProxy` patch, or plugin not installed.
Fix: ensure `@vue/composition-api` is installed + `Vue.use(...)`, and update to the latest markstream-vue2 build.

### Custom node renders trigger `infinite update loop`
Cause: in Vue 2.6 / Vue CLI 4, recursively mounting another `MarkdownRender` inside a custom node component can create a render loop when the parent renderer is still streaming.
Fix: prefer `NestedRenderer` for nested streaming content. If you only need static HTML output, `renderNestedMarkdownToHtml(...)` is still available.

```ts
import { NestedRenderer } from 'markstream-vue2'

export default {
  components: { NestedRenderer },
  props: {
    node: { type: Object, required: true },
  },
}
```

```vue
<template>
  <NestedRenderer
    :node="node"
    custom-id="chat-demo"
    :custom-html-tags="['thinking']"
    :typewriter="false"
    :batch-rendering="false"
    :viewport-priority="false"
    :defer-nodes-until-visible="false"
  />
</template>
```

`NestedRenderer` keeps the inner content streamable, but switches the nested renderer to the `nodes` path so Vue 2.6 does not recurse through a second `content`-driven renderer.

If you cannot mount another renderer and just need a static nested body, use `renderNestedMarkdownToHtml(...)`:

```ts
import { renderNestedMarkdownToHtml } from 'markstream-vue2'

export default {
  props: {
    node: { type: Object, required: true },
  },
  computed: {
    renderedHtml() {
      return renderNestedMarkdownToHtml(
        { node: this.node },
        {
          customHtmlTags: ['thinking'],
          customNodeClass(node) {
            return node.type === 'thinking' ? 'thinking-node__nested' : ''
          },
        },
      )
    },
  },
}
```

This keeps deeply nested custom content streamable without recursively mounting a second `content`-driven `MarkdownRender` / `NodeRenderer`.

## Tailwind

If your app uses Tailwind and you want to avoid shipping duplicated utility CSS, import the Tailwind-ready output instead:

```ts
import 'markstream-vue2/index.tailwind.css'
```

Then include the extracted class list in `tailwind.config.js`:

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,vue}',
    require('markstream-vue2/tailwind'),
  ],
}
```

## Notes

- The Vue 2 package is a compatibility port for legacy Vue 2 apps and mirrors the Vue 3 renderer feature set where practical (virtualization, streaming code blocks, Monaco, Mermaid, KaTeX, tooltip singleton).
- Optional peers are still required for those features (`stream-monaco`, `stream-markdown`, `mermaid`, `katex`, etc.).
- Custom node components are supported via `setCustomComponents` from `markstream-vue2`.
- If you only render short static Markdown, a smaller Vue 2 Markdown component may be a simpler fit.

## TypeScript

Parser node types are re-exported from `stream-markdown-parser`, and Vue 2 specific mapping / Monaco types are available from `markstream-vue2` itself:

```ts
import type { CodeBlockMonacoOptions, CustomComponents, ParsedNode } from 'markstream-vue2'
```
