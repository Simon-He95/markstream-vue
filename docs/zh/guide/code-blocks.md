# 代码块渲染

## 概述

代码块渲染有三种策略，取决于你安装的可选依赖与配置：

- Monaco（推荐，用于大型/交互式代码块）：安装并使用 `stream-monaco`，提供类似编辑器的流式增量渲染体验。库在运行时按需懒加载 `stream-monaco`。
- Markdown 模式（基于流式 Markdown 渲染）：安装 `stream-markdown`，并通过 `setCustomComponents` 覆盖 `code_block` 节点来提供基于 Markdown 的代码块渲染器。
- 回退（无额外依赖）：如果两个可选包均未安装，代码块会退回为普通的 `<pre><code>` 渲染（仅基础样式 / 无 Monaco 功能）。

## Monaco（推荐）

- 安装：

```bash
pnpm add stream-monaco
# or
npm i stream-monaco
```

- 行为：当 `stream-monaco` 可用时，内置的 `CodeBlockNode` 会使用基于 Monaco 的流式更新，适合大型或频繁更新的代码块。

- Vite Worker 注意事项：Monaco 与部分基于 Worker 的功能需要在打包时正确配置 Worker（例如 Vite 的 worker 配置），以确保运行时能加载对应的 worker。有关配置示例与 SSR 安全初始化，请参阅 [/zh/nuxt-ssr](/zh/nuxt-ssr)。
- 另请参阅：[/zh/guide/monaco](/zh/guide/monaco)，其中包含 Vite `?worker` 示例和手动注册 worker 的代码片段。

## Markdown 模式（使用 stream-markdown）

- 安装：

```bash
pnpm add stream-markdown
# or
npm i stream-markdown
```

- 通过 `setCustomComponents` 覆盖 `code_block` 节点以注册 Markdown 风格的代码块渲染器。示例：

```ts
import { setCustomComponents } from 'markstream-vue'
import MyMarkdownCodeBlock from './MyMarkdownCodeBlock.vue'

setCustomComponents({ code_block: MyMarkdownCodeBlock })
```

设置后，基于 Markdown 的渲染器（来自 `stream-markdown` 或你自定义的组件）将用于 `code_block` 节点。

## 回退

若未安装上述任一可选包，渲染器会回退为简单的 `pre`/`code` 表现。

## 参考链接

- Worker / SSR 指南：[/zh/nuxt-ssr](/zh/nuxt-ssr)
- 安装说明：[/zh/guide/installation](/zh/guide/installation)
