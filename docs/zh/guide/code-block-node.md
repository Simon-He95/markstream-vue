# CodeBlockNode 组件

`CodeBlockNode` 是库中用于渲染富交互代码块的组件。对于需要编辑/高亮/增量渲染的场景，推荐安装 `stream-monaco`。组件为头部提供灵活的自定义点（props + slots），并在常见场景下提供可拦截的事件。

## 快速概览

- Monaco 模式（安装 `stream-monaco`）— 类编辑器渲染，带 worker 支持
- 降级模式 — 未安装 `stream-monaco` 时会回退为纯 `<pre><code>` 渲染
- 如果你希望用 Shiki（不引入 Monaco），请使用 `MarkdownCodeBlockNode`（同伴依赖：`stream-markdown`）

## Props

完整签名请参阅 `src/types/component-props.ts`。关键 props：

- `node` — code_block 节点（必需）
- `loading`、`stream`、`isShowPreview`
- `monacoOptions` — 类型为 `CodeBlockMonacoOptions`，会透传给 `stream-monaco`
  - `diffHideUnchangedRegions`、`diffLineStyle`、`diffAppearance`、`diffUnchangedRegionStyle`、`diffHunkActionsOnHover`、`diffHunkHoverHideDelayMs`、`onDiffHunkAction` 这类 diff 配置都应该放这里
- 头部控制：`showHeader`、`showCollapseButton`、`showCopyButton`、`showExpandButton`、`showPreviewButton`、`showFontSizeButtons`、`showTooltips`
- HTML preview sandbox：`htmlPreviewAllowScripts` 默认 `false`，`htmlPreviewSandbox` 可直接覆盖 iframe sandbox token

内置 inline HTML preview 默认使用 `sandbox=""`，因此不可信预览文档不会默认执行脚本，也不会继承宿主页面 origin。`htmlPreviewSandbox` 的优先级高于 `htmlPreviewAllowScripts`；传入 `htmlPreviewSandbox=""` 会保留完整 sandbox，不传 `htmlPreviewSandbox` 时由 `htmlPreviewAllowScripts` 控制，而 `null` 这类无效非 string override 会回退到安全默认值。只有在可信 demo 场景下才建议显式开启 `htmlPreviewAllowScripts`；对于不可信预览内容，不要把 `allow-scripts` 和 `allow-same-origin` 组合在一起。

Monaco diff 模式下的默认行为：

- `diffHideUnchangedRegions: { enabled: true, contextLineCount: 2, minimumLineCount: 4, revealLineCount: 5 }`
- `diffLineStyle: 'background'`
- `diffAppearance: 'auto'`
- `diffUnchangedRegionStyle: 'line-info'`
- `diffHunkActionsOnHover: true`
- `diffHunkHoverHideDelayMs: 160`

你可以通过 `monacoOptions` 覆盖这些默认值。
当 preset 使用 `diffAppearance: 'auto'` 时，`CodeBlockNode` 会先根据当前明暗外观解析成实际的 light/dark，再传给 `stream-monaco`。

Diff 代码块的内置 header 现在也会显示 `- / +` 行数统计。

## Slots 插槽

- `header-left` — 替换左侧头部
- `header-right` — 替换右侧头部
- `loading` — 自定义流式禁用时的占位符

## Emits 事件

- `copy(text: string)` — 点击复制时触发
- `previewCode(payload)` — 仅在你监听 `@preview-code` 时才会触发；payload 为 `{ node, artifactType, artifactTitle, id }`

## 示例

### 安装并运行（Monaco 模式）

```bash
pnpm add stream-monaco
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

// 可用主题（必须包含你想要使用的主题）
const themes = [
  'vitesse-dark',
  'vitesse-light',
  'github-dark',
  'github-light',
  // ... 更多主题
]
</script>

<template>
  <div>
    <button @click="toggleDark()">
      切换主题
    </button>
    <MarkdownRender
      :is-dark="isDark"
      code-block-dark-theme="vitesse-dark"
      code-block-light-theme="vitesse-light"
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
  'github-dark',
  'github-light',
  // ... 更多主题
]
</script>

<template>
  <MarkdownRender
    :is-dark="isDark"
    code-block-dark-theme="vitesse-dark"
    code-block-light-theme="vitesse-light"
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

<!-- 主题对象（固定，忽略 isDark） -->
<CodeBlockNode :theme="{ name: 'my-theme', colors: { ... } }" />
```

使用 `{ light, dark }` 配对时，组件根据 `isDark` prop 自动切换。

`themes` prop 用于注册可用主题，以便 Monaco 可以按需懒加载它们。

> **向后兼容：** `darkTheme` / `lightTheme` props 仍然可用但已废弃。推荐使用统一的 `theme` prop。

**CodeBlockNode 的关键差异：**

| Prop | 直接使用 CodeBlockNode | 通过 MarkdownRender |
|------|---------------------|-------------------|
| `isDark` | 直接传给 `<CodeBlockNode :is-dark="isDark" />` | 通过 `<MarkdownRender :is-dark="isDark" />` 传入并自动转发 |
| 主题 | `:theme="{ light: 'vitesse-light', dark: 'vitesse-dark' }"` | `:code-block-dark-theme="'vitesse-dark'"` `:code-block-light-theme="'vitesse-light'"` (兼容) |
| 主题列表 | `:themes="['vitesse-dark', 'vitesse-light', ...]"` | `:themes="['vitesse-dark', 'vitesse-light', ...]"` |

## 注意事项

- CodeBlock 头部 API 在 [codeblock-header](/zh/guide/codeblock-header) 中有文档说明（包含替换头部和自定义加载占位符的示例）。
- `CodeBlockNode` 和 `MermaidBlockNode` 的 `copy` 事件 payload 不同：`CodeBlockNode` 触发 `copy(text: string)`，而 `MermaidBlockNode` 触发 `copy(ev: MermaidBlockEvent<{ type: 'copy'; text: string }>)`（支持 `preventDefault()`）。

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
