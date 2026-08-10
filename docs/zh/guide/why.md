---
title: 为什么使用 markstream-vue
description: 说明为什么选择 markstream-vue：渐进式 Mermaid、流式 diff 代码块与大文档优化，适配实时 AI 与长文档场景。
keywords:
  - 为什么选择
  - 流式 Markdown
  - 渐进式渲染
---

# 为什么使用 markstream-vue

- 渐进式 Mermaid：图表可逐步渲染，用户更早看到结果。
- 流式 diff 代码块：随着数据到达即时显示 diff，反馈迅速。
- 针对大文档进行了优化：减少 DOM 更新与内存占用，适合实时/大型文档场景。

此库特别适用于实时 AI 驱动或大文档场景，在这些场景下静态 Markdown 管道可能会造成延迟或 UX 崩溃。
