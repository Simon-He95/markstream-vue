---
title: 流式代码块渲染
description: 渲染 LLM token 流中的代码块，支持稳定的未闭合 fence、stream-diffs 增强表面、diff 感知更新以及移动端友好回退。
lastUpdated: 2026-07-01
keywords:
  - 流式代码块渲染器
  - AI 代码块 Markdown
  - LLM 代码 fence 渲染器
  - stream-diffs 代码块
faq:
  - question: 在闭合 fence 到达之前，Markstream 能渲染代码块吗？
    answer: 可以。它在流式期间保持未闭合 fence 可读，当 fence 足够完整时再升级到已配置的代码块渲染器。
  - question: AI 聊天应用应该对每个代码块都用增强表面吗？
    answer: 不一定。stream-diffs 适合大型或交互式代码块；对于只读聊天、移动端 WebView 或严格的包体预算，普通 pre 渲染可能更合适。
  - question: 应该如何测试流式代码块？
    answer: 用与生产环境流相同的节奏，测试未闭合 fence、语言标签变化、长代码块、diff fence 和快速 token 更新。
---
# 流式代码块渲染

代码 fence 是 AI 聊天中最明显的失败点之一。在生成期间，开始 fence 常常远早于闭合 fence 到达，语言标签或代码主体可能仍在变化。Markstream 把它当作一个流式状态来处理，而不是假定 Markdown 已经完整。

## 问题

静态 Markdown 渲染器可能让一个未完成的代码 fence 吞掉它下方的一切内容。在 AI 聊天中，这意味着在模型仍在书写时，普通段落、表格和后续文本可能暂时成为代码块的一部分。

````md
```ts
export function answer() {
  return "still streaming"
````

渲染器需要让这个状态保持可读，并避免在本应稳定之前产生昂贵的高亮器频繁重建。

## 渲染器选择

| 渲染器 | 最适合 | 说明 |
| --- | --- | --- |
| `CodeBlockNode`（通过 `stream-diffs`） | 交互式或大型代码块 | 增强 File / FileDiff 表面，支持语法高亮与 diff 交互 |
| 普通 `pre` | 移动端或严格包体预算 | 最可预测的回退 |

## 最小 Vue 设置

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

defineProps<{
  content: string
  isDone: boolean
}>()
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="content"
    :final="isDone"
    :fade="false"
  />
</template>
```

需要语法高亮与 diff 交互的增强表面时，安装可选 peer `stream-diffs`：

```bash
pnpm add stream-diffs
```

安装后，`CodeBlockNode` 会在 fence 足够完整并进入视口时挂载 File 或 FileDiff 表面。受支持的配置来自直接或 renderer 顶层 `codeBlockOptions`。未安装该 peer 时会自动回退为普通 `<pre><code>`。

对于移动端 WebView 或保守的包体，请使用普通 `pre` 渲染：

```vue
<MarkdownRender
  :content="content"
  :final="isDone"
  :render-code-blocks-as-pre="true"
/>
```

## 需要测试的流式状态

- 只有开始 fence 而没有闭合 fence
- 语言标签从空变为 `ts`、`tsx`、`vue` 或 `diff`
- 分小块流式传输的长代码块
- 含新增和删除行的 diff fence
- 在闭合 fence 到达之前，代码后跟着表格、Mermaid 或数学公式

流式尾部仅由 marker 组成的独占行，在更多输入到达前具有歧义。例如，三反引号闭合 fence 的前一个或两个反引号必须保持 pending，不能进入已渲染的代码内容：

```text
代码行                           代码行
代码行                           代码行
` 或 ``                 ->       （隐藏 pending 尾部）
```

如果随后到达非 marker 字符或新的一行，pending 文本会作为字面代码恢复。当 `final` 为 true 时，EOF 具有最终决定权，必须保留字面意义的 marker-only 内容。这条规则属于 parser 输出 contract，因此 plain `pre` 和所有 framework adapter 都会收到相同且稳定的 `code_block.code`。

## 性能说明

- 在渲染前批处理 token 更新；不要提交 SSE 或 WebSocket 流中的每个字节。
- 要减少动画开销时保持 `fade` 关闭。Vue 3 支持为代码块周围的文字及行内代码同时开启 smooth streaming 和 fade；围栏代码块不使用这套追加淡入。
- 当长回答包含许多代码块时，使用视口优先级或虚拟化。
- 如果移动端用户只需要阅读代码，优先使用 `render-code-blocks-as-pre`。

## 相关指南

- [代码块渲染](/zh/guide/code-blocks)
- [CodeBlockNode](/zh/guide/code-block-node)
- [代码块运行时](/zh/guide/code-block-runtime)
- [AI 聊天流式 Markdown](/zh/use-cases/ai-chat-streaming)
- [长 AI 回答](/zh/use-cases/long-ai-responses)
