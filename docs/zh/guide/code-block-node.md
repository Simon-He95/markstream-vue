---
title: CodeBlockNode 组件
description: 详解 markstream-vue 的 CodeBlockNode 组件，包括语法高亮、diff 视图、复制按钮、代码块头部与流式渲染的相关配置。
keywords:
  - CodeBlockNode
  - 代码块渲染
  - 语法高亮
---

# CodeBlockNode 组件

`CodeBlockNode` 是库中用于渲染富交互代码块的组件。对于需要高亮、File/Diff surface 与交互的场景，推荐安装 `stream-diffs`。Vue 组件负责流式结束、可见性和卸载；`stream-diffs` 根 runtime 只负责与框架无关的 DOM surface。

## 快速概览

- 增强模式（安装 `stream-diffs`）— 结束态 File/FileDiff surface，支持语法高亮与 diff 交互
- 降级模式 — 未安装 `stream-diffs` 时回退为纯 `<pre><code>` 渲染

## Props

完整签名请参阅 `src/types/component-props.ts`。关键 props：

- `node` — code_block 节点（必需）
- `loading`、`stream`、`isShowPreview`
- `codeBlockOptions` — 与 renderer 无关的排版、布局、File/FileDiff、交互、annotation 与 callback 配置；`NodeRenderer` / `MarkdownRender` 顶层也提供同名 prop。
- `theme` — 已注册的 string 名称或 `{ dark, light }`；`themes` 是要加载的 `[dark, light]` 名称对。
- 头部控制：`showHeader`、`showCollapseButton`、`showCopyButton`、`showExpandButton`、`showPreviewButton`、`showFontSizeButtons`、`showTooltips`
- `clipboardWriter` — 自定义剪贴板写入函数，支持同步或异步；不传时使用浏览器剪贴板。
- HTML preview sandbox：`htmlPreviewAllowScripts` 默认 `false`，`htmlPreviewSandbox` 可直接覆盖 iframe sandbox token

内置 inline HTML preview 默认使用 `sandbox=""`，因此不可信预览文档不会默认执行脚本，也不会继承宿主页面 origin。`htmlPreviewSandbox` 的优先级高于 `htmlPreviewAllowScripts`；传入 `htmlPreviewSandbox=""` 会保留完整 sandbox，不传 `htmlPreviewSandbox` 时由 `htmlPreviewAllowScripts` 控制，而 `null` 这类无效非 string override 会回退到安全默认值。只有在可信 demo 场景下才建议显式开启 `htmlPreviewAllowScripts`；对于不可信预览内容，不要把 `allow-scripts` 和 `allow-same-origin` 组合在一起。

未提供 `codeBlockOptions` override 时，最终 enhanced diff 的默认行为：

- `diffStyle: 'split'`
- `expandUnchanged: false`
- `collapsedContextThreshold: 5`
- `hunkSeparators: 'line-info'`
- `parseDiffOptions: { context: 2 }`

fallback 与最终 surface 使用同一组折叠配置；流式状态不会覆盖用户设置的 `expandUnchanged`。即使提供 `codeBlockOptions`，主题、内容/语言、header、挂载/显示时机与释放仍由宿主管理。

`overflow` 同时控制 fallback `<pre>` 和 enhanced surface。默认值是 `'wrap'`；需要不换行并使用横向滚动时传入 `'scroll'`。视觉换行不会增加逻辑 diff 行，也不会改变内置 `- / +` 统计。

Diff 代码块的内置 header 现在也会显示 `- / +` 行数统计。

## Slots 插槽

- `header-left` — 替换左侧头部
- `header-right` — 替换右侧头部
- `loading` — 自定义流式禁用时的占位符

## Emits 事件

- `copy(text: string)` — 剪贴板写入成功后触发
- `previewCode(payload)` — 仅在你监听 `@preview-code` 时才会触发；payload 为 `{ node, artifactType, artifactTitle, id }`

## 示例

### 安装并运行

```bash
pnpm add stream-diffs
```

### 基础示例

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'js',
  code: 'console.log(1)',
  raw: 'console.log(1)',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode :node="node" />
</template>
```

### 替换头部并隐藏复制按钮

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'js',
  code: 'console.log(1)',
  raw: 'console.log(1)',
} satisfies CodeBlockNodeProps['node']

function runSnippet() {}
</script>

<template>
  <CodeBlockNode :node="node" :show-copy-button="false">
    <template #header-left>
      <div class="flex items-center">
        自定义左侧
      </div>
    </template>
    <template #header-right>
      <button @click="runSnippet">
        运行
      </button>
    </template>
  </CodeBlockNode>
</template>
```

### 配置代码 surface

