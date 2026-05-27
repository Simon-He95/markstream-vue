# Vue 2 组件与 API

markstream-vue2 提供与 markstream-vue 相同强大的组件，但专为 Vue 2 构建。所有组件都兼容 Vue 2.6+（配合 `@vue/composition-api`）和 Vue 2.7+。

## TypeScript 类型导出

`markstream-vue2` 同步导出渲染器与组件 props 类型：

```ts
import type {
  CodeBlockNodeProps,
  D2BlockNodeProps,
  InfographicBlockNodeProps,
  MermaidBlockNodeProps,
  NodeRendererProps,
  PreCodeNodeProps,
} from 'markstream-vue2'
import type { CodeBlockNode } from 'stream-markdown-parser'
```

说明：
- `NodeRendererProps` 对应 `<MarkdownRender>` props。
- `CodeBlockNodeProps` / `MermaidBlockNodeProps` / `D2BlockNodeProps` / `InfographicBlockNodeProps` / `PreCodeNodeProps` 的 `node` 统一为 `CodeBlockNode`（用 `language: 'mermaid'` / `language: 'd2'` / `language: 'd2lang'` / `language: 'infographic'` 区分渲染器）。

## 主组件：MarkdownRender

在 Vue 2 中渲染 markdown 内容的主要组件。

### Props

`MarkdownRender` 在 Vue 2 中的 props 与 Vue 3 版本一致；模板中使用 kebab-case。

#### 核心 props

| 属性 | 类型 | 默认值 | 描述 |
|------|------|---------|-------------|
| `content` | `string` | - | 要渲染的 Markdown 内容 |
| `nodes` | `BaseNode[]` | - | 预解析的 AST 节点（通常为 `ParsedNode[]`） |
| `custom-id` | `string` | - | 作用域标识，用于 `setCustomComponents` 与 `[data-custom-id="..."]` |
| `final` | `boolean` | `false` | 标记输入结束，停止输出 streaming `loading` 节点 |
| `parse-options` | `ParseOptions` | - | 解析选项与 token hooks（仅在传入 `content` 时生效） |
| `custom-html-tags` | `string[]` | - | 作为自定义节点输出的 HTML-like 标签（如 `thinking`） |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | - | 自定义 MarkdownIt 实例 |
| `debug-performance` | `boolean` | `false` | 输出解析/渲染耗时与虚拟化统计（仅 dev） |
| `is-dark` | `boolean` | `false` | 暗色主题标记，转发给重型节点并在根容器加 `.dark` |
| `index-key` | `number \| string` | - | 列表渲染时的 key 前缀 |
| `typewriter` | `boolean` | `false` | 流式内容增长时显示闪烁的打字光标 |
| `fade` | `boolean` | `true` | 启用非代码节点进入渐入动画和追加文本渐入效果 |
| `show-tooltips` | `boolean` | `true` | 全局控制 `LinkNode` 与代码块节点 tooltip |

#### 流式与重节点开关

| 属性 | 默认值 | 描述 |
|------|---------|-------------|
| `render-code-blocks-as-pre` | `false` | 将非 Mermaid/Infographic/D2 的 `code_block` 渲染为 `<pre><code>` |
| `code-block-stream` | `true` | 随内容到达流式更新代码块 |
| `viewport-priority` | `true` | 将 Monaco/Mermaid/D2/KaTeX 等重型工作延迟到接近视口时 |
| `defer-nodes-until-visible` | `true` | 重型节点先占位，接近可视区再渲染（仅非虚拟化模式） |
| `smooth-streaming` | `'auto'` | 启用内置流式 `content` 更新节奏控制（`boolean | 'auto'`） |
| `smooth-streaming-options` | - | 微调节奏参数（`SmoothMarkdownStreamOptions`） |

#### 性能（虚拟化与批次渲染）

| 属性 | 默认值 | 描述 |
|------|---------|-------------|
| `max-live-nodes` | `320` | DOM 最大保留节点数（设为 `0` 关闭虚拟化） |
| `live-node-buffer` | `60` | 视窗前后 overscan 缓冲 |
| `batch-rendering` | `true` | 在关闭虚拟化时启用批次渲染 |
| `initial-render-batch-size` | `40` | 批次渲染前先渲染的节点数量 |
| `render-batch-size` | `80` | 每个批次渲染的节点数量 |
| `render-batch-delay` | `16` | 每次批次前的额外延迟（ms） |
| `render-batch-budget-ms` | `6` | 自适应批次缩小前的预算（ms） |
| `render-batch-idle-timeout-ms` | `120` | `requestIdleCallback` 超时（ms） |

