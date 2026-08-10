---
title: markstream-react 与 react-markdown 静态基线对比
description: 对比 markstream-react 和 react-markdown 在静态 React Markdown、remark/rehype 插件链、迁移成本，以及流式 AI 聊天是否需要流式优先渲染器中的取舍。
ogImage: /og/comparison.png
ogImageAlt: markstream-react 与 react-markdown 对比
lastVerified: '2026-06-12'
faq:
  - question: 应该把 react-markdown 换成 markstream-react 吗？
    answer: 当你需要 LLM 流式输出、未闭合 Markdown、长回答或渐进重型块时可以迁移；短静态内容或成熟 remark/rehype 链路可以继续用 react-markdown。
  - question: markstream-react 和 react-markdown 的插件模型一样吗？
    answer: 不一样。markstream-react 使用 Markstream 的渲染器和 parser 模型，不是 react-markdown 的 remark/rehype 插件管线。
  - question: react-markdown 仍然值得用吗？
    answer: 值得。对于静态 React Markdown 和成熟插件生态，react-markdown 仍然是合适选择。
keywords:
  - react-markdown 对比
  - 静态渲染
  - 流式 AI 聊天
---

# markstream-react 与 react-markdown 静态基线对比

> 最后核验：2026-06-12。竞品能力可能变化；本页聚焦架构和公开文档行为，不把能力差异写成永久结论。

本页把 `react-markdown` 作为静态 React Markdown 基线。直接对比 React 流式 Markdown 竞品时，优先看 [markstream-react 与 Streamdown 对比](/zh/compare/streamdown)。

`react-markdown` 是成熟的 React Markdown 渲染器，适合短静态内容、博客、README 预览和依赖 remark/rehype 插件生态的项目。`markstream-react` 面向 AI 聊天和流式 Markdown，重点是处理不断变化的内容、未闭合语法、长回答和渐进式重型块。

| 场景 | 推荐 |
| --- | --- |
| 静态博客、短说明、README 预览 | `react-markdown` |
| LLM token 流、SSE、WebSocket | `markstream-react` |
| 已有 remark/rehype 插件链 | 继续评估 `react-markdown` |
| Mermaid、KaTeX、流式代码块、长回答 | `markstream-react` |

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

迁移时最小步骤是：替换 import，添加 CSS，把 `<ReactMarkdown>{content}</ReactMarkdown>` 改成 `<MarkdownRender content={content} final={true} />`。流式场景再传入真实 `final`，并测试未闭合 code fence、表格、数学公式和长回答。

不适合迁移的情况：内容永远是短静态 Markdown、bundle 体积极敏感、或者项目已经深度依赖 `react-markdown` 的插件行为。

## 核验方式

最后核验：2026-06-12

核验来源：
- react-markdown README
- Markstream React 文档和包元数据
- 公开示例和本地 smoke reproduction

测试场景：
- 未闭合 code fence
- 部分表格
- 部分 KaTeX
- 超过 50 KB 的长回答
- `final=true` 收尾行为
