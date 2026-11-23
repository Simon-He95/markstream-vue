---
title: CodeBlockNode (Component)
description: Reference for the CodeBlockNode Vue component that renders rich interactive code blocks with syntax highlighting and diff views.
keywords:
  - codeblocknode component
  - interactive code blocks
  - syntax highlighting
  - streaming diff code blocks
---
# CodeBlockNode (Component)

`CodeBlockNode` 是库中用于渲染富交互代码块的组件。对于需要高亮、File/Diff surface 与交互的场景，推荐安装 `stream-diffs`。Vue 组件负责流式结束、可见性和卸载；`stream-diffs` 根 runtime 只负责 framework-agnostic DOM surface。

## Quick summary
- Enhanced mode (install `stream-diffs`) — finalized File/FileDiff surface with syntax highlighting and diff interactions
- Fallback — plain `<pre><code>` when `stream-diffs` is not installed

## Props
Refer to `src/types/component-props.ts` for full signature. Key props:
- `node` — code_block node (required)
- `loading`, `stream`, `isShowPreview`
- `codeBlockOptions` — renderer-neutral typography, layout, File/FileDiff, interaction, annotation, and callback options. The same prop is also available at the `NodeRenderer` / `MarkdownRender` top level.
- `theme` — a registered string name or `{ dark, light }`; `themes` is the `[dark, light]` name pair to load.
- Header controls: `showHeader`, `showCollapseButton`, `showCopyButton`, `showExpandButton`, `showPreviewButton`, `showFontSizeButtons`, `showTooltips`
- `clipboardWriter` — custom sync or async clipboard writer; defaults to the browser clipboard.
- HTML preview sandbox: `htmlPreviewAllowScripts` defaults to `false`, and `htmlPreviewSandbox` lets you override the iframe sandbox tokens directly

Built-in inline HTML preview uses `sandbox=""` by default so untrusted preview documents do not run scripts or inherit the host origin. `htmlPreviewSandbox` takes precedence over `htmlPreviewAllowScripts`; passing `htmlPreviewSandbox=""` keeps the iframe fully sandboxed, omitting `htmlPreviewSandbox` leaves `htmlPreviewAllowScripts` in control, and invalid non-string overrides such as `null` fall back to the safe default. Only opt into `htmlPreviewAllowScripts` for trusted demos, and avoid combining `allow-scripts` with `allow-same-origin` for untrusted preview content.

Default finalized diff UX when no `codeBlockOptions` override is supplied:

- `diffStyle: 'split'`
- `expandUnchanged: false`
- `collapsedContextThreshold: 5`
- `hunkSeparators: 'line-info'`
- `parseDiffOptions: { context: 2 }`

The same folding options apply to the fallback and finalized surface; streaming state does not override the consumer's `expandUnchanged` choice. Theme, content/language, header, mount/reveal timing, and disposal remain host-owned even when `codeBlockOptions` is present.

`overflow` controls both the fallback `<pre>` and the enhanced surface. The default is `'wrap'`; use `'scroll'` for non-wrapping content with horizontal scrolling. Visual wrapping never creates extra logical diff rows or changes the built-in `- / +` counts.

Diff blocks also show `- / +` line counts in the built-in header.

## Slots
- `header-left` — replace left header
- `header-right` — replace right header
- `loading` — customize placeholder when streaming is disabled

## Emits
- `copy(text: string)` — after the clipboard write succeeds
- `previewCode(payload)` — only emitted when you attach a `@preview-code` listener; payload is `{ node, artifactType, artifactTitle, id }`

## Examples
### Install and run

```bash
pnpm add stream-diffs
```

### Basic example

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

### Replace header and hide copy button

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
        Custom left
      </div>
    </template>
    <template #header-right>
      <button @click="runSnippet">
        Run
      </button>
    </template>
  </CodeBlockNode>
</template>
```

### Configure the code surface

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

`fontSize`, `lineHeight`, `fontFamily`, numeric-pixel `maxHeight`, numeric-pixel symmetric `padding`, and `tabSize` are host-managed so the fallback and finalized surface share geometry. Other supported fields are forwarded to `stream-diffs`. Use the separate component props for header and toolbar controls.

### Custom loading placeholder

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
        Loading editor assets…
      </div>
    </template>
  </CodeBlockNode>
</template>
```

## Editing API

安装 `stream-diffs >= 0.0.5`（基于 `@pierre/diffs` 1.7）后，`CodeBlockNode` 通过组件 ref 暴露编辑、撤销/重做、行定位与展开能力。方法在 block 结束流式并完成 finalized surface 后可用；`startEditing()` 会在 surface 已存在时等待 `prepareForEditing()`，若 block 仍在流式则抛出明确错误。

典型场景是在 AI 聊天里就地修正代码，或在 diff 评审中修改 additions 一侧。编辑态是 upstream Diffs 的原生 contenteditable 交互，键盘输入、选择、撤销/重做快捷键都由 Diffs 处理；这里暴露的是进入/退出、程序化编辑、导航和收尾能力。

`CodeBlockNode` 是异步组件，模板 ref 请显式标注为 `CodeBlockNodeExposed`（如下例），不要依赖 `InstanceType` 自动推导编辑方法。

