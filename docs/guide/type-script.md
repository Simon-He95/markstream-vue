---
title: TypeScript Usage
description: Use the TypeScript-first exports of markstream-vue, including BaseNode types and type-safe configuration for advanced integrations.
keywords:
  - typescript usage markdown
  - basenode types
  - type safe markdown
  - typescript first api
---
# TypeScript Usage

This library is TypeScript-first and exports types for the public API. Use `import type` to get node definitions in your code for advanced manipulations.

```ts twoslash
import type { BaseNode } from 'markstream-vue'
import { getMarkdown } from 'markstream-vue'

const md = getMarkdown()
const nodes: BaseNode[] = []
```

See `packages/markdown-parser/src` for type definitions used by the parser.

Types for custom component registration are exported too:

```ts twoslash
import type { CustomComponents } from 'markstream-vue'

const components: CustomComponents = {
  thinking: {} as any,
  code_block: {} as any,
}
```

## Strongly typed custom components

You can strongly type your custom components to accept node-specific props. Example:

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

Then register the component for a specific custom id or globally:

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const CustomCodeBlock: Component

setCustomComponents('docs', {
  code_block: CustomCodeBlock,
})
```

This approach provides full TypeScript checking and code completion for node props inside your components.

Try this — typed node value example you can use in your code:

```ts twoslash
import type { CodeBlockNodeProps } from 'markstream-vue'

const node: CodeBlockNodeProps['node'] = { type: 'code_block', language: 'ts', code: 'console.log(1)', raw: 'console.log(1)' }
```
