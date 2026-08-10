---
title: 解析器与 API
description: 介绍 markstream-vue 基于 markdown-it-ts 的解析器与 API，涵盖 getMarkdown、parseMarkdownToStructure 与 token 变换钩子。
keywords:
  - 解析器 API
  - markdown-it
  - token 钩子
---

# 解析器与 API

本项目基于 `markdown-it-ts`，提供了适用于流式渲染的解析器与钩子：

- `getMarkdown()` — 创建并配置 `markdown-it-ts` 实例
- `parseMarkdownToStructure(content, md)` — 将 Markdown 转换为 Parser 节点树（用于 `MarkdownRender`）
- 支持 `preTransformTokens` / `postTransformTokens` 等钩子以定制解析行为
- 支持流式内联 HTML（`html_inline`）无抖动：吞并半截标签并自动补闭合（保留 `loading` 状态）。

（完整示例与 API 请参见英文版 `/guide/parser` 或中文版 `/zh/guide/parser`，或内部 `packages/markdown-parser/README.md`）
