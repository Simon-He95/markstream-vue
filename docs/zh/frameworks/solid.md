---
title: SolidJS 流式 Markdown 渲染器
description: 使用原生 markstream-solid 在 SolidJS 1.9 项目中渲染 AI 聊天、SSE/WebSocket、未闭合代码围栏、Mermaid、KaTeX 和自定义组件，支持 SSR、hydration 与长会话虚拟状态恢复。
keywords:
  - markstream-solid
  - SolidJS 流式 Markdown 渲染器
  - SolidJS AI 聊天 Markdown
  - Solid Markdown SSR
  - Solid Mermaid KaTeX
faq:
  - question: markstream-solid 支持哪个 Solid 版本？
    answer: 要求 SolidJS 1.9，使用原生 Solid 组件、signal、accessor 和 context。
  - question: 现在能从 npm 安装 markstream-solid 吗？
    answer: 当前是工作区预览包。可先运行仓库 playground，或一起打包 parser、core 和 Solid 后在独立应用中使用。
  - question: 流式输出必须先解析 nodes 吗？
    answer: 普通流式输入使用累计 content 和 final 标记。只有当应用已经接管 parser 或 AST 时才传 nodes。
  - question: markstream-solid 支持 SSR 和 hydration 吗？
    answer: 支持。条件导出提供服务端和浏览器构建，服务端完整输出，hydration 保留已有 DOM，异步增强在客户端初始化。
---

# SolidJS 流式 Markdown 渲染器

`markstream-solid` 使用原生 Solid 组件渲染持续增长的 Markdown。它与 Vue 3 共用 parser 和 core，覆盖平滑流、diff 预览、代码布局契约和图表工具。当前是工作区预览包，npm 发布前的接入方式见 [Solid 指南](/zh/guide/solid)。

## 适用场景

- SolidJS 1.9 应用中的 AI 聊天、SSE 或 WebSocket 输出
- 输入过程中的未闭合 Markdown 和代码围栏
- Mermaid、KaTeX、D2、infographic 和增强代码块
- 自定义 Solid 组件及请求级配置
- 长文档、虚拟会话历史、SSR 与 hydration

普通流式输出传累计 `content`，结束时设置 `final`。应用已经接管 AST 时使用非空 `nodes`；空数组回退到 `content`。

## 快速开始

运行仓库演示：

```bash
pnpm install
pnpm build:solid
pnpm play:solid
```

在已配置的 Solid 应用中使用：

```tsx
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, done: boolean }) {
  return <MarkdownRender mode="chat" content={props.content} final={props.done} />
}
```

在 JSX/accessor 中读取 props。[安装与编译配置](/zh/guide/solid#安装与环境要求) 介绍工作区／tarball 接入、Vite 和 TypeScript 设置。

## 可选功能

| Peer | 功能 |
| --- | --- |
| `stream-diffs` | 增强代码块和 diff；加载期间使用原生 pre |
| `katex` | 数学渲染，同时引入 `katex/dist/katex.min.css` |
| `mermaid` | Mermaid 图表 |
| `@terrastruct/d2` | D2 图表 |
| `@antv/infographic` | infographic，通过 `enableInfographic` 启用 |

普通 Markdown 不要求这些 peers。显式引入一份 renderer CSS；也提供像素和 Tailwind CSS 入口。

## Solid 绑定与成熟度

- `MarkstreamProvider` 隔离组件、翻译和语言图标。
- 回调和 JSX/render props 对应事件与代码头插槽。
- renderer ref 提供虚拟状态捕获／恢复和滚动方法。
- `MarkstreamVirtualTimeline` 提供原生 Solid 会话窗口。
- SSR 使用根包的条件导出，浏览器增强在客户端启动。
- 工作区预览已覆盖单测、SSR、独立消费者、浏览器、几何和性能验证。npm 包及线上 playground 尚未部署。

## 下一步

- [完整 Solid 指南](/zh/guide/solid)
- [Playground 使用说明](/zh/guide/playground#solid-playground)
- [线上 playground](https://markstream-solid.pages.dev/)：部署后可用
- [包 README](https://github.com/Simon-He95/markstream-vue/tree/main/packages/markstream-solid)
