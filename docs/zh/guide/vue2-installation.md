---
title: Vue 2 Markdown 渲染器安装
description: 在 Vue 2.6、Vue 2.7、Nuxt 2、Vue CLI 或 Webpack 4 项目中安装 markstream-vue2，覆盖 Composition API、vue-demi、可选 peer、worker、CSS 路径和存量 Vue2 排错。
keywords:
  - markstream-vue2 安装
  - Vue 2 Markdown 渲染器安装
  - Vue 2.6 Composition API Markdown
  - Vue 2.7 Markdown 渲染器
  - Nuxt 2 Markdown 渲染器
  - Vue CLI Markdown 渲染器
  - Webpack 4 Vue2 Markdown
  - vue-demi Vue2 Markdown
  - Vue2 Mermaid Markdown 配置
  - Vue2 KaTeX Markdown 配置
  - Vue2 代码块 Markdown 配置
  - Vue2 存量项目 Markdown 配置
---

# Vue 2 安装

使用 pnpm、npm 或 yarn 安装 markstream-vue2。

```bash
pnpm add markstream-vue2
# 或
npm install markstream-vue2
# 或
yarn add markstream-vue2
```

## 要求

markstream-vue2 需要：
- **Vue 2.6.14+**（推荐使用 Vue 2.7 以获得更好的 TypeScript 支持）
- **@vue/composition-api**（如果使用 Vue 2.6.x）

## Composition API 版本兼容（Vue 2.6 / 2.7 / 3.x）

| Vue 版本 | Composition API 状态 | 需要安装 | 如何导入 |
|---------|----------------------|---------|---------|
| **2.6.x** | 不内置 | `@vue/composition-api` | `import { ref, computed, defineComponent } from '@vue/composition-api'` |
| **2.7.x** | 内置 | 无 | `import { ref, computed, defineComponent } from 'vue'` |
| **3.x** | 内置 | 无 | `import { ref, computed, defineComponent } from 'vue'` |

注意：
- **Vue 2.6.x** 必须安装并 **Vue.use(@vue/composition-api)**，否则会出现运行时报错。
- **Vue 2.7.x** **不需要** 安装 `@vue/composition-api`（内置）。
- **Vue 3.x** 请使用 **markstream-vue**（不是 markstream-vue2）。

## 按版本快速开始（依赖 + 入口）

### Vue 2.6.x

依赖：

```bash
pnpm add markstream-vue2 vue@2.6.14 vue-template-compiler@2.6.14 @vue/composition-api
```

入口文件：

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

在组件里使用 Composition API：

```ts
import { defineComponent, ref } from '@vue/composition-api'
```

仓库示例：
- `playground-vue2-cli`（Vue 2.6 + Vue CLI / Webpack 4）

路径与启动命令：

```bash
pnpm -C playground-vue2-cli dev
```

也可以在仓库根目录直接运行：

```bash
pnpm play:vue2-cli
```

### Vue 2.7.x

依赖：

```bash
pnpm add markstream-vue2 vue@2.7.16 vue-template-compiler@2.7.16
```

入口文件：

```ts
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueRendererMarkdown)

new Vue({
  render: h => h(MarkdownRender, { props: { content: '# Vue 2.7' } }),
}).$mount('#app')
```

在组件里使用 Composition API：

```ts
import { defineComponent, ref } from 'vue'
```

仓库示例：
- `playground-vue2`（Vue 2.7 + Vite）

路径与启动命令：

```bash
pnpm -C playground-vue2 dev
```

也可以在仓库根目录直接运行：

```bash
pnpm play:vue2
```

### Vue 3.x（使用 markstream-vue）

依赖：

```bash
pnpm add markstream-vue vue@^3
```

入口文件：

```ts
import MarkdownRender from 'markstream-vue'
import { createApp, h } from 'vue'
import 'markstream-vue/index.css'

createApp({
  render: () => h(MarkdownRender, { content: '# Vue 3' }),
}).mount('#app')
```

如果你的工作区同时安装了 Vue 3，请确保 `vue-demi` 指向 Vue 2：

```bash
pnpm vue-demi-switch 2
```

如果无法运行 `vue-demi-switch`（或希望只在某个应用里处理），可以在打包配置里强制把 `vue-demi` 指向 Vue 2 版本，避免出现 `defineComponent is not a function`：

