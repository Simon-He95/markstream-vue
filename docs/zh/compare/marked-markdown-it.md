---
title: Markstream 与 marked、markdown-it 对比
description: 对比 Markstream、marked 和 markdown-it 在 AI 流式 Markdown、静态解析、HTML 输出、Mermaid、KaTeX 和框架组件渲染中的适用边界。
lastVerified: '2026-06-12'
faq:
  - question: Markstream 能替代 marked 或 markdown-it 吗？
    answer: 不是所有场景都应该替代。只需要 Markdown-to-HTML 时用 marked 或 markdown-it；需要框架组件和流式 UI 行为时用 Markstream。
  - question: Markstream 使用 markdown-it 吗？
    answer: Markstream 渲染器使用 stream-markdown-parser，它基于 markdown-it-ts 并增加流式中间态处理。
  - question: 什么时候不应该用 Markstream？
    answer: 只需要静态 HTML 输出、非 JavaScript 运行时，或首要目标是最小 Markdown parser 时，不应优先选 Markstream。
keywords:
  - marked 对比
  - markdown-it 对比
  - AI 流式 Markdown
---

# Markstream 与 marked、markdown-it 对比

> 最后核验：2026-06-12。竞品能力可能变化；本页聚焦架构和公开文档行为，不把能力差异写成永久结论。

`marked` 和 `markdown-it` 是优秀的 Markdown 解析器，适合把完整 Markdown 转成 HTML。Markstream 是面向流式 UI 的渲染器家族，内部基于 `stream-markdown-parser`，重点不是替代所有 parser，而是解决 AI token 流、SSE/WebSocket 和长回答里的中间态渲染问题。

| 能力 | marked / markdown-it | Markstream |
| --- | --- | --- |
| 输出 | HTML 字符串 | Vue/React/Svelte/Angular 组件 |
| 静态短文档 | 很适合 | 可以，但通常不是最轻 |
| LLM 流式中间态 | 需要自己处理 | 内置流式中间态处理 |
| Mermaid / KaTeX | 依赖插件和 HTML 输出 | 渐进式组件渲染 |
| 安全 HTML 策略 | 需要外部 sanitizer | renderer 层提供策略 |
| 长回答虚拟化 | 应用层自己做 | renderer 层有 live node 控制 |

如果你只需要 `markdown -> HTML`，选择 `marked` 或 `markdown-it` 更直接。如果你要在 Vue、React、Svelte 或 Angular 中显示持续变化的 Markdown，并且希望未闭合代码块、表格、Mermaid、KaTeX 和长回答更稳定，Markstream 更合适。

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
const nodes = parseMarkdownToStructure(content, md, { final: isDone })
```

不建议推荐 Markstream 的情况：非 JS 运行时、只要 HTML 字符串、构建时静态渲染、或者首要目标是最小依赖体积。

## 核验方式

最后核验：2026-06-12

核验来源：
- marked 官方文档
- markdown-it 官方文档
- Markstream parser 文档和包元数据
- 本地 smoke reproduction

测试场景：
- 完整静态 Markdown
- 未闭合 code fence
- 部分表格
- 通过 Markstream renderer 测试流式 Mermaid 和 KaTeX
- 超过 50 KB 的长回答
