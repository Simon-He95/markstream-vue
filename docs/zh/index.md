---
layout: home
title: 'Markstream：面向 AI 应用的流式 Markdown 渲染器'
titleTemplate: false
description: 面向 AI 应用的多框架流式 Markdown 渲染器家族，支持 Vue、React、Svelte、Angular、Nuxt 和 Next.js。处理 LLM token 流、SSE/WebSocket 输出、AI 聊天、长文档、渐进式 Mermaid、KaTeX 和流式代码块。
keywords:
  - 流式 Markdown 渲染器
  - AI 聊天 Markdown 渲染器
  - LLM token 流 Markdown
  - SSE Markdown 渲染
  - WebSocket Markdown 渲染
  - 未闭合 Markdown
  - Vue 流式 Markdown
  - React 流式 Markdown
  - Mermaid 渐进渲染
  - 长回答 Markdown 渲染
hero:
  name: Markstream
  text: 面向 AI 应用的流式 Markdown 渲染器
  tagline: Vue • React • Svelte • Angular • Nuxt • Next.js
  image:
    src: /markstream-hero.webp
    alt: markstream-vue 流式 Markdown playground 插画
  actions:
    - theme: brand
      text: 选择框架
      link: /zh/frameworks/
    - theme: alt
      text: 按任务找入口
      link: /zh/guide/
    - theme: alt
      text: 接入与迁移
      link: /zh/guide/ai-workflows
features:
  - title: 先装对依赖
    details: 按文档站、聊天应用、`stream-diffs` 增强代码块、图表型内容来选择最小 peer 依赖组合。
    link: /zh/frameworks/
  - title: 选对接入方式
    details: 一次性渲染、VitePress 文档站、SSE 或 token 流式输出，推荐的接法并不一样。
    link: /zh/guide/usage
  - title: 先找对 API 层级
    details: 查解析器钩子和作用域时看 API 参考；已经知道组件名时看渲染器与节点组件。
    link: /zh/guide/api
  - title: 覆盖内置组件
    details: 用带作用域的方式替换 `image`、`code_block`、`mermaid`、`link` 等节点渲染器。
    link: /zh/guide/component-overrides
  - title: 扩展自定义标签
    details: 把 `thinking` 这类 HTML-like 标签直接变成自定义节点，而不是自己重写解析器。
    link: /zh/guide/custom-components
  - title: 更平滑地迁移
    details: 从现有 Markdown 方案迁移时，先看哪些能力可以直迁，哪些地方要换思路。
    link: /zh/guide/react-markdown-migration
  - title: 更好地和 AI 协作
    details: 提供适合 Codex、Cursor、Claude Code 等工具的任务模板和 skill 清单。
    link: /zh/guide/ai-workflows
---

适用于 AI 应用的多框架流式 Markdown 渲染器家族，支持 Mermaid 渐进渲染、流式代码块对比和高性能大文档处理 — 覆盖 Vue、React、Svelte、Angular、Nuxt 和 Next.js。

## 先走最短路径

| 如果你现在想解决的是... | 先看这里 | 然后看 |
| --- | --- | --- |
| 把第一段渲染跑起来 | [框架选择](/zh/frameworks/) | [多框架快速开始](/zh/quick-start) |
| 接到文档站或 VitePress 主题里 | [文档站与 VitePress 集成](/zh/guide/vitepress-docs-integration) | [自定义标签与高级组件](/zh/guide/custom-components) |
| 接入流式输出 / SSE | [AI 聊天与流式输出](/zh/guide/ai-chat-streaming) | [性能](/zh/guide/performance) |
| 接入坏了但还不知道是哪一层出问题 | [按症状排查](/zh/guide/troubleshooting-path) | [排查问题](/zh/guide/troubleshooting) |
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
- 如果你用的是可读仓库的助手，再配合 [LLM 推荐上下文](/llms.zh-CN.txt)、[完整 LLM 参考](/llms-full.zh-CN.txt) 或 [仓库 agent 上下文](/llms.zh-CN)。

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
| Angular (`markstream-angular`) | [Angular 流式 Markdown 渲染器](/zh/frameworks/angular) | 你使用 standalone Angular 组件 | [在线演示](https://markstream-angular.pages.dev/) |
| Svelte (`markstream-svelte`) | [Svelte 流式 Markdown 渲染器](/zh/frameworks/svelte) | 你使用 Svelte 5，并希望复用一致的渲染 API 和 worker 路径 | [在线演示](https://markstream-svelte.pages.dev/) |

## 常用入口

- [API 参考](/zh/guide/api)：解析器工具、作用域覆盖和渲染流程入口
- [渲染器与节点组件](/zh/guide/components)：导出的渲染器和节点组件参考
- [按症状排查](/zh/guide/troubleshooting-path)：先做第一轮定位，再进入对应深度页面
- [故障排除](/zh/guide/troubleshooting)：CSS/reset 顺序、依赖项和常见问题
- [功能特性](/zh/guide/features)：流式渲染、Mermaid、`stream-diffs`、KaTeX 等能力总览
- [站内搜索](/zh/guide/search)：直接搜索页面、组件名和关键字
- [LLM 推荐上下文](/llms.zh-CN.txt)、[完整 LLM 参考](/llms-full.zh-CN.txt)、[仓库 agent 上下文](/llms.zh-CN)：给可读仓库的助手提供项目地图

<SupportQRCodes
  title="支持 Markstream"
  description="如果 Markstream 对你的工作有帮助，欢迎通过支付宝或微信支持项目的持续维护。"
  note="感谢你的支持，这会帮助文档、演示和包维护持续迭代。"
  alipay-label="支付宝"
  wechat-label="微信收款"
/>

## 文档是怎么组织的

- `开始使用` 先解决接入问题：安装、快速开始、流式接法、Props。
- `自定义` 负责解决业务扩展：覆盖组件、自定义标签、解析器钩子、样式与排障。
- `功能专题` 现在默认折叠，主要放代码块、Mermaid、KaTeX、D2、`stream-diffs` 增强代码块等深水区内容。
- `框架与迁移` 适合你已经明确框架或迁移目标之后再进入。