#### 代码块全局配置

| 属性 | 类型 | 描述 |
|------|------|-------------|
| `code-block-dark-theme` | `any` | 转发到每个 `CodeBlockNode` 的 Monaco 深色主题 |
| `code-block-light-theme` | `any` | 转发到每个 `CodeBlockNode` 的 Monaco 浅色主题 |
| `code-block-monaco-options` | `Record<string, any>` | 转发到 `stream-monaco` 的选项，包括 `diffHunkActionsOnHover`、`diffHunkHoverHideDelayMs`、`onDiffHunkAction` 这类 diff 悬浮操作配置 |
| `code-block-min-width` | `string \| number` | 转发到 `CodeBlockNode` 的最小宽度 |
| `code-block-max-width` | `string \| number` | 转发到 `CodeBlockNode` 的最大宽度 |
| `code-block-props` | `Record<string, any>` | 额外转发到每个 `CodeBlockNode` 的 props |
| `mermaid-props` | `Partial<Omit<MermaidBlockNodeProps, 'node' \| 'loading' \| 'isDark'>>` | 额外转发到 Mermaid 围栏和自定义 `mermaid` 渲染器的 props |
| `d2-props` | `Partial<Omit<D2BlockNodeProps, 'node' \| 'loading' \| 'isDark'>>` | 额外转发到 D2 围栏和自定义 `d2` 渲染器的 props |
| `infographic-props` | `Partial<Omit<InfographicBlockNodeProps, 'node' \| 'loading' \| 'isDark'>>` | 额外转发到 infographic 围栏和自定义 `infographic` 渲染器的 props |
| `themes` | `string[]` | 转发到 `stream-monaco` 的主题列表 |

#### 重型渲染器 props 透传

`MarkdownRender` 可以直接给重型图表节点传调优参数：

```vue
<MarkdownRender
  :content="markdown"
  :viewport-priority="true"
  :mermaid-props="{
    showHeader: false,
    renderDebounceMs: 180,
    previewPollDelayMs: 500
  }"
  :d2-props="{ progressiveIntervalMs: 500 }"
  :infographic-props="{ showHeader: false }"
/>
```

流式建议：
- 保持 `viewport-priority` 开启，避免离屏 Mermaid / Monaco / D2 在文字仍在流式更新时继续做后台工作。
- 抖动较大的 SSE 或 AI token 流推荐从 `content` + 内置 `smooth-streaming` 开始。
- 当已有 worker、store 或自定义 AST 管线负责解析时，使用 `nodes` 模式。
- Mermaid 常用调优项包括：`renderDebounceMs`、`contentStableDelayMs`、`previewPollDelayMs`、`previewPollMaxDelayMs`、`previewPollMaxAttempts`。

#### 事件

- `@copy`, `@handleArtifactClick`, `@click`, `@mouseover`, `@mouseout`

### 使用

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: '# Hello Vue 2!'
    }
  },
  methods: {
  }
}
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="markdown"
    :max-live-nodes="150"
  />
</template>
```

## 代码块组件

### MarkdownCodeBlockNode

使用 Shiki 的轻量级代码高亮。

```vue
<script>
import { MarkdownCodeBlockNode } from 'markstream-vue2'