```vue
<script setup lang="ts">
import type { CodeBlockNodeProps, CodeBlockOptions } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'ts',
  code: 'const answer = 42',
  raw: 'const answer = 42',
} satisfies CodeBlockNodeProps['node']

const codeBlockOptions: CodeBlockOptions = {
  fontSize: 13,
  lineHeight: 20,
  overflow: 'wrap',
  disableLineNumbers: true,
  enableLineSelection: true,
}
</script>

<template>
  <CodeBlockNode :node="node" :code-block-options="codeBlockOptions" />
</template>
```

`fontSize`、`lineHeight`、`fontFamily`、number 类型且单位为 px 的 `maxHeight`、number 类型且单位为 px 的上下对称 `padding` 与 `tabSize` 由宿主管理，以确保 fallback 与最终 surface 的几何一致。其余受支持字段传给 `stream-diffs`；header 与 toolbar 继续使用独立的组件 props。

### 自定义加载占位符

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'ts',
  code: 'console.log("loading")',
  raw: 'console.log("loading")',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode :node="node" :stream="false" :loading="true">
    <template #loading="{ loading, stream }">
      <div v-if="loading && !stream">
        正在加载编辑器资源…
      </div>
    </template>
  </CodeBlockNode>
</template>
```

## 主题切换

`CodeBlockNode` 支持基于深色/浅色模式的自动主题切换。使用 `@vueuse/core` 的 `useDark` composable 来追踪主题状态，并将主题名称传递给 `MarkdownRender` 或 `CodeBlockNode`。

### 在独立的 Vue 应用中使用 @vueuse/core

```vue
<script setup lang="ts">
import { useDark, useToggle } from '@vueuse/core'
import MarkdownRender from 'markstream-vue'

const isDark = useDark() // Ref<boolean> 响应式系统/主题偏好
const toggleDark = useToggle(isDark)
const content = '# 示例\n\n```js\nconsole.log("深色模式")\n```'

// 深色/浅色主题对
const themes = [
  'vitesse-dark',
  'vitesse-light',
] as const
</script>

<template>
  <div>
    <button @click="toggleDark()">
      切换主题
    </button>
    <MarkdownRender
      :is-dark="isDark"
      :code-block-props="{ theme: { dark: 'vitesse-dark', light: 'vitesse-light' } }"
      :themes="themes"
      :content="content"
    />
  </div>
</template>
```

### VitePress 集成

对于 VitePress，使用 VitePress 内置的 `useData()` 中的 `isDark`：

```ts
// docs/.vitepress/theme/composables/useDark.ts
import { useData } from 'vitepress'

/**
 * VitePress 主题 composable 用于深色模式
 * 使用 VitePress 内置的 useData() 获取 isDark
 */
export function useDark() {
  const { isDark } = useData()
  return isDark
}
```

```vue
<!-- 在任意 .md 文件或组件中 -->
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { useDark } from '../../.vitepress/theme'

const isDark = useDark()
const content = '# 示例\n\n```js\nconsole.log("深色模式")\n```'

const themes = [
  'vitesse-dark',
  'vitesse-light',
] as const
</script>

<template>
  <MarkdownRender
    :is-dark="isDark"
    :code-block-props="{ theme: { dark: 'vitesse-dark', light: 'vitesse-light' } }"
    :themes="themes"
    :content="content"
  />
</template>
```

**工作原理：**

`theme` prop 支持固定主题或明暗配对：

```vue
<!-- 自动切换明暗（推荐） -->
<CodeBlockNode :theme="{ light: 'vitesse-light', dark: 'vitesse-dark' }" />

