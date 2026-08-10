---
title: TypeScript 使用
description: 说明 markstream-vue 的 TypeScript 用法，介绍通过 import type 获取节点定义、强类型自定义组件与组件映射类型。
keywords:
  - TypeScript
  - 类型定义
  - 自定义组件
---

# TypeScript 使用（中文）

本库以 TypeScript 为首选语言，导出公共 API 类型。使用 `import type` 来获取节点定义以用于高级用法。

```ts twoslash
import type { BaseNode } from 'markstream-vue'
import { getMarkdown } from 'markstream-vue'

const md = getMarkdown()
const nodes: BaseNode[] = []
```

自定义组件映射类型也已经对外导出：

```ts twoslash
import type { CustomComponents } from 'markstream-vue'

const components: CustomComponents = {
  thinking: {} as any,
  code_block: {} as any,
}
```

## 强类型自定义组件

你可以强类型化自定义组件以接收节点特定 props，例如：

```vue
<script setup lang="ts">
import type { CodeBlockNode } from 'markstream-vue'

const props = defineProps<{ node: CodeBlockNode }>()
</script>

<template>
  <pre class="custom-code">
    <code :data-lang="props.node.language">{{ props.node.code }}</code>
  </pre>
</template>
```

然后注册该组件：

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const CustomCodeBlock: Component

setCustomComponents('docs', {
  code_block: CustomCodeBlock,
})
```

此种方式支持类型检查与智能提示。

```ts twoslash
import type { CodeBlockNodeProps } from 'markstream-vue'

const node: CodeBlockNodeProps['node'] = { type: 'code_block', language: 'ts', code: 'console.log(1)', raw: 'console.log(1)' }
```
