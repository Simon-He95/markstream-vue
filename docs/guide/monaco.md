---
title: Code Block Runtime
description: How the optional stream-diffs runtime powers CodeBlockNode with minimal installation, replacing the historical Monaco editor surface.
keywords:
  - code block runtime
  - stream-diffs runtime
  - monaco compatibility
  - code editor surface
---
# Code Block Runtime

This legacy route now documents the optional `stream-diffs` runtime used by `CodeBlockNode`. The public option names retain `Monaco` for compatibility, but the default enhanced surface is no longer a Monaco editor.

## Install

```bash
pnpm add stream-diffs
```

No worker plugin or package-specific CSS import is required.

`stream-monaco` remains supported as an automatic fallback: if `stream-diffs` is not installed, the loader tries `stream-monaco` (the `stream-monaco/legacy` entry for the vue2 package) before giving up and rendering a plain `<pre>`. You can keep existing `stream-monaco` installs; you do not need both runtimes.

## Runtime boundary

```text
markstream-vue                         stream-diffs
---------------                        ------------
CodeBlockNode                          controller + DOM surface
  - Vue props / unmount                  - HTMLElement target
  - streaming completion                 - code or diff data
  - viewport decision                    - File / FileDiff rendering
  - header and toolbar                   - syntax highlighting
```

The `stream-diffs` root entry is framework-agnostic. It does not import Vue or own a Vue lifecycle. The package also exposes an optional `stream-diffs/vue` convenience entry for direct Vue consumers, but `markstream-vue` does not use that entry.

## CodeBlockNode handoff

`CodeBlockNode` uses one stable visual path:

1. While code is streaming, Vue renders `PreCodeNode`.
2. After the block is complete and visible, the component dynamically imports the `stream-diffs` root runtime and mounts one File or FileDiff surface into its existing container.
3. The component applies the active theme to that surface and removes the temporary `<pre>` only when the surface is ready.
4. On component unmount, the Vue adapter disposes the controller.

Completion, visibility, and unmount are `CodeBlockNode` concerns. They are not `stream-diffs` lifecycle hooks.

`CodeBlockShell` owns the title and action bar. The File surface is created with its internal `data-diffs-header` disabled so the DOM has one header.

## Runtime options

`CodeBlockMonacoOptions` remains the public TypeScript name for compatibility. Its values are forwarded to the `stream-diffs` adapter used by `CodeBlockNode`.

```vue twoslash
<script setup lang="ts">
import type { CodeBlockMonacoOptions } from 'markstream-vue'
import MarkdownRender from 'markstream-vue'

const codeBlockMonacoOptions = {
  fontSize: 14,
  lineHeight: 21,
  wordWrap: 'off',
  renderSideBySide: true,
  MAX_HEIGHT: 640,
} satisfies CodeBlockMonacoOptions
</script>

<template>
  <MarkdownRender
    :content="['```ts', 'const answer = 42', '```'].join('\n')"
    :code-block-monaco-options="codeBlockMonacoOptions"
  />
</template>
```

Use the `theme` prop for light/dark themes. `CodeBlockNode` sends theme changes to its mounted surface without recreating the Vue component.

## Optional preload

If a route is known to contain completed, visible code blocks, preload the module during idle time:

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

This only warms the optional module. It does not create a surface, finalize a streaming block, or bypass the completion-and-visibility gate.

## Diff interactions

Diff blocks keep the same adapter boundary. Configure rendering and hover actions through `monacoOptions` / `codeBlockMonacoOptions`:

```ts twoslash
import type { CodeBlockMonacoOptions } from 'markstream-vue'

const codeBlockMonacoOptions = {
  renderSideBySide: true,
  diffHunkActionsOnHover: true,
  onDiffHunkAction(context) {
    console.log(context.action, context.side)
    return false
  },
} satisfies CodeBlockMonacoOptions
```

Returning `false` prevents the default diff edit after the callback.
