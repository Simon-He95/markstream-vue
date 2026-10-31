---
title: SolidJS 流式 Markdown 接入指南
description: 在 SolidJS 1.9 项目中接入 markstream-solid，覆盖响应式流式输入、代码块和图表可选依赖、workers、自定义组件、SSR 与 hydration、长文档虚拟状态恢复及 playground 调试。
keywords:
  - markstream-solid 指南
  - SolidJS 流式 Markdown
  - SolidJS AI 聊天
  - Solid Markdown SSR
  - Solid playground
---

# SolidJS

`markstream-solid` 是原生 SolidJS 1.9 渲染器。它与 Vue 3 共用 Markstream parser 和框架无关的 core，使用 Solid 组件、signal、accessor、回调和 context 完成渲染。

[完整组件与 API 参考](/zh/guide/solid-api)

## 安装与环境要求

在 SolidJS 1.9 或 SolidStart 应用中安装：

```bash
pnpm add markstream-solid solid-js@^1.9
```

在本仓库运行 playground：

```bash
pnpm install
pnpm build:solid
pnpm play:solid
```

同一个 pnpm workspace 内的业务应用可通过 `workspace:*` 添加 `markstream-solid`，并安装 `solid-js@^1.9`。如需在独立应用中验证尚未发布的工作区修改，可以一起构建并打包 parser、core 和 Solid：

```bash
pnpm build:solid
mkdir -p .tmp/solid-pack
pnpm -C packages/markdown-parser pack --pack-destination "$PWD/.tmp/solid-pack"
pnpm -C packages/markstream-core pack --pack-destination "$PWD/.tmp/solid-pack"
pnpm -C packages/markstream-solid pack --pack-destination "$PWD/.tmp/solid-pack"
```

