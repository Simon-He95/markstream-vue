# CodeBlockNode (component)

`CodeBlockNode` renders rich interactive code blocks. It supports Monaco streaming integration (optional), Markdown mode, and a flexible header API with slots and events.

Quick example — inline usage (fallback to a simple rendering if Monaco not installed):

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