```js
// vue.config.js / webpack 配置
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

## 可选的对等依赖

markstream-vue2 通过可选的对等依赖支持各种功能。只安装你需要的功能：

| 功能 | 所需包 | 安装命令 |
|---------|------------------|-----------------|
| 增强代码块（推荐） | `stream-diffs` | `pnpm add stream-diffs` |
| Mermaid 图表 | `mermaid` | `pnpm add mermaid` |
| D2 图表 | `@terrastruct/d2` | `pnpm add @terrastruct/d2` |
| 数学公式渲染（KaTeX） | `katex` | `pnpm add katex` |

增强代码块使用可选的对等依赖 `stream-diffs`。未安装时会回退渲染普通 `<pre>`。代码与 diff 选项使用 `stream-diffs` 内置默认值，主题通过 `theme` / `darkTheme` / `lightTheme` / `themes` 控制。

## Vue 2.6.x 设置

如果你使用的是 Vue 2.6.x，需要安装并配置 `@vue/composition-api`：

```bash
pnpm add @vue/composition-api
```

然后在你的应用入口文件中：

```ts
import VueCompositionAPI from '@vue/composition-api'
import Vue from 'vue'

Vue.use(VueCompositionAPI)
```

在 Vue 2.6 组件里使用 Composition API：

```ts
import { defineComponent, ref } from '@vue/composition-api'
```

## Vue 2.7.x 设置（无需插件）

Vue 2.7 已内置 Composition API，**不要** 安装 `@vue/composition-api`：

```ts
import { defineComponent, ref } from 'vue'
```

## 功能加载器（Mermaid / KaTeX / D2）

安装可选对等依赖后，默认 loader 已经启用。仅当你之前手动关闭，或需要自定义 loader（例如使用 CDN 版本）时才需要调用：

```ts
import { enableD2, enableKatex, enableMermaid } from 'markstream-vue2'

// 可选：重新启用或覆盖 loader
enableMermaid()
enableKatex()
enableD2()
```

同时记得导入必需的 CSS（按需使用）：

```ts
import 'markstream-vue2/index.css'
import 'katex/dist/katex.min.css'
```

注意：`markstream-vue2/index.css` 的样式被限制在内部的 `.markstream-vue2` 容器下，以减少全局样式冲突。`MarkdownRender` 默认在该容器内渲染。如果你单独渲染节点组件，请用 `<div class="markstream-vue2">...</div>` 包裹它们。

## Vue CLI（Webpack 4）特别说明

Vue CLI 4 默认使用 **Webpack 4**，它不支持 `package.json#exports`，因此以下写法会在 Webpack 4 下解析失败：

- `import 'markstream-vue2/index.css'`
- `import('mermaid')`
- Vite 风格的 worker 导入：`?worker` / `?worker&inline`

推荐做法（可直接参考 `playground-vue2-cli`）：

1) CSS 改用真实路径（不依赖 `exports`）：

```ts
import 'markstream-vue2/dist/index.css'
```

2) Mermaid 推荐使用 CDN 的全局构建（避免 Webpack 4 解析 `exports` / ESM 依赖链）：

```html
<!-- public/index.html -->
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
```

3) KaTeX / Mermaid worker 推荐使用 CDN worker（避免 Webpack 4 worker 限制）：

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

如果你希望继续使用 `markstream-vue2/index.css` 这类导入路径，需要在 `vue.config.js` 里做 `resolve.alias` 映射（见 `playground-vue2-cli/vue.config.js`）。

### 代码块：推荐用 `stream-diffs` 覆盖

增强代码块运行时（`stream-diffs`）是 markstream-vue2 中唯一的代码块渲染器。未安装该可选对等依赖时，会回退渲染普通 `<pre>`。对于 Webpack 4，`stream-diffs` 是推荐（也是唯一）的代码块运行时——没有 Monaco 回退。

1) 安装可选对等依赖：

```bash
pnpm add stream-diffs
```

2)（可选）需要自定义行为时，可用 `setCustomComponents` 覆盖 `code_block`：

```ts
import { setCustomComponents } from 'markstream-vue2'

setCustomComponents({ code_block: MyCodeBlock })
```

3) Webpack 配置踩坑：

- 如果你使用 `webpack.IgnorePlugin` 忽略可选依赖，确保不要把 `stream-diffs` 忽略掉，否则代码块会回退为 `<pre>`。
- `stream-diffs` 是 ESM-only 包，在 CJS 的 `vue.config.js` 里即便已安装，`require.resolve('stream-diffs')` 也可能失败；建议用文件系统兜底定位 `node_modules/stream-diffs` 并 alias 到 `dist/index.js`。可参考 `playground-vue2-cli/vue.config.js`。

