---
title: 流式 Mermaid 与 KaTeX
description: 使用 Markstream 在 AI 流式输出期间渲染渐进式 Mermaid 图和 KaTeX 数学公式。图表增量渲染，数学公式直到表达式完整才渲染。
lastUpdated: 2026-07-01
keywords:
  - 流式 Mermaid 渲染器
  - 流式 KaTeX Markdown
  - AI 生成 Mermaid
  - 渐进式图表渲染
  - worker Mermaid 渲染
  - worker KaTeX 渲染
faq:
  - question: 在完整代码 fence 闭合之前，Mermaid 图能渲染吗？
    answer: 可以。Markstream 能渐进式解析可渲染的 Mermaid 前缀，让用户在最终 chunk 到达之前就看到有用的图表输出。
  - question: 为什么 KaTeX 在流式期间有时要等待？
    answer: 部分数学公式往往还不是有效的 KaTeX，因此 Markstream 会推迟渲染，直到行内或块级表达式完整为止。
  - question: Mermaid 和 KaTeX peer 必须一起安装吗？
    answer: 不需要。只安装你的 AI 输出需要的可选 peer，并且只为启用的重型块配置 worker。
---
# 流式 Mermaid 与 KaTeX

AI 模型越来越多地在回复中输出 Mermaid 图和 KaTeX 数学公式。在流式期间渲染这些内容——而不是等回复完成后——能带来更好的用户体验。

## 渐进式 Mermaid 渲染

当 LLM 流式输出 Mermaid 图时，Markstream 会增量渲染它：

```
Chunk 1:  ```mermaid
Chunk 2:  flowchart LR
Chunk 3:    Input --> Parser
Chunk 4:    Parser --> Renderer
Chunk 5:    Renderer --> Output
Chunk 6:  ```
```

每到一个 chunk，Markstream 都解析可用的 Mermaid 语法并渲染部分图表。用户看到的是图表逐渐成形，而不是等待闭合 fence。

### 安装

```bash
pnpm add markstream-vue mermaid
```

```ts
import { setMermaidWorker } from 'markstream-vue'
import MermaidWorker from 'markstream-vue/workers/mermaidParser.worker?worker&inline'

setMermaidWorker(new MermaidWorker())
```

### 配置

```vue
<MarkdownRender
  :content="streamingContent"
  :final="isDone"
  :is-dark="isDark"
  :mermaid-props="{
    renderDebounceMs: 180,
    contentStableDelayMs: 500,
    showHeader: true,
    showFullscreenButton: true,
  }"
/>
```

## 流式 KaTeX 数学公式

KaTeX 数学公式（`$inline$` 和 `$$block$$`）在流式期间出现：

```
Chunk 1:  The formula is $
Chunk 2:  The formula is $E = mc
Chunk 3:  The formula is $E = mc^2$
```

Markstream 会检测部分数学块并推迟渲染，直到表达式完整为止，从而避免 KaTeX 错误。

### 安装

```bash
pnpm add markstream-vue katex
```

```ts
import { setKaTeXWorker } from 'markstream-vue'
import KatexWorker from 'markstream-vue/workers/katexRenderer.worker?worker&inline'
import 'katex/dist/katex.min.css'

setKaTeXWorker(new KatexWorker())
```

## 为什么 worker 很重要

Mermaid 和 KaTeX 是 CPU 密集型任务。在 Web Worker 中运行它们：

- 在流式期间保持主线程响应
- 当图表在每个 chunk 上重新渲染时，防止 UI 卡顿
- 支持并行渲染多个图表

不使用 worker 时，解析一个复杂的 Mermaid 图可能阻塞 UI 50-200ms——这在流式期间是可以感知到的。

## 框架专属的 worker 设置

下面的 `?worker` 导入示例适用于兼容 Vite 的打包器。在 Next.js 中，请遵循 [Next.js 指南](/zh/frameworks/next)，并把仅浏览器端的 worker 设置放在客户端边界之后。

### React

```tsx
import { setKaTeXWorker, setMermaidWorker } from 'markstream-react'
import KatexWorker from 'markstream-react/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-react/workers/mermaidParser.worker?worker&inline'

setMermaidWorker(new MermaidWorker())
setKaTeXWorker(new KatexWorker())
```

### Svelte

```svelte
<script lang="ts">
  import { setMermaidWorker, setKaTeXWorker } from 'markstream-svelte'
  import MermaidWorker from 'markstream-svelte/workers/mermaidParser.worker?worker&inline'
  import KatexWorker from 'markstream-svelte/workers/katexRenderer.worker?worker&inline'

  setMermaidWorker(new MermaidWorker())
  setKaTeXWorker(new KatexWorker())
</script>
```

### Angular

```ts
import { setKaTeXWorker, setMermaidWorker } from 'markstream-angular'
import KatexWorker from 'markstream-angular/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-angular/workers/mermaidParser.worker?worker'

setMermaidWorker(new MermaidWorker())
setKaTeXWorker(new KatexWorker())
```

## 可选 peer

Mermaid、KaTeX、Monaco、D2 和 Infographic 是**可选 peer**。只安装你的 AI 输出需要的：

```bash
# 仅 Mermaid（无数学公式）
pnpm add mermaid

# 仅 KaTeX（无图表）
pnpm add katex

# 两者都要
pnpm add mermaid katex

# 所有重型 peer
pnpm add mermaid katex stream-monaco @terrastruct/d2 @antv/infographic
```

安装 peer 后，Markstream 的默认 loader 可以自动解析它。`enableMermaid()` 和 `enableKatex()` 用于重新启用或替换可选依赖 loader；`setMermaidWorker()` 和 `setKaTeXWorker()` 注入离线程（off-thread）的 worker 客户端。如果某个 peer 未安装或 loader 被禁用，该功能会回退，而不是通过 Mermaid 或 KaTeX 渲染。

## 参见

- [AI 聊天流式 Markdown](/zh/use-cases/ai-chat-streaming)
- [SSE 与 WebSocket 流式渲染](/zh/use-cases/sse-websocket)
- [长 AI 回答](/zh/use-cases/long-ai-responses)