在消费应用中，通过产物目录的绝对路径安装这三个 `.tgz` 文件和 `solid-js@^1.9`。[独立消费者 smoke](https://github.com/Simon-He95/markstream-vue/blob/main/scripts/smoke-solid-package.mjs) 验证了无 Vue / React 的外部 TSX 应用和 SSR。

Vite 应用使用 `vite-plugin-solid` 编译自己的 TSX：

```ts
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid({ ssr: true })],
  worker: { format: 'es' },
})
```

TypeScript 配置使用 `"jsx": "preserve"` 和 `"jsxImportSource": "solid-js"`。SolidStart 由框架管理 Solid 编译配置。

## 首次渲染与 CSS

```tsx
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, done: boolean }) {
  return <MarkdownRender content={props.content} final={props.done} />
}
```

在 JSX 或 accessor 中读取响应式 props。默认导出、`MarkdownRender` 和 `NodeRenderer` 指向同一个组件。`content` 接收累计 Markdown；非空 `nodes` 数组直接渲染已有 AST，空数组则回退到 `content`。

在应用入口选择并引入一份渲染器样式：

| 样式入口 | 用途 |
| --- | --- |
| `markstream-solid/index.css` | 默认样式，作用域为 `.markstream-solid` |
| `markstream-solid/index.px.css` | 应用修改根字号时，保留像素尺寸 |
| `markstream-solid/index.tailwind.css` | 包提供的 Tailwind CSS 入口 |

数学渲染还需要 `katex/dist/katex.min.css`。JavaScript 入口不会自动注入渲染器 CSS。

## SSE 流式输入

下面的示例约定 SSE `message` 事件携带原始 Markdown 分片，结束时发送名为 `done` 的事件：

```tsx
import MarkdownRender from 'markstream-solid'
import { createSignal, onCleanup, onMount } from 'solid-js'
import 'markstream-solid/index.css'

export function StreamingMessage() {
  const [content, setContent] = createSignal('')
  const [final, setFinal] = createSignal(false)

  onMount(() => {
    const source = new EventSource('/api/chat')
    source.onmessage = (event) => {
      setContent(previous => previous + event.data)
    }
    source.addEventListener('done', () => {
      setFinal(true)
      source.close()
    })
    onCleanup(() => source.close())
  })

  return <MarkdownRender mode="chat" content={content()} final={final()} />
}
```

输入结束后设置 `final`；续流前先设回 `false`。替换字符串会重置平滑流，清空 `content` 可开始新的回答。JSON 等传输格式需要按业务 API 解码后再追加。

`smoothStreaming` 默认为 `'auto'`。通过 `smoothStreamingOptions`、`parseCoalesceMs`、`typewriter`（`true`、`false`、`'simple'`、`'precise'`）和 `fade` 配置节奏及显示效果。`useSmoothMarkdownStream()` 返回 `source()`、`visible()`、`done()`、`final()`、`snapshot()` 等 accessor，并随 Solid owner 清理。同一条流选择组件内置节奏或外部 controller 中的一种。

## 可选依赖与增强块

| 功能 | 可选 peer |
| --- | --- |
| 增强代码块和 diff | `stream-diffs` |
| 行内／块级数学 | `katex` |
| Mermaid 图表 | `mermaid` |
| D2 图表 | `@terrastruct/d2` |
| 信息图 | `@antv/infographic` |

只安装实际使用的 peers。未安装或仍在加载 `stream-diffs` 时，代码块使用原生 `<pre>`。代码字体、行号 gutter、padding 及 pre/highlight surface CSS 与 Vue 3 共用 core 契约。

```tsx
<MarkdownRender
  content={content()}
  final={final()}
  codeBlockLightTheme="vitesse-light"
  codeBlockDarkTheme="vitesse-dark"
  codeBlockProps={{ showLineNumbers: true, showCopyButton: true }}
  codeBlockOptions={{ overflow: 'wrap', diffStyle: 'unified', maxHeight: 500 }}
/>
```

`codeBlockProps` 控制代码头与工具栏；`codeBlockOptions` 配置 File/FileDiff runtime，其中 `padding` 和 `maxHeight` 使用数字 CSS 像素。`themes` 是注册主题名的 `[dark, light]` 二元组。`renderCodeBlocksAsPre` 可固定使用原生 pre 路径。独立 `CodeBlockNode` 支持 `headerLeft` / `headerRight` JSX 或 render 函数。

渲染 infographic 前启用 loader：

```ts
import { enableInfographic } from 'markstream-solid'

enableInfographic(() => import('@antv/infographic'))
```

## Workers

在 Vite 兼容的浏览器入口中，可在应用启动时统一注入 KaTeX 和 Mermaid workers：

```ts
import { setKaTeXWorker, setMermaidWorker } from 'markstream-solid'
import KatexWorker from 'markstream-solid/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-solid/workers/mermaidParser.worker?worker'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
```

SSR 项目把 worker 实例创建放在浏览器入口或 `onMount` 中。包也导出 worker client 和 CDN helper 子路径。宿主管理的高亮 worker pool 可通过 `setStreamDiffsWorkerPool` 注入；共享 runtime 选项见[代码块运行时](/zh/guide/code-block-runtime)。

## 自定义组件与作用域配置

```tsx
import type { NodeComponentProps } from 'markstream-solid'
import MarkdownRender, { MarkstreamProvider } from 'markstream-solid'

function Thinking(props: NodeComponentProps) {
  return <aside>{String(props.node.content ?? '')}</aside>
}

export function Answer(props: { content: string, done: boolean }) {
  return (
    <MarkstreamProvider
      components={{ thinking: Thinking }}
      defaultI18nMap={{ 'common.copy': '复制代码' }}
    >
      <MarkdownRender
        content={props.content}
        final={props.done}
        customHtmlTags={['thinking']}
      />
    </MarkstreamProvider>
  )
}
```

也可以使用局部 `customComponents`、带 `customId` 的 `setCustomComponents(id, mapping)` 或全局注册。SSR 请求专属配置使用 provider／局部配置。`streamingComponents` 接收 parser 节点，`htmlComponents` 接收清洗后的 HTML 输入。Vue 事件和 slots 对应 Solid 回调及 JSX/render props。

## HTML 预览与安全策略

`htmlPolicy` 支持 `'safe'`、`'trusted'` 和 `'escape'`，按输入来源选择[安全策略](/zh/guide/security)。HTML 预览通过 Portal 和 iframe 展示，默认使用空 sandbox。`codeBlockProps.htmlPreviewAllowScripts` 可允许脚本；显式 `htmlPreviewSandbox` 优先。`onHandleArtifactClick` 可把 HTML/SVG 预览交给宿主处理。

## 长文档与全量恢复

`mode="docs"` 默认启用分批、延迟和有上限的活动节点窗口。`mode="chat"`、`mode="minimal"` 使用聊天向默认值；显式 props 覆盖模式设置。

需要立即恢复完整 DOM 时使用：

```tsx
<MarkdownRender
  content={savedMarkdown}
  final
  smoothStreaming={false}
  batchRendering={false}
  maxLiveNodes={0}
  deferNodesUntilVisible={false}
  viewportPriority={false}
/>
```

长交互文档保留窗口，通过 `ref` 回调获取句柄来捕获和恢复虚拟状态：

```tsx
import type { MarkstreamRendererHandle, MarkstreamVirtualState } from 'markstream-solid'
import MarkdownRender from 'markstream-solid'

export function History(props: { content: string }) {
  let renderer!: MarkstreamRendererHandle
  let saved: MarkstreamVirtualState | null = null
  return (
    <>
      <button onClick={() => saved = renderer.captureVirtualState()}>Save position</button>
      <button onClick={() => saved && renderer.restoreVirtualState(saved, { restoreAnchor: true })}>Restore position</button>
      <MarkdownRender ref={handle => renderer = handle} content={props.content} final />
    </>
  )
}
```

恢复会校验节点签名、宽度、measurement key、session 和 thread。外层滚动容器通过 `virtualScroll` 协调；`MarkstreamVirtualTimeline` 和 `useMarkstreamVirtualAdapter` 提供原生 Solid 会话窗口及线程缓存。

## SSR 与 hydration

根入口通过 package conditions 选择服务端或浏览器构建。服务端输出完整文档，hydration 先保留已有 DOM，再应用客户端窗口。两端使用相同的初始 `content`、`final`，在 hydration 后续流。编辑器、图表和 workers 的异步增强在客户端初始化。

## Solid playground {#playground}

在仓库根目录运行 `pnpm play:solid`，打开 `http://localhost:4178`。页面沿用 Vue 3 playground 的结构，提供 Controls、TPS／随机分片、主题、源码编辑、暂停／继续、全量恢复、长文档及工具栏／HTML／SVG 示例。

`/line-number-handoff-check` 对照原生 pre 与高亮。添加 `?theme=dark&codeOverflow=scroll` 可检查深色横向滚动场景。

- [线上 playground](https://markstream-solid.pages.dev/)
- [Playground 使用说明](/zh/guide/playground#solid-playground)
- [Playground 源码](https://github.com/Simon-He95/markstream-vue/tree/main/playground-solid)
- [API 对齐与公共 core](https://github.com/Simon-He95/markstream-vue/blob/main/packages/markstream-solid/PARITY.md)
- [验证与性能数据](https://github.com/Simon-He95/markstream-vue/blob/main/packages/markstream-solid/VALIDATION.md)

Mermaid 分包使用文件 worker，保持 `worker.format="es"`，不要使用 inline Blob 模式。CDN 路径及完整参数见组件/API 参考。