```vue
<script setup lang="ts">
import type { CodeBlockNodeExposed } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'
import { reactive, ref } from 'vue'

const block = ref<CodeBlockNodeExposed | null>(null)
const node = reactive({
  type: 'code_block' as const,
  language: 'ts',
  code: 'const answer = 42',
  raw: 'const answer = 42',
})
const draft = ref('')
const saved = ref('')

async function edit() {
  await block.value?.startEditing({
    onChange: (event: { file: { contents: string } }) => { draft.value = event.file.contents },
  }, 'answer-draft')
}

function save() {
  const code = block.value?.getCode()
  if (code != null) {
    saved.value = code
    node.code = code // 让后续 props 重渲染保留结果
  }
  block.value?.stopEditing('complete')
}

function cancel() {
  draft.value = ''
  block.value?.stopEditing('discard')
}

function undo() {
  block.value?.undo()
}
</script>

<template>
  <CodeBlockNode ref="block" :node="node" :loading="false" />
  <button @click="edit">
    Edit
  </button>
  <button @click="save">
    Save
  </button>
  <button @click="cancel">
    Cancel
  </button>
  <button @click="undo">
    Undo
  </button>
</template>
```

| 方法 | 说明 |
| --- | --- |
| `getSurface()` | 返回 finalized `stream-diffs` controller（尚未完成时为 `null`）。 |
| `isReadyToEdit()` / `isEditing()` | 是否可立即附加 editor / 是否有活动会话。 |
| `startEditing(options?, editStateKey?)` | 附加 upstream Diffs editor，返回 editor；方法本身已处理 `prepareForEditing()`。 |
| `stopEditing(reason?)` | `'complete'` 安装到当前 surface，`'discard'` 回退。主题/选项重渲染前需先把 `getCode()` 写回 host 数据。 |
| `getEditor()` / `getEditingText()` / `getCode()` | 读取 editor 或当前代码。 |
| `undo()` / `redo()` / `canUndo()` / `canRedo()` / `applyEdits()` | 编辑历史与程序化修改。 |
| `focusEditor()` / `blurEditor()` | 焦点控制。 |
| `revealLine(line, side?)` | 在 diff 中定位行；必要时展开折叠上下文。 |
| `expandLine(target)` / `expandHunk(index, direction, override?)` | 展开超长行或 diff hunk。 |
| `setEditorActiveLine()` | 设置 active line 高亮。 |
| `getCodeScrollLeft()` / `setCodeScrollLeft()` | 横向滚动，无需进入 Shadow DOM。 |

注意：

- 编辑能力依赖 `stream-diffs >= 0.0.5`；0.0.2–0.0.4 只能做只读渲染，编辑方法不存在时会抛出明确错误，或返回 `null`/`false`。
- `stopEditing('complete')` 默认接受并保留编辑结果。如果要在完成时校验或拒绝，可在 `code-block-options` 中传 `onEditComplete(event)`，必须返回 `'reject'` 或 `'accept'`；没有返回值会被视为 `'reject'`，从而恢复外部输入。File 与 Diff 的事件结构不同：File 读取 `event.file`，Diff 读取 `event.newFile` / `event.fileDiff`，不要对 Diff 使用 `event.file.contents`。例如 `:code-block-options="{ onEditComplete: event => event.file.contents === saved ? 'reject' : 'accept' }"` 仅适用于 File。
- `getCode()` 在活动会话中返回当前草稿，完成后返回安装后的编辑器内容；如果希望后续 props 更新时保留结果，File block 应把 `getCode()` 写回 `node.code`，Diff block 应写回 `node.updatedCode`。
- `stopEditing('complete')` 只把结果安装到当前 surface。主题、`codeBlockOptions` 或结构变化会重建 surface，并从 `props.node` 重新读取内容；因此需要在这些更新之前把 `getCode()` 写回 node 数据。需要跨 surface 重建保留未完成的草稿时，把 `editStateKey` 传成稳定值。
- 如果希望进入编辑时复用已渲染行，创建 surface 时传 `useTokenTransformer: true`；否则 upstream 会在首次附加时整块重绘。
- `@pierre/diffs` 1.7 默认截断超过 1000 字符的单行并提供 "Show full line"；可用 `expandLine()` 展开，或传 `tokenizeMaxLineLength: 0` 关闭截断。
- 注入 `setStreamDiffsWorkerPool` 的 pool 必须来自同版本 `@pierre/diffs`。旧 pool 会被忽略并回退到主线程高亮，不会让渲染崩溃。
- Webpack 4 / Vue CLI 4 无法解析 `@pierre/diffs` 1.7 的 ESM `exports` 子路径，enhanced code block 会停留在 `<pre>` fallback。请使用 Vite、Webpack 5 或 Vue CLI 5；普通 `<pre>` 渲染不受影响。

## Theme Switching

`CodeBlockNode` supports automatic theme switching based on dark/light mode. Use `@vueuse/core`'s `useDark` composable to track the theme state and pass theme names to `MarkdownRender` or `CodeBlockNode`.

