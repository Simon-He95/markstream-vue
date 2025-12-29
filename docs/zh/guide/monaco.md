# Monaco 编辑器集成

Monaco 编辑器集成为可选功能（由 `stream-monaco` 提供）。它支持对大代码块进行快速的增量更新。

安装：

```bash
pnpm add stream-monaco
```

提示：
- 延迟初始化 Monaco（仅在可见或需要时才初始化）
- 在生产构建中需要配置 worker 打包（使用 `vite-plugin-monaco-editor-esm`）
- 如果需要更快的首次渲染，可使用 `getUseMonaco()` 在应用启动时预加载 Monaco
- 不需要额外导入 CSS

更多细节参见 `/zh/guide/monaco-internals`。

### 添加更多语言与主题

为了保持初始化速度，默认只注册了一小部分 Monaco 语言。如果你的文档需要 Rust、Go、Bash 等额外语法，或希望注入自定义主题，可以将它们通过 `monacoOptions` 传给 `CodeBlockNode`，或者在 `MarkdownRender` 上使用 `codeBlockMonacoOptions` 统一下发。该对象会原样透传给 `useMonaco()`。

> 注意：设置 `languages` 会覆盖 `stream-monaco` 内置的 `defaultLanguages`，而不是在其基础上追加。请在数组中显式列出你需要的所有语言（包括默认语言），以免缺少语法高亮。

```vue
<script setup lang="ts">
import type { MonacoTheme } from 'stream-monaco'
import MarkdownRender from 'markstream-vue'

const docsDark: MonacoTheme = {
  name: 'docs-dark',
  base: 'vs-dark',
  inherit: true,
  colors: {
    'editor.background': '#05060a',
  },
  rules: [],
}

const docsLight: MonacoTheme = {
  name: 'docs-light',
  base: 'vs',
  inherit: true,
  colors: {
    'editor.background': '#ffffff',
  },
  rules: [],
}

const monacoOptions = {
  languages: ['javascript', 'python', 'rust', 'shell'],
  themes: [docsDark, docsLight],
  theme: 'docs-dark',
  MAX_HEIGHT: 640,
}

const markdown = `
\`\`\`python
print("extra languages go here")
\`\`\`

\`\`\`rust
fn main() {}
\`\`\`
`
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="markdown"
    :code-block-monaco-options="monacoOptions"
  />
</template>
```

> `languages` 中的每个条目都可以是 Monaco 的语言 ID，或 `stream-monaco` 文档里提到的懒加载函数（用于延迟加载语言包）。如果不是通过 `MarkdownRender`，直接在 `CodeBlockNode` 上使用 `:monaco-options="monacoOptions"` 即可。