另外，如果你的项目是 monorepo/workspace（pnpm 常见），请确保整个应用只使用 **同一份 Vue 2 runtime**。否则会出现类似：
`provide() can only be used inside setup()` / `onMounted is called when there is no active component instance` 的运行时警告（本质是重复 Vue 实例导致 Composition API 上下文不一致）。解决方式是在 Webpack 中固定 `vue$` 指向项目内的 Vue 2 runtime（见 `playground-vue2-cli/vue.config.js`）。

## 常见运行时报错排查

### `defineComponent is not a function`
原因：`vue-demi` 处于 Vue 3 模式，但应用实际运行在 Vue 2.x。
解决（任选其一）：
- 运行 `pnpm vue-demi-switch 2`
- 或在打包配置里把 `vue-demi$` alias 到 `vue-demi/lib/v2/index.cjs`（见上文）

### `provide() can only be used inside setup()` / `onMounted is called when there is no active component instance`
原因：monorepo/pnpm 工作区出现重复的 Vue 2 运行时实例。
解决：确保全项目只使用 **一个 Vue 2 实例**：
- 在打包配置里将 `vue$` alias 到应用自身的 Vue 2 运行时（参考 `playground-vue2-cli/vue.config.js`）
- 在 pnpm workspace 中用 `overrides` 固定 `playground-vue2-cli>vue` 为 Vue 2 版本

### `Vue packages version mismatch`
原因：`vue` 与 `vue-template-compiler` 版本不一致。
解决：对齐版本（例如都用 `2.6.14` 或都用 `2.7.16`），pnpm 可以用 `packageExtensions` / `overrides` 处理。

### `Cannot read properties of undefined (reading 'props')`
原因：Vue 2.6 + Composition API 缺少 `_setupProxy` patch，或 Composition API 未安装。
解决：
- 确保已安装 `@vue/composition-api` 并在入口执行 `Vue.use(VueCompositionAPI)`
- 升级到本仓库最新的 `markstream-vue2` 构建（已对 Vue 2.6 补丁 `_setupProxy`）

## Tailwind CSS 支持

如果你的项目使用 Tailwind，并希望避免重复注入 Tailwind utilities，请改用 Tailwind-ready 输出：

```ts
import 'markstream-vue2/index.tailwind.css'
```

并在 `tailwind.config.js` 的 `content` 中加入该包导出的 class 列表：

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,vue}',
    require('markstream-vue2/tailwind'),
  ],
}
```

这种方式可以确保 Tailwind 在清除未使用的样式时包含 markstream-vue2 使用的所有工具类，从而获得更小的最终打包体积。

### 快速安装：所有功能

一次性启用所有功能：

```bash
pnpm add stream-diffs mermaid @terrastruct/d2 katex
# 或
npm install stream-diffs mermaid @terrastruct/d2 katex
```

### 功能详情

#### 代码语法高亮

需要安装 `stream-diffs`：

```bash
pnpm add stream-diffs
```

`stream-diffs` 为增强的 `CodeBlockNode` 运行时提供代码与 diff 的默认配置。未安装时会回退渲染普通 `<pre>`。需要自定义行为时，可通过 `setCustomComponents` 覆盖 `code_block` 渲染器：

```js
import { setCustomComponents } from 'markstream-vue2'

setCustomComponents({ code_block: MyCodeBlock })
```

主题通过 `theme` / `darkTheme` / `lightTheme` / `themes` 属性控制。

#### Mermaid 图表

渲染 Mermaid 图表：

```bash
pnpm add mermaid
```

#### D2 图表

渲染 D2 图表：

```bash
pnpm add @terrastruct/d2
```

#### KaTeX 数学公式渲染

数学公式渲染：

```bash
pnpm add katex
```

同时在应用入口文件中导入 KaTeX CSS：

```ts
import 'katex/dist/katex.min.css'
```

## 快速测试

导入并渲染一个简单的 markdown 字符串：

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

## 使用 Composition API（Vue 2.7+）

如果你使用的是 Vue 2.7 或已安装 `@vue/composition-api`：

```vue
<script>
import { defineComponent, ref } from '@vue/composition-api' // 或 Vue 2.7 的 'vue'
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

## TypeScript 支持

markstream-vue2 包含 TypeScript 类型定义。对于 Vue 2.6.x，你可能需要配置 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "types": ["@vue/composition-api"]
  }
}
```

对于 Vue 2.7+，类型会自动包含。
