---
title: Code block header customization
description: Customize the code block header via named slots and toolbar toggles for collapse, copy, expand, preview, and font-size controls.
keywords:
  - code block header
  - header slots
  - toolbar buttons
  - copy collapse expand
---
# Code block header customization

The code block component exposes a flexible header API to adapt the header to your app UX:

- Toggle header on/off
- Show or hide built-in toolbar buttons (collapse, copy, expand, preview, font-size)
- Replace the left/right header content via named slots (`header-left`, `header-right`)

Slots

- `header-left` — Replace the left side of the header
- `header-right` — Replace the right side of the header
- `loading` — Customize loading placeholder when streaming is disabled

Examples

Below are a few common examples. You can find the full set of examples in the project README; these are the most useful patterns to re-use in your app.

Hide the header (simple)

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

Replace the default header using the `#header-left` and `#header-right` named slots

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

Custom loading placeholder (shown when `stream` is false and `loading` is true)

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

Events and notes

- The component emits `copy` when the copy button is clicked (the copy text is supplied as the event payload). Use `@copy="onCopy"` to listen for it.
- The component emits `previewCode` only when you attach a `@preview-code` listener; payload is `{ node, artifactType, artifactTitle, id }`. (Without a listener, the built-in preview overlay is available for HTML only.)
- To hide a specific toolbar button set, use the boolean props `showCollapseButton`, `showCopyButton`, `showExpandButton`, `showPreviewButton`, `showFontSizeButtons`.
- Use `showTooltips` to toggle header action tooltips globally for this block.
- The `showHeader` prop controls whether the header is rendered at all.

Try this — replace the header in a small example:

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = { type: 'code_block', language: 'js', code: 'console.log("run")', raw: 'console.log("run")' } satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode :node="node" :show-copy-button="false">
    <template #header-right>
      <button @click="() => console.log('run')">
        Run
      </button>
    </template>
  </CodeBlockNode>
</template>
```

Troubleshooting

If you run into style conflicts (for instance, Tailwind reset/utility rules changing the header's layout), see the main Troubleshooting page which covers Tailwind import ordering and quick fixes: `/guide/troubleshooting`.
