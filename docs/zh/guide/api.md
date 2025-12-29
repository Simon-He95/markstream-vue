# API 指南

本页串联解析器工具、渲染器 props 与自定义钩子，帮助你快速定位入口。搭配 [使用示例](/zh/guide/usage) 与 [props](/zh/guide/props) 页面一起阅读效果更佳。

## 渲染流程速览

```
Markdown 字符串 → getMarkdown() → markdown-it-ts 实例
            ↓
   parseMarkdownToStructure() → AST (BaseNode[])
            ↓
   <MarkdownRender> → 节点组件（CodeBlockNode、ImageNode 等）
```

可在任意阶段介入：
- 直接传 `content`：组件自动解析。
- 传 `nodes`：自己在服务端/预处理阶段生成 AST 并复用。

## 解析器工具

| Helper | 作用 | 适用场景 |
| ------ | ---- | -------- |
| `getMarkdown(msgId?, options?)` | 返回预配置的 `markdown-it-ts` 实例。 | 需调整 parser 选项（HTML、插件）或复用实例时。 |
| `parseMarkdownToStructure(content, md?)` | 生成渲染器使用的 AST。 | 服务端预解析、静态导出、或需在渲染前做校验时。 |

两者均可在 Node/浏览器使用。处理大文档时可复用 `md` 实例避免重复初始化插件。

## 自定义组件与作用域

通过 `setCustomComponents(customId?, mapping)` 覆盖任意节点渲染器，再在 `MarkdownRender` 上传入匹配的 `custom-id`，即可限定覆盖范围。

```ts
import { setCustomComponents } from 'markstream-vue'
import CustomImageNode from './CustomImageNode.vue'

setCustomComponents('docs', {
  image: CustomImageNode,
})
```

```vue
<MarkdownRender custom-id="docs" :content="md" />
```

提示：
- 使用语义化 ID（如 `docs`、`playground`）方便排查。
- `setCustomComponents(undefined, mapping)` 会注册全局映射；更推荐按 ID 作用域隔离。
- 在 SPA 中按需注册/卸载时，记得在路由切换时清理。

## 解析钩子与节点变换

当使用 `content` 时，可通过 `parse-options`（组件 prop）或 `parseMarkdownToStructure` 的 `ParseOptions` 拦截解析阶段：

- `preTransformTokens(tokens)` — 生成节点前预处理 token。
- `postTransformTokens(tokens)` — 在默认处理后继续调整。
- `postTransformNodes(nodes)` — 最终 AST 可在此注入元数据或拆分合并节点。

示例：把 AI “thinking” 标签直接渲染成自定义组件（无需钩子）

```ts
import { setCustomComponents } from 'markstream-vue'
import ThinkingNode from './ThinkingNode.vue'

setCustomComponents('docs', { thinking: ThinkingNode })
```

```vue
<MarkdownRender
  custom-id="docs"
  :custom-html-tags="['thinking']"
  :content="doc"
/>
```

如果你需要进一步改造 `thinking` 节点（剥掉包裹、重映射 attrs、合并分段等），再使用上述 hooks。

## 其他导出

- 节点组件：`CodeBlockNode`、`MarkdownCodeBlockNode`、`MermaidBlockNode`、`MathBlockNode`、`ImageNode` 等（详见 [组件与节点渲染器](/zh/guide/components)）。
- 工具：`VisibilityWrapper`、`NodeRenderer`、类型定义（参考 [/zh/guide/parser-api](/zh/guide/parser-api) 或 npm 上的 `stream-markdown-parser` README）。

## 样式 & 排障提醒

- 先引入 reset，再在 `@layer components` 导入 `markstream-vue/index.css`，防止 Tailwind/UnoCSS 覆盖。参考 [Tailwind 指南](/zh/guide/tailwind)。
- 各个同伴依赖（Monaco、Shiki、Mermaid、KaTeX）都需要自己的 CSS；缺失时通常表现为空白渲染。
- 使用 `custom-id` + `[data-custom-id="docs"]` 来局部覆盖样式。
- 遇到样式异常时，依照 [排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here) 逐项检查。

需要更多示例？打开 [Playground](/zh/guide/playground) 或运行 `pnpm play` 在本地实验解析/渲染组合。
