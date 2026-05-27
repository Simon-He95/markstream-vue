export type TestLabSampleId = 'baseline' | 'thinking' | 'diff' | 'stress'
export type TestLabFrameworkId = 'vue3' | 'vue2' | 'react' | 'angular' | 'svelte'

export interface TestLabFrameworkCard {
  id: TestLabFrameworkId
  label: string
  note: string
  origin: string
  localPort: number | null
}

export interface TestLabSampleCard {
  id: TestLabSampleId
  title: string
  summary: string
  content: string
}

export const TEST_LAB_FRAMEWORKS: ReadonlyArray<TestLabFrameworkCard> = [
  {
    id: 'vue3',
    label: 'Vue 3',
    note: '完整特性 / 主 playground',
    origin: 'https://markstream-vue.simonhe.me',
    localPort: null,
  },
  {
    id: 'vue2',
    label: 'Vue 2',
    note: '兼容层回归 / 老项目',
    origin: 'https://markstream-vue2.pages.dev',
    localPort: 3334,
  },
  {
    id: 'react',
    label: 'React',
    note: 'hooks / 渲染对照',
    origin: 'https://markstream-react.pages.dev',
    localPort: 4174,
  },
  {
    id: 'angular',
    label: 'Angular',
    note: 'standalone / parity lab',
    origin: 'https://markstream-angular.pages.dev',
    localPort: 4175,
  },
  {
    id: 'svelte',
    label: 'Svelte',
    note: 'Svelte 5 / parity lab',
    origin: 'https://markstream-svelte.pages.dev',
    localPort: 4176,
  },
] as const

export const TEST_LAB_SAMPLES: ReadonlyArray<TestLabSampleCard> = [
  {
    id: 'baseline',
    title: '基础回归',
    summary: '标题、强调、数学、Mermaid、infographic 和 D2 一次看全。',
    content: `# Markstream Test Lab

在这里可以快速验证 **Vue 3 / Vue 2 / React / Angular / Svelte** 五套渲染器的表现是否一致。

## 基础格式

- **加粗**
- *斜体*
- \`inline code\`
- [链接](https://github.com/Simon-He95/markstream-vue)

## 数学

行内公式：$E = mc^2$

块级公式：

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

## Mermaid

\`\`\`mermaid
flowchart LR
  Prompt --> Parser --> Renderer --> Preview
\`\`\`

## 代码块

\`\`\`ts
export function compareFramework(name: string) {
  return \`\${name} test page is ready.\`
}
\`\`\`

## Infographic

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label 输入
      desc markdown
    - label 渲染
      desc 解析与增量更新
    - label 对照
      desc 跨框架检查
\`\`\`

## D2

\`\`\`d2
App: Playground
Parser: Markdown AST
Renderer: Enhanced HTML
Lab: Playground/Test

App -> Parser -> Renderer -> Lab
\`\`\`
`,
  },
  {
    id: 'thinking',
    title: 'Thinking 嵌套重节点',
    summary: '检查 custom thinking 节点里是否还能稳定渲染 Mermaid、代码块和列表。',
    content: `# Thinking / Nested Blocks

<thinking>
在这个 thinking 容器里，我们希望 Svelte、Angular 和 Vue / React 一样，仍然按正常 markdown 节点树渲染。

## Nested Mermaid

\`\`\`mermaid
flowchart TD
  Thinking --> Parse
  Parse --> Mermaid
  Parse --> CodeBlock
\`\`\`

## Nested Code Block

\`\`\`ts
export function ensureParity(name: string) {
  return \`nested renderer ok: \${name}\`
}
\`\`\`

- nested list item
- another item
</thinking>

外层正文不应该被吞掉。
`,
  },
  {
    id: 'diff',
    title: 'Diff 与代码流',
    summary: '观察 diff code block、长文本和流式更新的稳定性。',
    content: `# Diff Regression

下面这个样例更适合观察 **Diff / JSON** 的折叠区域和高度同步：

\`\`\`diff json:package.json
{
  "name": "markstream-vue",
  "type": "module",
- "version": "0.0.49",
+ "version": "0.0.54-beta.1",
  "packageManager": "pnpm@10.16.1",
  "description": "A Vue 3 component that renders Markdown string content as HTML, supporting custom components and advanced markdown features.",
  "author": "Simon He",
  "license": "MIT",
  "homepage": "https://markstream-vue-docs.simonhe.me/guide/",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Simon-He95/markstream-vue.git"
  },
  "bugs": {
    "url": "https://github.com/Simon-He95/markstream-vue/issues"
  },
  "keywords": [
    "vue",
    "vue3",
    "markdown",
    "markdown-to-html",
    "markdown-renderer",
    "streaming-markdown",
    "streaming-renderer",
    "vue-markdown",
    "vue-markdown-renderer",
    "markdown-preview",
    "markdown-viewer",
    "vue-component",
    "nuxt",
    "vitepress",
    "vite",
    "sse",
    "ai",
    "chat-ui",
    "docs-site",
    "mermaid",
    "katex",
    "monaco-editor"
  ],
  "sideEffects": [
    "**/*.css"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ]
}
\`\`\`

再加一段普通代码，方便对比 Monaco / MarkdownCodeBlock / PreCodeNode：

\`\`\`tsx
export function TestHarness() {
  return (
    <section>
      <h2>Regression</h2>
      <p>Streaming should remain smooth.</p>
    </section>
  )
}
\`\`\`
`,
  },
  {
    id: 'stress',
    title: '结构压力',
    summary: '列表、表格、引用、HTML 和长段落一起压一遍。',
    content: `# Structural Stress

> 这个样例用于检查复杂结构在 streaming 中是否抖动、错位或丢节点。

## 列表

1. 第一层
   - 第二层
     - 第三层
2. 继续

## 表格

| Framework | Route | Purpose |
| --- | --- | --- |
| Vue 3 | \`/test\` | 主调试台 |
| Vue 2 | \`/test\` | 兼容回归 |
| React | \`/test\` | 跨框架对照 |
| Angular | \`/test\` | baseline 对照 |
| Svelte | \`/test\` | 新框架对照 |

## HTML

<details>
  <summary>展开看一段 HTML</summary>
  <p>如果这里的结构错了，通常说明 HTML block / inline 的边界处理有问题。</p>
</details>

## 长段落

Markstream 现在不仅要处理单次完整渲染，还要处理 AI 场景下不断追加的 markdown 内容，所以这个页面更像一个回归驾驶舱。你可以一边编辑左侧输入，一边切换 Vue 2、React、Angular 或 Svelte 的 test page，用同一段内容观察差异，判断问题是解析层、组件层，还是框架适配层。
`,
  },
] as const
