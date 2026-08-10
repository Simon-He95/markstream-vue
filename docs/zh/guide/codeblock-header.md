---
title: 代码块头部自定义
description: 说明如何自定义 markstream-vue 代码块头部，通过插槽与配置调整标题、工具按钮与展示布局，满足业务的差异化需求。
keywords:
  - 代码块头部
  - 自定义组件
  - 插槽
---

# 代码块头部自定义

可以通过 props 控制代码块头部的显示，以及通过命名插槽替换头部左/右两侧内容。

常用 props：
- `showHeader` — 是否显示头部
- `showCollapseButton` — 头部折叠按钮
- `showCopyButton` — 复制按钮
- `showExpandButton` — 展开/收起按钮
- `showPreviewButton` — 预览按钮
- `showFontSizeButtons` — 字号控制按钮组

排查问题

如果遇到样式冲突（例如 Tailwind 的 reset 或 util 导致头部布局变化），请查看主排查页面以获取 Tailwind 导入顺序和解决方法：`/zh/guide/troubleshooting`。

示例

下面是常用的示例（README 中也包含同样的示例）；这些示例通常可以直接在项目中复用。

隐藏头部（简单用法）

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'javascript',
  code: 'console.log(1)',
  raw: 'console.log(1)',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode
    :node="node"
    :show-header="false"
    :loading="false"
  />
</template>
```

使用 `#header-left` / `#header-right` 插槽替换默认头部

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'html',
  code: '<div>Hello</div>',
  raw: '<div>Hello</div>',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode
    :node="node"
    :loading="false"
    :show-copy-button="false"
  >
    <template #header-left>
      <div class="flex items-center space-x-2">
        <span class="text-sm font-medium">My HTML</span>
      </div>
    </template>

    <template #header-right>
      <div class="flex items-center space-x-2">
        <button class="px-2 py-1 bg-blue-600 text-white rounded">
          Run
        </button>
        <button class="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
          Inspect
        </button>
      </div>
    </template>
  </CodeBlockNode>
</template>
```

自定义加载占位符（当 `stream=false` 且 `loading=true` 时显示）

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const code = 'print("hello")'
const isLoading = true
const node = {
  type: 'code_block',
  language: 'python',
  code,
  raw: code,
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode
    :node="node"
    :stream="false"
    :loading="isLoading"
  >
    <template #loading="{ loading, stream }">
      <div v-if="loading && !stream" class="p-4 text-center">
        <div class="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
        <p class="mt-2 text-sm text-gray-500">
          Initializing editor...
        </p>
      </div>
    </template>
  </CodeBlockNode>
</template>
```

事件与注意事项

- 组件在复制操作时会触发 `copy` 事件（事件回调接收复制的文本）；使用 `@copy="onCopy"` 监听。
- 组件仅在你监听 `@preview-code` 时才会触发 `previewCode` 事件；负载为 `{ node, artifactType, artifactTitle, id }`。（不监听时，内置预览弹窗仅支持 HTML。）
- 若要隐藏某类默认按钮，可使用布尔 props：`showCollapseButton`、`showCopyButton`、`showExpandButton`、`showPreviewButton`、`showFontSizeButtons`。
- 可通过 `showTooltips` 控制当前代码块头部按钮 tooltip 的显示。
- `showHeader` 控制是否渲染头部栏。
