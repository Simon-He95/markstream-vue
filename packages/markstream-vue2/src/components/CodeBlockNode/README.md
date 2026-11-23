# CodeBlockNode (component)

`CodeBlockNode` renders interactive code blocks with the optional `stream-diffs` peer and a flexible header API with slots and events.

Quick example — inline usage (falls back to plain code when `stream-diffs` is not installed):

```vue
<CodeBlockNode :node="{ type: 'code_block', language: 'js', code: 'console.log(1)', raw: 'console.log(1)' }" />
```

Header override example:

```vue
<CodeBlockNode :node="node" :showCopyButton="false">
  <template #header-left>
    <div class="text-sm font-medium">My snippet</div>
  </template>
  <template #header-right>
    <button @click="run">Run</button>
  </template>
</CodeBlockNode>
```

Docs and usage examples:
- Docs: /guide/code-block-node
- Header API: /guide/codeblock-header

## Editing through `$refs`

`CodeBlockNode` exposes the shared `CodeBlockNodeEditingApi` on its public instance. Vue 2.6 has no `defineExpose`, so the methods are attached at runtime and the generated `.vue.d.ts` cannot infer them. Cast the ref to `CodeBlockNodeExposed` (also exported from `markstream-vue2`):

```vue
<script lang="ts">
import type { CodeBlockNodeExposed } from 'markstream-vue2'
import { defineComponent } from 'vue-demi'

export default defineComponent({
  methods: {
    async edit() {
      const codeBlock = this.$refs.codeBlock as unknown as CodeBlockNodeExposed
      const editor = await codeBlock.startEditing()
      // editor.getText(), codeBlock.getCode(), codeBlock.undo(), codeBlock.revealLine(...)
    },
  },
})
</script>

<template>
  <CodeBlockNode ref="codeBlock" :node="node" :loading="false" />
</template>
```

`getCode()` returns the current resolved code, including active edits and completed edit sessions. To opt out of the accepting default, return `'reject'` from `codeBlockOptions.onEditComplete`; omitting the callback accepts completed edits.