### Using @vueuse/core in standalone Vue apps

```vue
<script setup lang="ts">
import { useDark, useToggle } from '@vueuse/core'
import MarkdownRender from 'markstream-vue'

const isDark = useDark() // Ref<boolean> reactive to system/theme preference
const toggleDark = useToggle(isDark)
const content = '# Example\n\n```js\nconsole.log("dark mode")\n```'

// Dark/light theme pair
const themes = [
  'vitesse-dark',
  'vitesse-light',
] as const
</script>

<template>
  <div>
    <button @click="toggleDark()">
      Toggle Theme
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

### VitePress integration

For VitePress, use the built-in `isDark` from VitePress's `useData()`:

```ts
// docs/.vitepress/theme/composables/useDark.ts
import { useData } from 'vitepress'

/**
 * VitePress theme composable for dark mode
 * Uses VitePress's built-in isDark from useData()
 */
export function useDark() {
  const { isDark } = useData()
  return isDark
}
```

```vue
<!-- In any .md file or component -->
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { useDark } from '../../.vitepress/theme'

const isDark = useDark()
const content = '# Example\n\n```js\nconsole.log("dark mode")\n```'

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

**How it works:**

The `theme` prop accepts either a fixed theme or a light/dark pair:

```vue
<!-- Auto-switch between light and dark (recommended) -->
<CodeBlockNode :theme="{ light: 'vitesse-light', dark: 'vitesse-dark' }" />

<!-- Fixed theme (ignores isDark) -->
<CodeBlockNode theme="monokai" />
```

When using a `{ dark, light }` pair, the component automatically switches based on the `isDark` prop.

The `themes` prop accepts exactly a `[dark, light]` pair. A former Monaco JSON theme object is not a valid `theme` value in 2.0; use `registerCustomTheme` from `stream-diffs/pierre`, then pass its registered name.

> **Backward compatibility:** `darkTheme` / `lightTheme` props still work but are deprecated. Prefer the unified `theme` prop.

**Key differences for CodeBlockNode:**

| Prop | Direct CodeBlockNode | Via MarkdownRender |
|------|---------------------|-------------------|
| `isDark` | Passed directly to `<CodeBlockNode :is-dark="isDark" />` | Passed via `<MarkdownRender :is-dark="isDark" />` and automatically forwarded |
| Theme | `:theme="{ dark: 'vitesse-dark', light: 'vitesse-light' }"` | `:code-block-props="{ theme: { dark: 'vitesse-dark', light: 'vitesse-light' } }"` |
| Themes pair | `:themes="['vitesse-dark', 'vitesse-light']"` | `:themes="['vitesse-dark', 'vitesse-light']"` |

## Notes
- The CodeBlock header API is documented in `docs/guide/codeblock-header.md` (examples for replacing header and custom loading placeholder).
- `CodeBlockNode` and `MermaidBlockNode` intentionally use different `copy` event payloads: `CodeBlockNode` emits `copy(text: string)`, while `MermaidBlockNode` emits `copy(ev: MermaidBlockEvent<{ type: 'copy'; text: string }>)` (supports `preventDefault()`).
- For large code blocks (tens of thousands of lines), Shiki tokenization runs on the main thread by default. To offload it to Web Workers, inject an upstream `@pierre/diffs` `WorkerPoolManager` via `setStreamDiffsWorkerPool(...)`; `CodeBlockNode` forwards it as the `workerManager` option and keeps the active theme in sync. Without an injected pool (or when the pool reports itself unavailable) the surface highlights on the main thread. See [Code Block Runtime](/guide/code-block-runtime) for the setup.

## Cross-framework editing API

`stream-diffs@0.0.5` exposes the same editing contract from every framework renderer. The method set, error behavior, completion semantics, and `getCode()` precedence are shared through `markstream-core`; only the way you acquire the component handle differs.

| Package | Acquire the handle | Handle type |
| --- | --- | --- |
| `markstream-react` | `ref` via `React.forwardRef` | `CodeBlockNodeHandle` |
| `markstream-octane` | `ref` prop + `useImperativeHandle` | `CodeBlockNodeHandle` |
| `markstream-solid` | callback `ref` prop | `SolidCodeBlockNodeHandle` |
| `markstream-svelte` | `bind:this` instance exports | `SvelteCodeBlockNodeExposed` |
| `markstream-angular` | `@ViewChild(CodeBlockNodeComponent)` | `CodeBlockNodeHandle` |
| `markstream-vue2` | `$refs` cast (Vue 2.6/2.7 compatible) | `CodeBlockNodeExposed` |

All handles expose `getSurface()`, `isReadyToEdit()`, `isEditing()`, `startEditing()`, `stopEditing()`, `getEditor()`, `getEditingText()`, `getCode()`, undo/redo, `applyEdits()`, focus/blur, reveal/expand/active-line, and horizontal scroll. Call `startEditing()` after streaming finishes; `stopEditing('complete')` accepts edits by default, and hosts should write `getCode()` back to `node.code` (File) or `node.updatedCode` (Diff) before theme/options recreate the surface. See each package README for a framework-specific example.

Try this — simple snapshot example (inline usage):

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

---