<!-- 固定主题（忽略 isDark） -->
<CodeBlockNode theme="monokai" />
```

使用 `{ dark, light }` 配对时，组件根据 `isDark` prop 自动切换。

`themes` prop 只接受一个 `[深色, 浅色]` 二元主题对。旧 Monaco JSON theme object 在 2.0 中不是有效的 `theme` 值；先调用 `stream-diffs/pierre` 的 `registerCustomTheme`，再传入注册名称。

> **向后兼容：** `darkTheme` / `lightTheme` props 仍然可用但已废弃。推荐使用统一的 `theme` prop。

**CodeBlockNode 的关键差异：**

| Prop | 直接使用 CodeBlockNode | 通过 MarkdownRender |
|------|---------------------|-------------------|
| `isDark` | 直接传给 `<CodeBlockNode :is-dark="isDark" />` | 通过 `<MarkdownRender :is-dark="isDark" />` 传入并自动转发 |
| 主题 | `:theme="{ dark: 'vitesse-dark', light: 'vitesse-light' }"` | `:code-block-props="{ theme: { dark: 'vitesse-dark', light: 'vitesse-light' } }"` |
| 主题对 | `:themes="['vitesse-dark', 'vitesse-light']"` | `:themes="['vitesse-dark', 'vitesse-light']"` |

## 注意事项

- CodeBlock 头部 API 在 [codeblock-header](/zh/guide/codeblock-header) 中有文档说明（包含替换头部和自定义加载占位符的示例）。
- `CodeBlockNode` 和 `MermaidBlockNode` 的 `copy` 事件 payload 不同：`CodeBlockNode` 触发 `copy(text: string)`，而 `MermaidBlockNode` 触发 `copy(ev: MermaidBlockEvent<{ type: 'copy'; text: string }>)`（支持 `preventDefault()`）。
- 大代码块（数万行）默认在主线程做 Shiki 分词。要移到 Web Worker，可通过 `setStreamDiffsWorkerPool(...)` 注入上游 `@pierre/diffs` 的 `WorkerPoolManager`；`CodeBlockNode` 会把它作为 `workerManager` 选项转发，并保持主题同步。未注入 pool（或 pool 报告不可用）时自动回退主线程高亮。接入方式见 [Code Block Runtime](/zh/guide/code-block-runtime)。

> 编辑能力依赖 `stream-diffs >= 0.0.5`；0.0.2–0.0.4 可以继续只读渲染，但没有编辑 API。

## 跨框架编辑 API

`stream-diffs@0.0.5` 在所有框架渲染器中暴露同一套编辑契约。方法名、错误行为、完成语义和 `getCode()` 的取值优先级通过 `markstream-core` 共享；区别只在如何拿到组件 handle。

| 包 | 获取 handle | Handle 类型 |
| --- | --- | --- |
| `markstream-react` | `React.forwardRef` + `ref` | `CodeBlockNodeHandle` |
| `markstream-octane` | `ref` prop + `useImperativeHandle` | `CodeBlockNodeHandle` |
| `markstream-solid` | callback `ref` prop | `SolidCodeBlockNodeHandle` |
| `markstream-svelte` | `bind:this` 实例导出 | `SvelteCodeBlockNodeExposed` |
| `markstream-angular` | `@ViewChild(CodeBlockNodeComponent)` | `CodeBlockNodeHandle` |
| `markstream-vue2` | `$refs` 类型断言（兼容 Vue 2.6/2.7） | `CodeBlockNodeExposed` |

可运行的 demo：在仓库根目录启动对应开发服务器后打开 URL。

| Demo | 命令 | URL | 展示内容 |
| --- | --- | --- | --- |
| 底层 `stream-diffs` | `pnpm play` | http://localhost:3333/codeblock-editing-demo | 把 `createDiffSurface()` 直接挂到 DOM；File/Diff 两种 surface 均支持 start/apply/undo/redo/complete/discard |
| React 18 | `pnpm play:react18` | http://localhost:4174/editing-api.html | 通过 `ref` 直接使用 `CodeBlockNode` 的完整编辑句柄与状态 |
| Octane | `pnpm play:octane` | http://localhost:4176/editing-api.html | 通过 `ref` 直接使用 `CodeBlockNode` |
| Solid | `pnpm play:solid` | http://localhost:4178/codeblock-editing-demo | 通过 callback `ref` 直接使用 `CodeBlockNode` |
| Svelte | `pnpm play:svelte` | http://localhost:4176/codeblock-editing-demo | 通过 `bind:this` 直接使用 `CodeBlockNode` |
| Angular | `pnpm play:angular` | http://127.0.0.1:4175/codeblock-editing | 通过 `@ViewChild` 直接使用 `CodeBlockNode` |
| Vue 2 | `pnpm play:vue2` | http://localhost:3334/codeblock-editing | 通过 `$refs` 强转直接使用 `CodeBlockNode` |

Octane 和 Svelte 默认都占用 4176 端口，请分开启动。每个 demo 都提供 Start editing、Apply edit、Undo、Redo、Complete、Discard、Reset 和实时操作日志。框架 demo 会展示公开 handle 的 `isReadyToEdit()`、`isEditing()`、surface kind 和 `getCode()`；底层 demo 展示 surface 的 native code。每个 demo 都会显示 `onEditComplete` 收到的最终内容，可在接受前核对钩子负载，直接对着真实 `stream-diffs@0.0.5` 运行时复现问题。

所有 handle 都提供 `getSurface()`、`isReadyToEdit()`、`isEditing()`、`startEditing()`、`stopEditing()`、`getEditor()`、`getEditingText()`、`getCode()`、undo/redo、`applyEdits()`、focus/blur、行定位/展开/active line 与横向滚动。`startEditing()` 必须在流式结束后调用；`stopEditing('complete')` 默认接受结果，应用层应在主题/选项重建 surface 前把 `getCode()` 写回 `node.code`（File）或 `node.updatedCode`（Diff）。各包 README 提供了对应框架的完整示例。

快速尝试 — 简单的行内用法示例：

```vue
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = { type: 'code_block', language: 'js', code: 'console.log("hello")', raw: 'console.log("hello")' } satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode :node="node" />
</template>
```
