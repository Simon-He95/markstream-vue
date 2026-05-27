---
description: 按任务组织的 markstream-vue 指南，帮助你在安装、流式渲染、VitePress 文档站、组件覆盖和迁移之间快速找到正确入口。
---

# 指南

这份文档优先按“用户任务”组织，而不是默认要求你从第一页看到最后一页。先从和你当前问题最接近的入口开始。

## 我想先把它跑起来

- [安装](/zh/guide/installation)：先按场景装对 peer 依赖，并理顺 CSS 顺序。
- [快速开始](/zh/guide/quick-start)：最小 Vue 3 示例。
- [使用与流式渲染](/zh/guide/usage)：决定该用 `content` 还是 `nodes`。
- [文档站与 VitePress 集成](/zh/guide/vitepress-docs-integration)：把文档页、`enhanceApp`、可信标签和 CSS 顺序串起来。
- [AI 聊天与流式输出](/zh/guide/ai-chat-streaming)：当页面持续更新时，一次看完 peers、解析、性能和排障。
- [按症状排查](/zh/guide/troubleshooting-path)：先判断问题属于样式、peers、SSR，还是自定义标签接法。
- [Props 与选项](/zh/guide/props)：已经能跑，只是需要调配置。

## 我想做业务定制

- [API 参考](/zh/guide/api)：解析器工具、作用域覆盖和渲染流程入口。
- [渲染器与节点组件](/zh/guide/components)：导出的渲染器和节点组件参考。
- [覆盖内置组件](/zh/guide/component-overrides)：替换 `image`、`code_block`、`mermaid`、`link` 等内置节点。
- [自定义标签与高级组件](/zh/guide/custom-components)：支持 `thinking` 这类可信标签。
- [YAML Front Matter Cookbook](/zh/guide/frontmatter-cookbook)：提取页面 metadata，或先转换成可信自定义标签再渲染。
- [高级解析](/zh/guide/advanced) 与 [解析器 API](/zh/guide/parser-api)：需要 token / AST 级改造时再看。

## 我想接入到现有项目里

- [Nuxt SSR](/zh/nuxt-ssr)：处理浏览器专属依赖和 `ClientOnly`。
- [AI / Skills 工作流](/zh/guide/ai-workflows)：复制即用的任务模板、skill 清单和迁移提示词。
- [从 react-markdown 迁移](/zh/guide/react-markdown-migration) 与 [迁移 Cookbook](/zh/guide/react-markdown-migration-cookbook)：适合 React 团队。
- [故障排除](/zh/guide/troubleshooting)：安装能跑但样式、SSR 或 peers 出问题时先看。

## 框架入口

### Vue 3 (markstream-vue) ⭐ 推荐

| 页面 | 描述 |
|------|------|
| [安装](/zh/guide/installation) | 只安装你真正需要的依赖组合 |
| [快速开始](/zh/guide/quick-start) | 渲染第一篇 Markdown |
| [使用与流式渲染](/zh/guide/usage) | 决定 `content` 与 `nodes` 的接入方式 |
| [文档站与 VitePress 集成](/zh/guide/vitepress-docs-integration) | 文档页、`enhanceApp`、可信标签与 CSS 顺序的一站式路径 |
| [AI 聊天与流式输出](/zh/guide/ai-chat-streaming) | 适合聊天 UI、SSE 与逐 token 输出的场景路径 |
| [API 参考](/zh/guide/api) | 解析器工具、作用域覆盖和渲染流程入口 |
| [渲染器与节点组件](/zh/guide/components) | 渲染器和节点组件总览 |
| [自定义](/zh/guide/component-overrides) | 覆盖内置组件与扩展自定义标签 |
| [YAML Front Matter](/zh/guide/frontmatter-cookbook) | 提取 metadata，或映射到可信自定义标签 |

### Vue 2 (markstream-vue2)

| 页面 | 描述 |
|------|------|
| [安装](/zh/guide/vue2-installation) | Vue 2 专用安装 |
| [快速开始](/zh/guide/vue2-quick-start) | Vue 2 示例 |
| [组件与 API](/zh/guide/vue2-components) | Vue 2 组件参考 |

### React (markstream-react)

| 页面 | 描述 |
|------|------|
| [安装](/zh/guide/react-installation) | React 专用安装 |
| [快速开始](/zh/guide/react-quick-start) | React 示例 |
| [React 组件](/zh/guide/react-components) | React 渲染器和节点组件 |
| [从 react-markdown 迁移](/zh/guide/react-markdown-migration) | 面向现有 React Markdown 项目的迁移路径 |
| [迁移 Cookbook](/zh/guide/react-markdown-migration-cookbook) | 常见迁移场景的 before/after 示例 |

### Angular (markstream-angular)

| 页面 | 描述 |
|------|------|
| [安装](/zh/guide/angular-installation) | Angular 专用安装 |
| [快速开始](/zh/guide/angular-quick-start) | standalone Angular 示例 |

### Svelte (markstream-svelte)

| 页面 | 描述 |
|------|------|
| [快速开始](/zh/guide/svelte) | Svelte 5-only 渲染器、workers 与自定义组件示例 |

### Nuxt

- [Nuxt SSR 指南](/zh/nuxt-ssr)：处理客户端边界、workers 和浏览器专属 peers。
