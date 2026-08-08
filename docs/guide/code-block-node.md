# CodeBlockNode (Component)

`CodeBlockNode` 是库中用于渲染富交互代码块的组件。对于需要高亮、File/Diff surface 与交互的场景，推荐安装 `stream-diffs`。Vue 组件负责流式结束、可见性和卸载；`stream-diffs` 根 runtime 只负责 framework-agnostic DOM surface。

## Quick summary
- Enhanced mode (install `stream-diffs`) — finalized File/FileDiff surface with syntax highlighting and diff interactions
- Fallback — plain `<pre><code>` when `stream-diffs` is not installed

## Props
Refer to `src/types/component-props.ts` for full signature. Key props:
- `node` — code_block node (required)
- `loading`, `stream`, `isShowPreview`
- Code/diff options are not configurable per block in 2.0; the enhanced surface uses the `stream-diffs` built-in defaults. Theming is done through `theme` / `darkTheme` / `lightTheme` / `themes`.
- Header controls: `showHeader`, `showCollapseButton`, `showCopyButton`, `showExpandButton`, `showPreviewButton`, `showFontSizeButtons`, `showTooltips`
- HTML preview sandbox: `htmlPreviewAllowScripts` defaults to `false`, and `htmlPreviewSandbox` lets you override the iframe sandbox tokens directly

Built-in inline HTML preview uses `sandbox=""` by default so untrusted preview documents do not run scripts or inherit the host origin. `htmlPreviewSandbox` takes precedence over `htmlPreviewAllowScripts`; passing `htmlPreviewSandbox=""` keeps the iframe fully sandboxed, omitting `htmlPreviewSandbox` leaves `htmlPreviewAllowScripts` in control, and invalid non-string overrides such as `null` fall back to the safe default. Only opt into `htmlPreviewAllowScripts` for trusted demos, and avoid combining `allow-scripts` with `allow-same-origin` for untrusted preview content.

Default diff UX in enhanced mode:

- `diffHideUnchangedRegions: { enabled: true, contextLineCount: 2, minimumLineCount: 4, revealLineCount: 5 }`
- `diffLineStyle: 'background'`
- `diffAppearance: 'auto'`
- `diffUnchangedRegionStyle: 'line-info'`
- `diffHunkActionsOnHover: true`
- `diffHunkHoverHideDelayMs: 160`

These are the `stream-diffs` built-in defaults; in 2.0 there is no per-block override prop.
When `diffAppearance: 'auto'` is used, `CodeBlockNode` resolves it to the current light/dark surface before passing the options to its `stream-diffs` adapter.

Diff blocks also show `- / +` line counts in the built-in header.

## Slots
- `header-left` — replace left header
- `header-right` — replace right header
- `loading` — customize placeholder when streaming is disabled

## Emits
- `copy(text: string)` — when copy pressed
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

// Available themes (must include the themes you want to use)
const themes = [
  'vitesse-dark',
  'vitesse-light',
  'github-dark',
  'github-light',
  // ... more themes
]
</script>

<template>
  <div>
    <button @click="toggleDark()">
      Toggle Theme
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
  'github-dark',
  'github-light',
  // ... more themes
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

**How it works:**

The `theme` prop accepts either a fixed theme or a light/dark pair:

```vue
<!-- Auto-switch between light and dark (recommended) -->
<CodeBlockNode :theme="{ light: 'vitesse-light', dark: 'vitesse-dark' }" />

<!-- Fixed theme (ignores isDark) -->
<CodeBlockNode theme="monokai" />

<!-- Theme object (fixed, ignores isDark) -->
<CodeBlockNode :theme="{ name: 'my-theme', colors: { ... } }" />
```

When using a `{ light, dark }` pair, the component automatically switches based on the `isDark` prop.

The `themes` prop registers the available themes so the runtime can lazy-load them on demand.

> **Backward compatibility:** `darkTheme` / `lightTheme` props still work but are deprecated. Prefer the unified `theme` prop.

**Key differences for CodeBlockNode:**

| Prop | Direct CodeBlockNode | Via MarkdownRender |
|------|---------------------|-------------------|
| `isDark` | Passed directly to `<CodeBlockNode :is-dark="isDark" />` | Passed via `<MarkdownRender :is-dark="isDark" />` and automatically forwarded |
| Theme | `:theme="{ light: 'vitesse-light', dark: 'vitesse-dark' }"` | `:code-block-dark-theme="'vitesse-dark'"` `:code-block-light-theme="'vitesse-light'"` (legacy) |
| Themes list | `:themes="['vitesse-dark', 'vitesse-light', ...]"` | `:themes="['vitesse-dark', 'vitesse-light', ...]"` |

## Notes
- The CodeBlock header API is documented in `docs/guide/codeblock-header.md` (examples for replacing header and custom loading placeholder).
- `CodeBlockNode` and `MermaidBlockNode` intentionally use different `copy` event payloads: `CodeBlockNode` emits `copy(text: string)`, while `MermaidBlockNode` emits `copy(ev: MermaidBlockEvent<{ type: 'copy'; text: string }>)` (supports `preventDefault()`).

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
