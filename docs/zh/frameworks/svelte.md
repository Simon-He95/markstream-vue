---
title: Svelte 5 流式 Markdown 渲染器
description: 使用 markstream-svelte 在 Svelte 5 / SvelteKit AI 聊天、LLM token 流、SSE/WebSocket、未闭合 Markdown、长文档、自定义组件、Mermaid、KaTeX 和 stream-diffs 增强代码块场景中渲染流式 Markdown。当前是 beta API，不支持 Svelte 4。
keywords:
  - markstream-svelte
  - Svelte 5 流式 Markdown 渲染器
  - SvelteKit 流式 Markdown
  - Svelte AI 聊天 Markdown
  - Svelte LLM Markdown 渲染器
  - Svelte SSE Markdown 渲染
  - Svelte WebSocket Markdown
  - Svelte 未闭合 Markdown 渲染
  - Svelte Mermaid Markdown
  - Svelte KaTeX Markdown
  - Svelte 自定义 Markdown 组件
  - Svelte 5 Markdown beta
softwareName: markstream-svelte
softwarePackage: markstream-svelte
npmPackage: markstream-svelte
softwareFramework: Svelte
softwareProgrammingLanguage:
  - TypeScript
  - Svelte
softwareRuntimePlatform:
  - Svelte 5
faq:
  - question: markstream-svelte 支持 Svelte 4 吗？
    answer: 不支持。markstream-svelte 要求 Svelte 5。
  - question: 什么场景适合 markstream-svelte？
    answer: Svelte 5 AI 聊天、SvelteKit SSE/WebSocket、长回答、自定义 Svelte 组件、平滑流式内容，以及需要渐进 Mermaid 或 KaTeX 的页面。
  - question: markstream-svelte 和 markstream-vue 一样成熟吗？
    answer: 不是。markstream-svelte 目前是 beta，比 Vue 渲染器更新。
  - question: Svelte 流式输出必须提前解析 nodes 吗？
    answer: 不需要。普通 LLM/SSE/WebSocket 流式输出优先使用原始 content 和 final 状态。只有当你的应用已经接管 parser 或 AST 状态时才使用 nodes。
  - question: markstream-svelte 会清洗不可信 Markdown 和 HTML 吗？
    answer: 渲染器默认使用 safe HTML policy，并对链接、图片、class 和 SVG 输出路径做安全处理。渲染不可信内容前仍需按你的业务威胁模型复核策略。
---

# Svelte 5 流式 Markdown 渲染器

`markstream-svelte` 是 Markstream 家族的 Svelte 5 渲染器，使用 Svelte 5 runes，并复用 Markstream 的流式解析、节点渲染、worker 和重型块处理思路。它适合 AI 聊天、SSE/WebSocket 输出、长回答、自定义 Svelte 组件和需要渐进 Mermaid/KaTeX 的页面。当前包仍是 beta，不能当作稳定 API 承诺使用。

**Svelte 4 不支持。** 如果你的项目还在 Svelte 4，先升级到 Svelte 5 或选择其它 Markdown 方案。

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let content = $state('')
  let final = $state(false)
</script>

<MarkdownRender {content} {final} fade={false} />
```

| 需求 | 说明 |
| --- | --- |
| AI 聊天输出 | 传 `content`、`final`，关闭 `fade` |
| 自定义组件 | 使用 Svelte 组件接管指定 Markdown 节点 |
| 移动端 WebView | 使用 `markstream-svelte/index.px.css` |
| Mermaid / KaTeX | 只在需要时安装 peer |
| 平滑流式输出 | `smoothStreaming="auto"` 可配合 `content` 路径处理 token-by-token 输出 |
| HTML 安全策略 | 默认 `htmlPolicy="safe"`，并处理链接、图片、class 和 SVG 输出路径 |

普通聊天流式输出优先传 `content` 和 `final`；只有当应用已经接管 parser 或 AST 状态时才传预解析的 `nodes`。

不适合的情况：Svelte 4、需要完全稳定 API、短静态 Markdown、或者你只需要构建时把 Markdown 转成 HTML。
