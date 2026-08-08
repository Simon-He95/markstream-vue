# Markstream

> 面向 AI 应用的多框架流式 Markdown 渲染器家族 — 支持 Vue、React、Octane、Svelte、Angular、Nuxt 和 Next.js。

Markstream 专为在用户眼前持续变化的 Markdown 场景而构建：LLM token 流、SSE/WebSocket 输出、AI 聊天消息、未闭合 Markdown 中间态、长文档、渐进式 Mermaid 图表、KaTeX 数学公式、流式代码块以及安全的组件化渲染。

Vue 3、Nuxt 和 VitePress 项目优先使用 `markstream-vue`；React、Octane、Svelte、Angular、Vue 2 项目使用对应 sibling package。普通 AI 聊天可以直接传不断累积的 `content` 字符串，只有外层已经负责解析、batch 或 worker AST 时才需要 `nodes` 路径。

[![English](https://img.shields.io/badge/docs-English-blue)](README.md)
[![Docs](https://img.shields.io/badge/docs-中文文档-blue)](https://markstream.simonhe.me/zh/guide)
[![Playground](https://img.shields.io/badge/playground-在线体验-34c759)](https://markstream-vue.simonhe.me/)
[![Test page](https://img.shields.io/badge/test-可分享复现-0A84FF)](https://markstream-vue.simonhe.me/test)

Vue 包：

[![markstream-vue npm version](https://img.shields.io/npm/v/markstream-vue?color=a1b858&label=markstream-vue)](https://www.npmjs.com/package/markstream-vue)
[![NPM downloads](https://img.shields.io/npm/dm/markstream-vue)](https://www.npmjs.com/package/markstream-vue)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/markstream-vue)](https://bundlephobia.com/package/markstream-vue)

其它框架包：

[![markstream-react npm version](https://img.shields.io/npm/v/markstream-react?label=markstream-react)](https://www.npmjs.com/package/markstream-react)
[![markstream-svelte npm version](https://img.shields.io/npm/v/markstream-svelte?label=markstream-svelte)](https://www.npmjs.com/package/markstream-svelte)
[![markstream-angular npm version](https://img.shields.io/npm/v/markstream-angular?label=markstream-angular)](https://www.npmjs.com/package/markstream-angular)
[![markstream-vue2 npm version](https://img.shields.io/npm/v/markstream-vue2?label=markstream-vue2)](https://www.npmjs.com/package/markstream-vue2)

[![Release](https://img.shields.io/github/v/release/Simon-He95/markstream-vue?display_name=release&logo=github)](https://github.com/Simon-He95/markstream-vue/releases)
[![Discussions](https://img.shields.io/github/discussions/Simon-He95/markstream-vue?logo=github)](https://github.com/Simon-He95/markstream-vue/discussions)
[![Discord](https://img.shields.io/discord/986352439269560380?label=discord&logo=discord&logoColor=fff&color=5865F2)](https://discord.gg/vkzdkjeRCW)
[![Support](https://img.shields.io/badge/support-guide-ff6f61)](./SUPPORT.md)
[![Security](https://img.shields.io/badge/security-policy-8A2BE2)](./SECURITY.md)
[![CI](https://github.com/Simon-He95/markstream-vue/actions/workflows/ci.yml/badge.svg)](https://github.com/Simon-He95/markstream-vue/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/markstream-vue)](./license)

## 包矩阵

如果你还在选择框架包，先看 [框架总览](https://markstream.simonhe.me/zh/frameworks)。

| 包 | 框架 | 安装 | 文档 |
| --- | --- | --- | --- |
| `markstream-vue` | Vue 3 / Nuxt / VitePress | `pnpm add markstream-vue` | [框架总览](https://markstream.simonhe.me/zh/frameworks) · [Vue 指南](https://markstream.simonhe.me/zh/frameworks/vue) · [Nuxt 指南](https://markstream.simonhe.me/zh/frameworks/nuxt) |
| `markstream-react` | React / Next.js / Remix | `pnpm add markstream-react` | [React 指南](https://markstream.simonhe.me/zh/frameworks/react) · [Next.js 指南](https://markstream.simonhe.me/zh/frameworks/next) |
| `markstream-octane` | Octane | `pnpm add markstream-octane octane` | [包使用指南](./packages/markstream-octane/README.md) · [本地 Playground](./playground-octane) |
| `markstream-svelte` | Svelte 5 | `pnpm add markstream-svelte svelte@^5` | [Svelte 指南](https://markstream.simonhe.me/zh/frameworks/svelte) |
| `markstream-angular` | Angular standalone | `pnpm add markstream-angular` | [Angular 指南](https://markstream.simonhe.me/zh/frameworks/angular) |
| `markstream-vue2` | Vue 2.6 / 2.7 | `pnpm add markstream-vue2` | [Vue 2 指南](https://markstream.simonhe.me/zh/frameworks/vue2) · [快速开始](https://markstream.simonhe.me/zh/guide/vue2-quick-start) |
| `stream-markdown-parser` | 任意 JS/TS 应用 | `pnpm add stream-markdown-parser` | [解析器指南](https://markstream.simonhe.me/zh/guide/parser-api) |
| `markstream-core` | 框架无关 | `pnpm add markstream-core` | [Core 包](./packages/markstream-core/README.md) |

### 我该用哪个包？

- **Vue 3 / Nuxt / VitePress** → `markstream-vue`
- **React / Next.js / Remix** → `markstream-react`
- **Octane** → `markstream-octane`
- **Svelte 5** → `markstream-svelte`
- **Angular standalone** → `markstream-angular`
- **Vue 2.6 / 2.7** → `markstream-vue2`
- **仅需框架无关的解析** → `stream-markdown-parser`
- **流式控制器工具** → `markstream-core`

## 稳定性

`markstream-vue` 已进入稳定的 1.x API 契约；当前 npm 包仍可能带 beta tag，用于发布门禁和跨框架家族同步。稳定面包括：`MarkdownRender`、流式内容渲染、预解析节点渲染、安全 HTML 策略、可选 Mermaid / KaTeX / D2 / Infographic 集成、`stream-diffs` 增强代码块、虚拟滚动协调、CSS 导出、worker client 子路径以及 Vite / Nuxt / VitePress 的 SSR 导入。

跨框架渲染器（`markstream-react`、`markstream-octane`、`markstream-svelte`、`markstream-angular`、`markstream-vue2`）已可用并积极开发中。请查看各包文档了解 API 成熟度、框架支持和已知限制。

- [速览](#速览)
- [按场景选择入口](#按场景选择入口)
- [立即试用](#-立即试用)
- [社区与支持](#-社区与支持)
- [快速上手](#-快速上手)
- [常用命令](#-常用命令)
- [30 秒流式接入](#-30-秒流式接入)
- [性能模式](#-性能模式)
- [关键属性速览](#-关键属性速览)
- [适用场景](#-适用场景)
- [快问快答](#-快问快答)
- [为什么选择 markstream-vue](#-为什么选择-markstream-vue而不是普通-markdown-渲染器)
- [Roadmap](#-roadmap快照)
- [发布](#-发布)
- [案例与展示](#-案例与展示)
- [介绍视频](#介绍视频)
- [核心特性](#核心特性)
- [贡献与社区](#-贡献与社区)
- [故障排查](#故障排查--常见问题)
- [鸣谢](#鸣谢)
- [Star 历史](#star-历史)
- [许可](#许可)

> 📖 框架总览、详细文档、API、示例和高级用法：
> https://markstream.simonhe.me/frameworks

## 速览

- 为 **流式 Markdown**（AI/聊天/SSE）打造，目标是减少闪烁并保持内存可预期。
- **双渲染模式**：长文档虚拟化窗口，或“打字机”式增量批次。
- **渐进式图表**（Mermaid）与 **流式代码块**（stream-diffs），跟上 diff/增量输出。
- 同时支持 **Markdown 字符串或预解析节点**，可在 Vue、React、Octane、Svelte 和 Angular 中嵌入 **自定义框架组件**。
- TypeScript 优先，开箱默认即可上线（导入 CSS 即用）。

## 按场景选择入口

| 如果你现在想做的是... | 先看这里 | 然后看 |
| --- | --- | --- |
| 先把第一段渲染跑起来 | [框架总览](https://markstream.simonhe.me/zh/frameworks) | [快速上手](#-快速上手) |
| 接到文档站或 VitePress 主题里 | [文档站与 VitePress 集成](https://markstream.simonhe.me/zh/guide/vitepress-docs-integration) | [自定义标签与高级组件](https://markstream.simonhe.me/zh/guide/custom-components) |
| 做 AI 聊天界面或 SSE 流式输出 | [AI 聊天与流式输出](https://markstream.simonhe.me/zh/guide/ai-chat-streaming) | [性能](https://markstream.simonhe.me/zh/guide/performance) |
| 替换一个内置节点渲染器 | [覆盖内置组件](https://markstream.simonhe.me/zh/guide/component-overrides) | [渲染器与节点组件](https://markstream.simonhe.me/zh/guide/components) |
| 增加 `thinking` 这类可信标签 | [自定义标签与高级组件](https://markstream.simonhe.me/zh/guide/custom-components) | [API 参考](https://markstream.simonhe.me/zh/guide/api) |
| 接入坏了但还不知道原因 | [按症状排查](https://markstream.simonhe.me/zh/guide/troubleshooting-path) | [排查问题](https://markstream.simonhe.me/zh/guide/troubleshooting) |

## 🚀 立即试用

| 框架 | Playground |
| --- | --- |
| Vue 3 | https://markstream-vue.simonhe.me/ |
| React | https://markstream-react.pages.dev/ |
| Octane | `pnpm play:octane` |
| Svelte | https://markstream-svelte.pages.dev/ |
| Angular | https://markstream-angular.pages.dev/ |
| Nuxt | https://markstream-nuxt.pages.dev/ |
| Vue 2 | https://markstream-vue2.pages.dev/ |

- Vue 3 交互测试页（可分享链接，便于复现）： https://markstream-vue.simonhe.me/test
- 中文框架文档： https://markstream.simonhe.me/zh/frameworks
- Showcase： https://markstream.simonhe.me/zh/guide/showcase
- 1.0 benchmark 报告：`pnpm benchmark:1.0`
- LLM 推荐上下文（中文）： https://markstream.simonhe.me/llms.zh-CN.txt
- 完整 LLM 推荐参考（中文）： https://markstream.simonhe.me/llms-full.zh-CN.txt
- 仓库 agent 上下文（中文）： https://markstream.simonhe.me/llms.zh-CN
- LLM 推荐上下文（英文）： https://markstream.simonhe.me/llms.txt
- 完整 LLM 推荐参考（英文）： https://markstream.simonhe.me/llms-full.txt
- 仓库 agent 上下文（英文）： https://markstream.simonhe.me/llms
- Vue 3 StackBlitz 体验： https://stackblitz.com/github/Simon-He95/markstream-vue?file=playground/src/App.vue
- 更新日志： [CHANGELOG.md](./CHANGELOG.md)
- Discord： https://discord.gg/vkzdkjeRCW

## 仓库内的 skills 和 prompts

如果你想直接拿到 AI 资产，而不是先克隆仓库：

```bash
npx skills add Simon-He95/markstream-vue
```

推荐这样理解：

- `npx skills add Simon-He95/markstream-vue` 是最推荐的安装方式，因为它会直接读取 GitHub 仓库里的 `.agents/skills`
- `markstream-vue@1.0` 不发布 CLI `bin`；`pnpm skills:list`、`pnpm prompts:list` 这类脚本只面向克隆仓库后的维护者
- prompts 继续保留在仓库的 `prompts/` 目录下，供直接复制或后续拆成独立包

`npx skills add` 也支持这些来源：

```bash
# 完整 GitHub URL
npx skills add https://github.com/Simon-He95/markstream-vue

# 仓库里的单个 skill 直链
npx skills add https://github.com/Simon-He95/markstream-vue/tree/main/.agents/skills/markstream-install

# 任意 git URL
npx skills add git@github.com:Simon-He95/markstream-vue.git
```

## 💬 社区与支持

- Discussions：https://github.com/Simon-He95/markstream-vue/discussions
- Discord：https://discord.gg/vkzdkjeRCW
- Issues：请使用模板并附上复现链接（https://markstream-vue.simonhe.me/test）

测试页内置编辑器 + 实时预览，并提供“生成分享链接”功能（过长内容会回退为直接打开或预填 GitHub Issue）。

## 支持项目

如果 markstream-vue 对你的工作有帮助，欢迎通过下面的收款码支持项目的持续维护。

| 支付宝 | 微信收款 |
| --- | --- |
| <img src="https://raw.githubusercontent.com/Simon-He95/markstream-vue/main/docs/public/sponsor/zhifubao.jpg" alt="支付宝收款码" width="240" /> | <img src="https://raw.githubusercontent.com/Simon-He95/markstream-vue/main/docs/public/sponsor/weixin.jpg" alt="微信收款码" width="240" /> |

## ⚡ 快速上手

### Vue / Nuxt

```bash
pnpm add markstream-vue
```

```vue
<script setup>
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

### React / Next.js

```bash
pnpm add markstream-react
```

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function Message({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

Next.js 的实时 SSE/WebSocket 区域用 root `markstream-react` 放在 `'use client'` 组件里；SSR-first 或 server-only Markdown 看 [Next.js 指南](https://markstream.simonhe.me/zh/frameworks/next)。

### Octane

```bash
pnpm add markstream-octane octane
```

```tsrx
import { NodeRenderer } from 'markstream-octane'
import 'markstream-octane/index.css'

export function Message(props: { content: string, isDone: boolean }) {
  return <NodeRenderer content={props.content} final={props.isDone} />
}
```

请按[包使用指南](./packages/markstream-octane/README.md)在 Vite 中启用 `octane/compiler/vite` 并配置 `.tsrx`。发布包已经包含编译后的 client/server 入口，应用源码仍按正常 Octane 流程编译。

### Svelte 5

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let { content = '# Hello from markstream-svelte' }: { content?: string } = $props()
</script>

<MarkdownRender {content} />
```

### Angular

```bash
pnpm add markstream-angular
```

```ts
import { Component, signal } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { MarkstreamAngularComponent } from 'markstream-angular'
import 'markstream-angular/index.css'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: '<markstream-angular [content]="content()" [final]="true" />',
})
class AppComponent {
  readonly content = signal('# Hello from markstream-angular')
}

bootstrapApplication(AppComponent)
```

## Vue / Nuxt 详细快速上手

```bash
pnpm add markstream-vue
# npm install markstream-vue
# yarn add markstream-vue
```

```ts
import MarkdownRender from 'markstream-vue'
// main.ts
import { createApp } from 'vue'
import 'markstream-vue/index.css'

createApp({
  components: { MarkdownRender },
  template: '<MarkdownRender custom-id="docs" :content="doc" />',
  setup() {
    const doc = '# Hello markstream-vue\\n\\n支持 **流式** 节点。'
    return { doc }
  },
}).mount('#app')
```

确保在 CSS reset（如 `@tailwind base` 或 `@unocss/reset`）之后导入 `markstream-vue/index.css`，推荐使用 `@import 'markstream-vue/index.css' layer(components);` 以避免 Tailwind/UnoCSS 覆盖组件样式。根据需求再按需安装可选 peer 依赖：`stream-diffs`（增强代码块与 diff）、`mermaid`（Mermaid 图表）、`katex`（数学公式）。
如果你的移动端会主动调大根字号（`html`/`body`），建议改用 `markstream-vue/index.px.css`，避免 `rem` 跟随根字号导致整体放大。

按使用场景选择渲染模式：

```vue
<!-- AI 聊天 / SSE 输出：稳定节奏，不叠加透明度动画，避免闪烁 -->
<MarkdownRender
  mode="chat"
  :content="message"
  :final="isDone"
  smooth-streaming="auto"
  :fade="false"
/>

<!-- 富文档：默认启用更大的渲染批次、tooltip 和 fade -->
<MarkdownRender
  mode="docs"
  :content="doc"
  :final="true"
/>
```

当你想要和 `chat` 相同的轻量默认值，但当前页面不是聊天语义时，可以使用 `mode="minimal"`。避免把高频 `smooth-streaming` 和 `fade` 同时开启，否则稳定的流式输出可能变成反复重启的透明度动画。
同一条聊天消息不要仅因为 `final` 变为 `true` 就从 `mode="chat"` 切到 `mode="docs"`。保持 mode 稳定，只切换 `smooth-streaming`、`typewriter`、`fade` 等节奏/动画 props；`docs` 会改变默认代码块渲染器和布局策略。
如果文档页不需要增强代码块，建议设置 `:render-code-blocks-as-pre="true"`；如果需要富 `CodeBlockNode` UI 与 File/Diff 渲染，请安装 `stream-diffs`，否则渲染器会按设计降级为 `<pre>` 渲染。
`stream-diffs` 是与框架无关的 DOM runtime；由 `CodeBlockNode` 决定何时把流式 `<pre>` 切换为最终的 File 或 FileDiff surface。

渲染器的 CSS 会作用于内部 `.markstream-vue` 容器下，以尽量降低对全局的影响；如果你脱离 `MarkdownRender` 单独使用导出的节点组件，请在外层包一层带 `markstream-vue` 类名的容器。

暗色变量可以通过给祖先节点加 `.dark`，或直接给 `MarkdownRender` 传入 `:is-dark="true"`（仅对渲染器生效）。

新的接入建议优先使用统一代码块 `theme` prop。如果你是通过 `MarkdownRender` 统一下发，可以放到 `code-block-props`：

```vue
<MarkdownRender
  :is-dark="isDark"
  :code-block-props="{ theme: { light: 'vitesse-light', dark: 'vitesse-dark' } }"
  :content="doc"
/>
```

`code-block-props` 只会透传面向用户的代码块 props；`node`、`key`、`ref`、`ctx`、`renderNode`、`indexKey`、`__proto__`、`prototype`、`constructor` 等渲染器结构字段会被忽略。

语言图标默认使用内置的 `material` theme。新接入建议在 `app.mount()` 之前通过导出的 helper 查看或切换 icon theme。旧的 `app.use(VueRendererMarkdown, { iconTheme })` 选项在 1.x 仍可用，但它会修改进程级全局状态，因此优先使用 helper。

```ts
import { getRegisteredThemes, setIconTheme } from 'markstream-vue'

console.log(getRegisteredThemes()) // ['material']
setIconTheme('material')
```

如果你需要接自己的图标包，可以继续使用 `registerIconTheme()` 注册。

按需启用重型依赖：

```ts
import { enableKatex, enableMermaid } from 'markstream-vue'
import 'markstream-vue/index.css'
import 'katex/dist/katex.min.css'

// 安装对应 peer 后再启用
enableMermaid()
enableKatex()
```

<details>
<summary>可选：CDN Worker（KaTeX / Mermaid）</summary>

如果你是用 CDN 引入 KaTeX，并且希望公式在 Web Worker 中渲染（不打包 / 不安装可选 peer），可以注入一个“CDN 加载 KaTeX”的 worker：

```ts
import { createKaTeXWorkerFromCDN, setKaTeXWorker } from 'markstream-vue'

const { worker } = createKaTeXWorkerFromCDN({
  mode: 'classic',
  // worker 内通过 importScripts() 加载的 UMD 构建
  katexUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js',
  mhchemUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/mhchem.min.js',
})

if (worker)
  setKaTeXWorker(worker)
```

如果你是用 CDN 引入 Mermaid，并且希望 Mermaid 的解析在 worker 中进行（用于渐进式 Mermaid 渲染的后台解析），可以注入 Mermaid parser worker：

```ts
import { createMermaidWorkerFromCDN, setMermaidWorker } from 'markstream-vue'

const { worker } = createMermaidWorkerFromCDN({
  // Mermaid CDN 构建通常是 ESM，推荐 module worker。
  mode: 'module',
  workerOptions: { type: 'module' },
  mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
})

if (worker)
  setMermaidWorker(worker)
```

</details>

<details>
<summary>Nuxt 快速接入</summary>

```ts
// plugins/markstream-vue.client.ts
import { defineNuxtPlugin } from '#app'
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component('MarkdownRender', MarkdownRender)
})
```

然后在页面中直接使用 `<MarkdownRender :content=\"md\" />`。

</details>

## 🛠️ 常用命令

- `pnpm dev` — playground 开发
- `pnpm play:nuxt` — Nuxt playground 开发
- `pnpm build` — 构建库与 CSS
- `pnpm build:analyze` — 带可视化报告的构建（输出 `bundle-visualizer.html`、`bundle-visualizer-tailwind.html`）
- `pnpm size:check` — 本地执行 dist + npm 包体积预算检查（与 CI 一致）
- `pnpm test` — Vitest 测试（快照用 `pnpm test:update`）
- `pnpm typecheck` / `pnpm lint` — 类型检查与 Lint

## ⏱️ 30 秒流式接入

用 SSE / WebSocket 结合内置平滑节奏渲染 Markdown：

```ts
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const final = ref(false)

eventSource.onmessage = (event) => {
  content.value += event.data
}
eventSource.addEventListener('done', () => {
  final.value = true
})

// template
// <MarkdownRender
//   :content="content"
//   :final="final"
//   :max-live-nodes="0"
//   :batch-rendering="true"
//   :render-batch-size="16"
//   :render-batch-delay="8"
//   :render-batch-budget-ms="4"
//   :fade="false"
//   :typewriter="true"
// />
```

`smooth-streaming` 在打字机/增量模式（`typewriter` 或 `max-live-nodes <= 0`）默认开启；如果希望严格按原始 chunk 节奏显示，可按实例设置 `:smooth-streaming="false"`。

按页面需要切换渲染风格：

- 虚拟化窗口（默认）：长文档滚动平稳、内存稳定。
- 增量批次：将 `:max-live-nodes="0"`，获得更明显的“打字机”体验与轻量占位。

<details>
<summary>进阶：SSR / Worker / 流式续写</summary>

### SSR / Worker（确定性输出）

在服务端或 Worker 预解析 Markdown，前端直接渲染节点：

```ts
// server or worker
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# Hello\n\n服务端解析一次', md)
// 将 nodes JSON 下发到客户端
```

> 注意：`parseMarkdownToStructure` 默认是 `streamParse: 'auto'`：兼容的 `md` 实例会在非 final 顶层解析时使用 `md.stream.parse`，并保留最近一次 source/token cache。final 一次性解析默认走普通 parser；需要强制 stream 时传 `{ streamParse: true }`，需要关闭时传 `{ streamParse: false }`。如果复用同一个 `md` 解析互不相关的一次性文档，请传 `{ final: true }` 或 `{ streamParse: false }`。

```vue
<!-- client -->
<MarkdownRender :nodes="nodesFromServer" />
```

这样可以避免前端解析，保持 SSR/水合的一致性。

### 混合模式：SSR + 流式续写

- 服务端：解析首批 Markdown，序列化 `initialNodes`（以及 `initialMarkdown`，便于后续流式追加）。
- 客户端：用相同的解析配置水合，然后继续流式追加：

```ts
import type { ParsedNode } from 'markstream-vue'
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'
import { ref } from 'vue'

const nodes = ref<ParsedNode[]>(initialNodes)
const buffer = ref(initialMarkdown)
const md = getMarkdown() // 与服务端保持一致

function addChunk(chunk: string) {
  buffer.value += chunk
  nodes.value = parseMarkdownToStructure(buffer.value, md)
}
```

这样无需重新解析 SSR 内容，同时还能通过 SSE/WebSocket 持续追加后续片段。

> 提示：当你明确知道流已结束（消息已完整）时，建议用 `parseMarkdownToStructure(buffer.value, md, { final: true })` 或在组件上设置 `:final="true"`，以关闭解析器的中间态（loading）策略，避免末尾残留分隔符（如 `$$`、未闭合 code fence）导致永久 loading。

</details>

## ⚙️ 性能模式

- **默认虚拟化窗口**：保持 `max-live-nodes` 默认值（`320`），渲染器会立即渲染当前窗口的节点，同时只保留有限数量的 DOM 节点，实现平滑滚动与可控内存，占位骨架极少。
- **增量流式模式**：当需要更明显的“打字机”体验时，将 `:max-live-nodes="0"`。这会关闭虚拟化并启用 `batchRendering` 系列参数控制的增量渲染，新的节点会以小批次加上占位骨架的形式进入视图。

可根据页面类型选择最合适的模式：虚拟化适合长文档/回溯需求，增量流式适合聊天或 AI 输出面板。

> 小贴士：聊天场景可使用 `max-live-nodes="0"`，并将 `renderBatchSize` 调小（如 `16`），`renderBatchDelay` 设为较小值（如 `8ms`），获得平滑的“打字”节奏且避免大段跳变。如需限制单帧 CPU，可适当调低 `renderBatchBudgetMs`。

## 🧰 关键属性速览

- `content` 与 `nodes`：传原始 Markdown 或预解析节点（来自 `parseMarkdownToStructure`）。
- `max-live-nodes`：`320`（默认虚拟化）或 `0`（增量批次）。
- `batchRendering`：用 `initialRenderBatchSize`、`renderBatchSize`、`renderBatchDelay`、`renderBatchBudgetMs` 微调批次。
- `enableMermaid` / `enableKatex`：用于（重新）启用重型依赖或自定义 loader（可与 `disableMermaid` / `disableKatex` 配合）。
- `parse-options`：在组件上复用解析钩子（如 `preTransformTokens`、`requireClosingStrong`）。
- `final`：标记“最终态/流结束”，关闭中间态 loading 解析并强制收敛未闭合结构。
- `custom-html-tags`：扩展流式 HTML 白名单并将这些标签输出为自定义节点，便于 `setCustomComponents` 直接映射（如 `['thinking']`）。
  声明过的自定义节点会尽量让 `content`/`raw` 保留原始标签 payload，`children` 则仍作为富文本场景下的 Markdown 渲染结果。
- `setCustomComponents(customId?, mapping)`：为自定义标签/标记注册内嵌 Vue 组件（传 `custom-id` 可限定作用域）。

示例：将 Markdown 占位符映射到 Vue 组件（作用域）

```ts
import { setCustomComponents } from 'markstream-vue'

setCustomComponents('docs', {
  CALLOUT: () => import('./components/Callout.vue'),
})

// Markdown: [[CALLOUT:warning title="提示" body="具体内容"]]
```

渲染时使用同一个 `custom-id`：

```vue
<MarkdownRender
  :content="doc"
  custom-id="docs"
/>
```

解析钩子示例（服务端/客户端保持一致）：

```vue
<MarkdownRender
  :content="doc"
  :parse-options="{
    requireClosingStrong: true,
    preTransformTokens: (tokens) => tokens,
  }"
/>
```

## 🔥 适用场景

- AI / 聊天界面：Markdown token 通过 SSE/WebSocket 持续抵达，要求无闪烁与稳定内存。
- 文档、变更日志、知识库：需要即时加载，同时保持长内容滚动的流畅性。
- 流式 diff / 代码审查：`stream-diffs` 增量更新让大代码块也能跟上变更。
- 图表与示意：Mermaid 渐进式渲染，避免阻塞主渲染。
- Markdown 驱动的界面中嵌入 Vue 组件（callout、交互式挂件、CTA 等）。

## ❓ 快问快答

- Mermaid / KaTeX 不显示？安装对应 peer（`mermaid` / `katex`），并传入 `:enable-mermaid="true"` / `:enable-katex="true"` 或调用 loader 设置函数。如果你是用 CDN `<script>` 引入，库也会自动读取 `window.mermaid` / `window.katex`。
- CDN + KaTeX worker：如果你不打包 `katex` 但仍希望公式在 worker 中渲染（不占主线程），可以用 `createKaTeXWorkerFromCDN()` 创建一个“CDN 加载 KaTeX”的 worker，然后通过 `setKaTeXWorker()` 注入。
- 体积问题：可选 peer 不会被打包，CSS 只需导入一次；增强代码块仅在安装了 `stream-diffs` 时按需加载其运行时。低频语言图标已拆分为异步 chunk 并按需加载；如果希望避免首次命中图标回退，可在空闲时调用 `preloadExtendedLanguageIcons()` 预热。
- 自定义 UI：通过 `setCustomComponents`（全局或作用域）注册组件，在 Markdown 中放置占位标记并映射到 Vue 组件。

## 🆚 为什么选择 markstream-vue，而不是普通 Markdown 渲染器？

| 需求 | 普通 Markdown 预览 | markstream-vue |
| --- | --- | --- |
| 流式输入 | 全量重渲染、易闪烁 | 虚拟窗口 + 增量批次 |
| 大代码块 | 重新高亮速度慢 | `stream-diffs` File/Diff 界面 |
| 图表 | 解析/渲染阻塞 | Mermaid 渐进式渲染与回退 |
| 自定义 UI | 插槽有限 | Markdown 内嵌 Vue 组件与类型化节点 |
| 长文档 | 内存峰值高 | 可配置 live-node 上限，滚动稳定 |

## 🗺️ Roadmap（快照）

- 更多「即开即用」模板（Vite / Nuxt / Tailwind）与 StackBlitz 更新。
- 代码块预设扩展（stream-diffs 的 diff 友好主题）。
- AI / 聊天场景的 Cookbook（SSE/WebSocket、重试与续传、Markdown 中间态处理）。
- 展示更多在 Markdown 中嵌入 Vue 组件的示例与实践。

## 📦 发布

- 最新版本与升级提示：[Releases](https://github.com/Simon-He95/markstream-vue/releases)
- 完整历史：[CHANGELOG.md](./CHANGELOG.md)
- 最新亮点（0.0.3-beta.1/beta.0）：
  - 解析器升级到 `stream-markdown-parser@0.0.36`，修复多项解析问题。
  - Monaco 升级，更多语言/主题，代码块对 diff 更友好。
  - Playground 增加 HTML/SVG 预览对话框与 AST 调试视图。

## 🧭 案例与展示

用 markstream-vue 做了什么？欢迎提 PR 把你的项目放到这里（附链接 + 截图/GIF）。理想场景：AI/聊天界面、流式文档、diff/代码审查、或在 Markdown 驱动页面中嵌入 Vue 组件。

- **FlowNote** —— 流式 Markdown 笔记示例（SSE + 虚拟化窗口）：https://markstream-vue.simonhe.me/
- **AI Chat 场景** —— playground “test” 页展示增量批次与分享链接：https://markstream-vue.simonhe.me/test

## 介绍视频

一段短视频介绍了 markstream-vue 的关键特性与使用方式。

[![在 Bilibili 查看介绍](https://i1.hdslb.com/bfs/archive/f073718bd0e51acaea436d7197880478213113c6.jpg)](https://www.bilibili.com/video/BV17Z4qzpE9c/)

在 Bilibili 上观看： [Open in Bilibili](https://www.bilibili.com/video/BV17Z4qzpE9c/)

## 核心特性

- ⚡ 极致性能：为流式场景设计的最小化重渲染和高效 DOM 更新
- 🌊 流式优先：原生支持不完整或频繁更新的 token 化 Markdown 内容
- 🧠 增强代码块：`stream-diffs` File/Diff 界面，支持语法高亮与 diff 交互
- 🪄 渐进式 Mermaid：图表在语法可用时即时渲染，并在后续更新中完善
- 🧩 自定义组件：允许在 Markdown 内容中嵌入对应框架组件
- 📝 完整 Markdown 支持：表格、公式、Emoji、复选框、代码块等
- 🔄 实时更新：支持增量内容而不破坏格式
- 📦 TypeScript 优先：提供完善的类型定义与智能提示
- 🔌 默认配置：各框架入口开箱即可接入
- 🎨 增强代码块渲染：`stream-diffs` File/Diff 界面（`CodeBlockNode`），未安装该 peer 时回退为普通 `<pre>`
- 🧰 解析工具集：[`stream-markdown-parser`](./packages/markdown-parser) 文档现已覆盖如何在 Worker/SSE 流中复用解析器、直接向 `<MarkdownRender :nodes>` 输送 AST、以及注册全局插件/数学辅助函数的方式。

## 🙌 贡献与社区

- 阅读贡献指南与 PR 模板：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 遵守 [行为准则](./CODE_OF_CONDUCT.md)。
- 提交 Issue 时使用模板；渲染问题尽量附上测试页复现链接：https://markstream-vue.simonhe.me/test
- 有问题先讨论：https://github.com/Simon-He95/markstream-vue/discussions
- 实时交流：Discord https://discord.gg/vkzdkjeRCW
- 新手贡献入口：[good first issues](https://github.com/Simon-He95/markstream-vue/labels/good%20first%20issue)
- 支持与求助入口：[SUPPORT.md](./SUPPORT.md)
- 提交 PR 时遵循 Conventional Commits，渲染/解析改动补充测试，UI 改动附上截图/GIF。
- 如果本项目对你有帮助，欢迎点 Star、分享给需要的人，助力项目持续演进。
- 安全披露：请通过 [SECURITY.md](./SECURITY.md) 中的邮件私下报告潜在漏洞。

### 快速参与的方式

- 在现有 issue 中补充复现链接/截图。
- 完善文档或示例（尤其是流式 + SSR/Worker 场景）。
- 分享 playground/test 链接，展示性能边界或有趣用法。

## 故障排查 & 常见问题

详细故障排查与常见问题已迁移至文档站点：
https://markstream.simonhe.me/zh/guide/troubleshooting

如需更多帮助，请到 GitHub Issues 创建问题：
https://github.com/Simon-He95/markstream-vue/issues

### 快速提交问题

1. 在测试页复现并点击“生成分享链接”：https://markstream-vue.simonhe.me/test
2. 打开 Bug 模板并附上链接与截图：https://github.com/Simon-He95/markstream-vue/issues/new?template=bug_report.yml

## 鸣谢

### 贡献者

感谢所有为项目做出贡献的开发者！

[![Contributors](https://contrib.rocks/image?repo=Simon-He95/markstream-vue)](https://github.com/Simon-He95/markstream-vue/graphs/contributors)

### 依赖项目

本项目使用并受益于：

- [stream-diffs](https://github.com/Simon-He95/stream-diffs)
- [mermaid](https://mermaid-js.github.io/mermaid)
- [katex](https://katex.org/)
- [markdown-it-ts](https://github.com/Simon-He95/markdown-it-ts)

感谢这些项目的作者与贡献者！

## Star 历史

<a href="https://www.star-history.com/?repos=Simon-He95%2Fmarkstream-vue&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=Simon-He95/markstream-vue&type=date&theme=dark&legend=top-left&sealed_token=oiafYphghH0h961owHCFNFaR0L-JLBGtz32cp6MzwDedAoLK1xZH2zXybrkS9K0UId_2yfG7DCuEtg91Gd--indbsAu5KEVbEf7Py-5YiI-V_Howl9Ho6g">
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=Simon-He95/markstream-vue&type=date&legend=top-left&sealed_token=oiafYphghH0h961owHCFNFaR0L-JLBGtz32cp6MzwDedAoLK1xZH2zXybrkS9K0UId_2yfG7DCuEtg91Gd--indbsAu5KEVbEf7Py-5YiI-V_Howl9Ho6g">
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=Simon-He95/markstream-vue&type=date&legend=top-left&sealed_token=oiafYphghH0h961owHCFNFaR0L-JLBGtz32cp6MzwDedAoLK1xZH2zXybrkS9K0UId_2yfG7DCuEtg91Gd--indbsAu5KEVbEf7Py-5YiI-V_Howl9Ho6g">
  </picture>
</a>

## 许可

[MIT](./license) © [Simon He](https://github.com/Simon-He95)
