---
title: 长 AI 回答渲染与虚拟化
description: 使用 Markstream 的虚拟化渲染处理长 AI 回答（50 KB 以上）。有界的 live 节点、视口感知的重型块和可预测的内存占用。
lastUpdated: 2026-07-01
keywords:
  - 长 AI 回答渲染器
  - 虚拟化 Markdown 渲染器
  - 大型 Markdown 文档渲染
  - 长上下文 LLM Markdown
  - 视口感知 Markdown
  - 有界 live 节点
faq:
  - question: 长 AI 回答何时需要 Markdown 虚拟化？
    answer: 当回复经常超过数十 KB、包含大量块，或导致滚动和布局工作变得明显时，请启用虚拟化。
  - question: 单条长消息必须使用 virtual-scroll 吗？
    answer: 通常不需要。先使用节点级虚拟化；virtual-scroll 用于协调多条消息的外层时间线虚拟化器。
  - question: 离屏的 Mermaid 或 Monaco 块仍会立即渲染吗？
    answer: 当启用视口优先级和 defer-until-visible 路径时不会。重型块可以保持空闲，直到接近视口为止。
---
# 长 AI 回答渲染与虚拟化

AI“推理”模型和长上下文 LLM 可以产生数十或数百 KB 的 Markdown 回复。传统渲染器难以应对这种体量——而 Markstream 的虚拟化能保持 UI 响应。

## 长 AI 回答的问题所在

当一个 AI 生成 100 KB 且包含代码块、表格和图表的 Markdown 回复时：

1. **DOM 节点爆炸**：每个段落、列表项和内联元素都变成一个 DOM 节点
2. **内存线性增长**：100 KB 的 Markdown 可能产生 5000+ 个 DOM 节点
3. **重型块成倍增加**：多个 Mermaid 图、代码块和数学表达式同时渲染
4. **滚动性能下降**：浏览器布局引擎难以处理成千上万个节点

## Markstream 的虚拟化

Markstream 使用视口感知渲染来约束 live DOM 节点的数量：

```vue
<MarkdownRender
  :content="longResponse"
  :final="isDone"
  node-virtual="auto"
  :max-live-nodes="200"
/>
```

- `node-virtual`：在此文档内启用节点级虚拟化
- `max-live-nodes`：同时渲染的最大节点数（默认取决于模式）
- 视口外的节点被替换为轻量级占位符
- 用户滚动时，节点进入和离开视口

`virtual-scroll` 是用于外层时间线虚拟化器（例如聊天消息列表）的高级协议。大多数用户应当使用 `node-virtual` 和 `max-live-nodes`，而不是直接启用 `virtual-scroll`。

## 视口感知的重型块

Mermaid 图、Monaco 代码块和其他重型块在屏幕外时保持空闲：

```vue
<MarkdownRender
  :content="longDoc"
  viewport-priority
  :defer-nodes-until-visible="true"
/>
```

- `viewport-priority`：重型块只在接近视口时渲染
- `defer-nodes-until-visible`：视口外的节点使用最少资源
- 用户向 Mermaid 图滚动时，它会激活并渲染

## 模式与虚拟化

不同的渲染器模式有不同的虚拟化默认值：

| 模式 | 虚拟化 | 最适合 |
| --- | --- | --- |
| `chat` | 轻量，默认不虚拟化 | 短到中等的聊天消息 |
| `docs` | 默认启用虚拟化 | 长技术文档 |
| `minimal` | 与 chat 相同，中性名称 | 非聊天界面、轻量场景 |

对于可能含有长回复的 AI 聊天，你可以把 chat 模式的节奏与 docs 模式的虚拟化结合起来：

```vue
<MarkdownRender
  mode="chat"
  :content="longResponse"
  :final="isDone"
  smooth-streaming="auto"
  :fade="false"
  node-virtual="auto"
  :max-live-nodes="300"
/>
```

## 性能基准

下面这些数字是用于规划的说明性目标。在把性能数字作为发版标准之前，请先在目标设备上运行 `pnpm benchmark:1.0`，并使用 [1.0 基准报告](/zh/guide/benchmark-1-0) 获取可复现的发版门禁方法论。

| 内容大小 | 无虚拟化 | 有虚拟化 |
| --- | --- | --- |
| 10 KB（短聊天） | ~200 个 DOM 节点，流畅 | ~200 个 DOM 节点，流畅 |
| 50 KB（长回答） | ~1000 个 DOM 节点，轻微延迟 | ~300 个 live 节点，流畅 |
| 100 KB（推理） | ~2500 个 DOM 节点，明显延迟 | ~300 个 live 节点，流畅 |
| 1 MB（技术文档） | 可能冻结浏览器 | ~500 个 live 节点，可滚动 |

## 何时需要虚拟化

出现以下情况时启用虚拟化：
- AI 回复经常超过 20 KB
- 用户反馈长对话中滚动卡顿
- 回复包含多个 Mermaid 图或代码块
- 应用运行在内存有限的移动设备上

可以跳过虚拟化的情况：
- 回复总是很短（< 10 KB）
- 你想要最简单的设置
- 目标设备是内存充足的桌面端

## 参见

- [Vue AI 聊天 Markdown 渲染器](/zh/use-cases/vue-ai-chat-markdown-renderer)
- [LLM token 流 Markdown](/zh/use-cases/llm-token-stream-markdown)
- [AI 聊天流式 Markdown](/zh/use-cases/ai-chat-streaming)
- [流式 Mermaid 与 KaTeX](/zh/use-cases/streaming-mermaid-katex)
- [性能指南](/zh/guide/performance)
