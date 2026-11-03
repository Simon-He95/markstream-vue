---
title: '文档路径：选择你的路线'
description: 按任务组织的 Markstream 文档链接地图 — 按你想做的事、你的角色或你的框架选择最短路径，直接跳到对应的指南。
keywords:
  - markstream 文档路径
  - 选择接入路径
  - 框架入口
  - markstream 角色指南
---

# 文档路径

你不需要按顺序读完文档。找到匹配你处境的那一行，顺着链接走即可。如果都对不上，从[指南首页](/zh/guide/)开始。

## 先走最短路径

| 如果你现在想解决的是... | 先看这里 | 然后看 |
| --- | --- | --- |
| 把第一段渲染跑起来 | [框架选择](/zh/frameworks/) | [多框架快速开始](/zh/quick-start) |
| 接到文档站或 VitePress 主题里 | [文档站与 VitePress 集成](/zh/guide/vitepress-docs-integration) | [自定义标签与高级组件](/zh/guide/custom-components) |
| 接入流式输出 / SSE | [AI 聊天与流式输出](/zh/guide/ai-chat-streaming) | [性能](/zh/guide/performance) |
| 接入坏了但还不知道是哪一层出问题 | [按症状排查](/zh/guide/troubleshooting-path) | [排查问题](/zh/guide/troubleshooting) |
| 先看看某个组件渲染出来什么样 | [组件画廊](/zh/components/) | [渲染器与节点组件](/zh/guide/components) |
| 替换一个内置节点渲染器 | [覆盖内置组件](/zh/guide/component-overrides) | [渲染器与节点组件](/zh/guide/components) |
| 支持 `thinking` 这类可信标签 | [自定义标签与高级组件](/zh/guide/custom-components) | [API 参考](/zh/guide/api) |
| 做 parser / AST 级改造 | [API 参考](/zh/guide/api) | [解析器 API](/zh/guide/parser-api) |
| 借助 AI 做接入、迁移或排障 | [AI / Skills 工作流](/zh/guide/ai-workflows) | [从 react-markdown 迁移](/zh/guide/react-markdown-migration) |

## 按你的角色选入口

### 我是第一次接触 markstream

- 先看 [指南首页](/zh/guide/)，它是按任务组织的总入口。
- 如果你还在 Vue、React、Svelte、Angular、Nuxt 和 Next.js 之间选择，先看 [框架选择](/zh/frameworks/)。
- 如果你想先看到各框架最小示例，直接看 [多框架快速开始](/zh/quick-start)。
- 如果你想先看到最小 Vue 3 示例，直接看 [Vue 快速开始](/zh/guide/quick-start)。
- 想知道能渲染什么，逛逛 [组件画廊](/zh/components/)，每个节点都有实时预览。

### 我是在现有项目里接入

- 用 [使用与流式渲染](/zh/guide/usage) 决定该走 `content` 还是 `nodes`。
- 如果本质上是在做文档站、内容站或 VitePress 主题，优先走 [文档站与 VitePress 集成](/zh/guide/vitepress-docs-integration)。
- 如果页面会持续更新，优先走 [AI 聊天与流式输出](/zh/guide/ai-chat-streaming) 这条完整路径。
- 如果你还不知道到底是 CSS、peers、SSR 还是自定义标签的问题，先走 [按症状排查](/zh/guide/troubleshooting-path)。
- 如果安装能跑但页面效果不对，先看 [故障排除](/zh/guide/troubleshooting)。
- 如果是 Nuxt / SSR，优先看 [Nuxt SSR](/zh/nuxt-ssr)。

### 我是在做业务定制

- 已经知道目标组件时，看 [渲染器与节点组件](/zh/guide/components)。
- 需要安全替换内置节点时，看 [覆盖内置组件](/zh/guide/component-overrides)。
- 需要 parser hooks、AST 改造、作用域覆盖时，看 [API 参考](/zh/guide/api) 和 [解析器 API](/zh/guide/parser-api)。