export default {
  components: { MarkdownCodeBlockNode },
  data() {
    return {
      codeNode: {
        type: 'code_block',
        language: 'javascript',
        code: 'const hello = "world"',
        raw: 'const hello = "world"'
      }
    }
  },
  methods: {
    handleCopy() {
      alert('代码已复制！')
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MarkdownCodeBlockNode
      :node="codeNode"
      :show-copy-button="true"
      @copy="handleCopy"
    >
      <template #header-right>
        <span class="lang-badge">{{ codeNode.language }}</span>
      </template>
    </MarkdownCodeBlockNode>
  </div>
</template>
```

### CodeBlockNode

功能丰富的 Monaco 驱动代码块。

```vue
<script>
import { CodeBlockNode } from 'markstream-vue2'

export default {
  components: { CodeBlockNode },
  data() {
    return {
      codeNode: {
        type: 'code_block',
        language: 'typescript',
        code: 'const greeting: string = "Hello"',
        raw: 'const greeting: string = "Hello"'
      }
    }
  },
  methods: {
    handleCopy(code) {
      console.log('代码已复制：', code)
    },
    handlePreviewCode(artifact) {
      console.log('预览代码：', artifact)
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <CodeBlockNode
      :node="codeNode"
      :monaco-options="{ fontSize: 14, theme: 'vs-dark' }"
      :stream="true"
      @copy="handleCopy"
      @preview-code="handlePreviewCode"
    />
  </div>
</template>
```

## 数学组件

### MathBlockNode

使用 KaTeX 渲染块级数学公式。

```vue
<script>
import { MathBlockNode } from 'markstream-vue2'

export default {
  components: { MathBlockNode },
  data() {
    return {
      mathNode: {
        type: 'math_block',
        content: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
        raw: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}'
      }
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MathBlockNode
      :node="mathNode"
    />
  </div>
</template>
```

### MathInlineNode

渲染行内数学公式。

```vue
<script>
import { MathInlineNode } from 'markstream-vue2'

export default {
  components: { MathInlineNode },
  data() {
    return {
      inlineMathNode: {
        type: 'math_inline',
        content: 'E = mc^2',
        raw: 'E = mc^2'
      }
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <p>
      公式如下：
      <MathInlineNode :node="inlineMathNode" />
    </p>
  </div>
</template>
```

## Mermaid 图表

### MermaidBlockNode

渐进式 Mermaid 图表渲染。

#### 快速要点
- **Tooltip 控制**：`showTooltips` 默认 `true`；设为 `false` 可关闭头部按钮 tooltip。

```vue
<script>
import { MermaidBlockNode } from 'markstream-vue2'

export default {
  components: { MermaidBlockNode },
  data() {
    return {
      mermaidNode: {
        type: 'code_block',
        language: 'mermaid',
        code: `graph TD
    A[开始] --> B{能用吗？}
    B -->|是| C[太好了！]`,
        raw: ''
      }
    }
  },
  methods: {
    onExport(ev) {
      console.log('Mermaid SVG：', ev.svgString)
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MermaidBlockNode
      :node="mermaidNode"
      :is-strict="true"
      :render-debounce-ms="180"
      :preview-poll-delay-ms="500"
      @export="onExport"
    />
  </div>
</template>
```

常用流式调优 props：
- `render-debounce-ms`
- `content-stable-delay-ms`
- `preview-poll-delay-ms`
- `preview-poll-max-delay-ms`
- `preview-poll-max-attempts`

## D2 图表

### D2BlockNode

渐进式 D2 图表渲染，失败时保留上次成功的预览。

```vue
<script>
import { D2BlockNode } from 'markstream-vue2'

export default {
  components: { D2BlockNode },
  data() {
    return {
      d2Node: {
        type: 'code_block',
        language: 'd2',
        code: `direction: right
Client -> API: request
API -> DB: query`,
        raw: ''
      }
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <D2BlockNode
      :node="d2Node"
      :progressive-interval-ms="600"
    />
  </div>
</template>
```

## 工具函数

### setCustomComponents

为特定的 markdown 节点注册自定义节点渲染器。

```js
import { setCustomComponents } from 'markstream-vue2'

// 定义自定义组件
const CustomHeading = {
  name: 'CustomHeading',
  props: ['node', 'indexKey', 'customId'],
  render(h) {
    const level = this.node.level || 1
    return h(`h${level}`, {
      class: 'custom-heading',
      attrs: { 'data-custom-id': this.customId }
    }, this.node.children.map(c => c.content))
  }
}

// 全局注册
setCustomComponents('docs', {
  heading: CustomHeading
})
```

### getMarkdown

获取配置好的 markdown-it 实例。

```js
import { getMarkdown } from 'markstream-vue2'

const md = getMarkdown('my-msg-id', {
  html: true,
  linkify: true,
  typographer: true
})

const tokens = md.parse('# Hello World')
```

### parseMarkdownToStructure

将 markdown 字符串解析为 AST 结构。

```js
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue2'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# 标题\n\n这里的内容...', md)

// 与 MarkdownRender 一起使用
// <MarkdownRender :nodes="nodes" />
```

### enableKatex / enableMermaid / enableD2

（重新）启用 KaTeX、Mermaid、D2 的功能加载器。默认 loader 已经启用，仅在你手动关闭过或需要自定义 loader（如 CDN 版本）时调用。

```js
import { enableD2, enableKatex, enableMermaid } from 'markstream-vue2'

// 启用 KaTeX loader
enableKatex()

// 启用 Mermaid loader
enableMermaid()

// 启用 D2 loader
enableD2()
```

## 自定义组件 API

### Props 接口

所有自定义节点组件都接收这些 props：

```ts
interface NodeComponentProps {
  node: ParsedNode // 解析后的节点数据
  indexKey: number | string // 节点的唯一键
  customId?: string // 用于作用域的自定义 ID
  isDark?: boolean // 主题标记（来自 MarkdownRender）
  typewriter?: boolean // 进入动画标记（仅非 code 节点）
  loading?: boolean // 流式中间态（来自 node.loading）
}
```

### 示例自定义组件

```vue
<script>
export default {
  name: 'CustomParagraph',
  props: {
    node: {
      type: Object,
      required: true
    },
    indexKey: {
      type: [Number, String],
      default: 0
    },
    customId: {
      type: String,
      default: ''
    }
  },
  computed: {
    tag() {
      return 'p'
    },
    classes() {
      return [
        'custom-paragraph',
        `custom-paragraph-${this.indexKey}`
      ]
    },
    attrs() {
      return {
        'data-custom-id': this.customId,
        'data-node-type': this.node.type
      }
    }
  }
}
</script>

<template>
  <component
    :is="tag"
    :class="classes"
    v-bind="attrs"
  >
    <slot>
      <template v-for="(child, i) in node.children">
        <span v-if="child.type === 'text'" :key="i">
          {{ child.content }}
        </span>
        <!-- 处理其他节点类型... -->
      </template>
    </slot>
  </component>
</template>

<style scoped>
.custom-paragraph {
  line-height: 1.7;
  color: #333;
}
</style>
```

## 流式传输支持

markstream-vue2 支持流式 markdown 内容，节点上带有 `loading` 状态：

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      streamingContent: '',
      fullContent: `# 流式传输演示

此内容正在**逐步**流式传输。

\`\`\`javascript
console.log('流式传输中...')
\`\`\`
`
    }
  },
  mounted() {
    this.startStreaming()
  },
  methods: {
    startStreaming() {
      let i = 0
      const interval = setInterval(() => {
        if (i < this.fullContent.length) {
          this.streamingContent += this.fullContent[i]
          i++
        }
        else {
          clearInterval(interval)
        }
      }, 30)
    }
  }
}
</script>

<template>
  <div>
    <MarkdownRender :content="streamingContent" />
  </div>
</template>
```

## TypeScript 支持

markstream-vue2 包含完整的 TypeScript 类型定义。对于 Vue 2.6.x，配置你的 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "types": ["@vue/composition-api", "markstream-vue2"],
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

对于 Vue 2.7+，类型会自动包含：

```ts
import type { ParsedNode } from 'markstream-vue2'
import MarkdownRender from 'markstream-vue2'

// 你的组件具有适当的类型
import { defineComponent, ref } from 'vue'

export default defineComponent({
  components: { MarkdownRender },
  setup() {
    const markdown = ref('# Hello')
    const nodes = ref<ParsedNode[]>([])

    return { markdown, nodes }
  }
})
```

## 与 Vue 3 版本的差异

Vue 2 版本与 Vue 3 版本保持 API 兼容，但需要注意以下几点：

1. **Composition API**：Vue 2.6.x 需要 `@vue/composition-api`，Vue 2.7+ 内置支持
2. **插槽**：使用 Vue 2 的作用域插槽语法
3. **事件名称**：在模板中使用短横线命名的事件名称
4. **v-model**：无需更改，使用方式相同

## 下一步

- 查看 [Vue 2 快速开始](/zh/guide/vue2-quick-start) 获取设置示例
- 探索 [Vue 3 组件](/zh/guide/components) 获取更多组件示例（API 相同）
- 查看 [使用与 API](/zh/guide/usage) 获取高级模式
