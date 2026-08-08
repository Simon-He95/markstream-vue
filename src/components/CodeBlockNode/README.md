# CodeBlockNode (component)

`CodeBlockNode` renders rich interactive code blocks. It uses the optional framework-agnostic `stream-diffs` runtime for finalized File/FileDiff surfaces, supports Markdown mode, and exposes a flexible header API with slots and events.

Quick example — inline usage (falls back to a simple rendering when `stream-diffs` is not installed):

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

Enhanced diff notes:

- `CodeBlockNode` renders diff blocks through the `stream-diffs` runtime adapter; diff-friendly options (`diffHideUnchangedRegions`, `diffLineStyle`, `diffAppearance`, `diffUnchangedRegionStyle`) are driven by its defaults
- when `node.diff === true`, `CodeBlockNode` defaults to:
  - `diffHideUnchangedRegions: { enabled: true, contextLineCount: 2, minimumLineCount: 4, revealLineCount: 5 }`
  - `diffLineStyle: 'background'`
  - `diffAppearance: 'auto'`
  - `diffUnchangedRegionStyle: 'line-info'`
- runtime note: `diffAppearance: 'auto'` resolves to the current light/dark surface before it is passed to the `stream-diffs` adapter
- the header also shows `- / +` line counts for diff blocks