### 我想借助 AI 提高效率

- 看 [AI / Skills 工作流](/zh/guide/ai-workflows)，里面有 skills、prompts 和推荐接入顺序。
- 如果你用的是可读仓库的助手，再配合 [LLM 推荐上下文](/llms.zh-CN.txt)、[完整 LLM 参考](/llms-full.zh-CN.txt)、[LLM 路由索引](/llms-routing.txt)（英文）或 [仓库 agent 上下文](/llms.zh-CN)。

## 选择你的框架

::: tip 框架支持
各框架共享同一套核心渲染思路，但入口页会因为 SSR、迁移路径和运行时差异而不同。
:::

| 框架 | 最适合先看的页面 | 适合什么情况 | 演示 |
| --- | --- | --- | --- |
| Vue 3 (`markstream-vue`) | [Vue 流式 Markdown 渲染器](/zh/frameworks/vue) | 你要走主线能力最完整的接入路径 | [在线演示](https://markstream-vue.simonhe.me/) |
| VitePress 文档站 | [文档站与 VitePress 集成](/zh/guide/vitepress-docs-integration) | 你要把渲染器嵌进文档页、内容站或自定义主题 | [在线演示](https://markstream-vue.simonhe.me/) |
| Nuxt | [Nuxt 流式 Markdown 渲染器](/zh/frameworks/nuxt) | 你需要处理 client-only 边界、SSR 和 worker | [在线演示](https://markstream-nuxt.pages.dev/) |
| Vue 2 (`markstream-vue2`) | [Vue 2 快速开始](/zh/guide/vue2-quick-start) | 你还在 Vue 2.6 / 2.7 环境 | [在线演示](https://markstream-vue2.pages.dev/) |
| React (`markstream-react`) | [React 流式 Markdown 渲染器](/zh/frameworks/react) | 你是 React 用户，或正从 `react-markdown` 迁移 | [在线演示](https://markstream-react.pages.dev/) |
| Next.js | [Next.js 流式 Markdown 渲染器](/zh/frameworks/next) | 你需要 App Router、Pages Router、SSR-first 或 server-only 渲染说明 | [在线演示](https://markstream-react.pages.dev/) |
| Octane (`markstream-octane`) | [Octane 包使用指南](https://github.com/Simon-He95/markstream-vue/tree/main/packages/markstream-octane) | 你使用 Octane 客户端或服务端 runtime，并已配置 compiler/Vite | [在线演示](https://markstream-octane.pages.dev/) |
| Angular (`markstream-angular`) | [Angular 流式 Markdown 渲染器](/zh/frameworks/angular) | 你使用 standalone Angular 组件 | [在线演示](https://markstream-angular.pages.dev/) |
| Svelte (`markstream-svelte`) | [Svelte 流式 Markdown 渲染器](/zh/frameworks/svelte) | 你使用 Svelte 5，并希望复用一致的渲染 API 和 worker 路径 | [在线演示](https://markstream-svelte.pages.dev/) |

## 常用入口

- [API 参考](/zh/guide/api)：解析器工具、作用域覆盖和渲染流程入口
- [渲染器与节点组件](/zh/guide/components)：导出的渲染器和节点组件参考
- [组件画廊](/zh/components/)：全部节点组件的可视化实时预览
- [按症状排查](/zh/guide/troubleshooting-path)：先做第一轮定位，再进入对应深度页面
- [故障排除](/zh/guide/troubleshooting)：CSS/reset 顺序、依赖项和常见问题
- [功能特性](/zh/guide/features)：流式渲染、Mermaid、`stream-diffs`、KaTeX 等能力总览
- [站内搜索](/zh/guide/search)：直接搜索页面、组件名和关键字
- [LLM 推荐上下文](/llms.zh-CN.txt)、[完整 LLM 参考](/llms-full.zh-CN.txt)、[LLM 路由索引](/llms-routing.txt)（英文）、[仓库 agent 上下文](/llms.zh-CN)：给可读仓库的助手提供项目地图
