---
description: 将 markstream-vue 接入 VitePress 与文档站，覆盖 content 模式、enhanceApp 注册、可信标签接法与 CSS 顺序。
---

# 文档站与 VitePress 集成

当你在做文档站、知识库、官网内容页，或者任何“Markdown 主要作为稳定页面内容来展示，而不是像聊天那样持续流式变化”的场景时，就走这条路径。

这页的目标是一次解决 VitePress 用户最常见的几个连环问题：

- 我该用 `content` 还是 `nodes`
- `MarkdownRender` 和自定义节点该注册到哪里
- `enhanceApp` 应该怎么用
- `markstream-vue/index.css` 该放在哪
- `thinking` 这类可信标签在文档页里怎么接

## 1. 除非你已经拥有 AST，否则优先用 `content`

对文档站来说，`content` 通常就是更合适的默认值：

| 场景 | 推荐输入 |
| --- | --- |
| Markdown 来自页面内容、CMS 字段或普通文档页 | `content` |
| 你已经在服务端或内容流水线里预解析好了 | `nodes` |
| 你做的是实时流式输出或 AI 聊天 | 改走 [AI 聊天与流式输出](/zh/guide/ai-chat-streaming) |

## 2. 先装一套适合文档站的最小依赖

```bash
pnpm add markstream-vue stream-markdown
```

这套组合很适合作为文档站默认值：基础 Markdown 渲染，加上轻量代码高亮。

只有真的需要时再继续补：

- `mermaid`：Mermaid 图表
- `katex`：数学公式
- `stream-monaco`：Monaco 代码块

## 3. 在 `enhanceApp` 中注册渲染器和自定义节点

对 VitePress 来说，最稳妥的全局接入位置通常是 `docs/.vitepress/theme/index.ts`。

```ts
import MarkdownRender, { setCustomComponents } from 'markstream-vue'
// docs/.vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import ThinkingNode from './components/ThinkingNode.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('MarkdownRender', MarkdownRender)

    setCustomComponents('docs', {
      thinking: ThinkingNode,
    })
  },
}
```

这样做的好处：

- Markdown 页面里可以直接使用 `MarkdownRender`，不用每页单独导入
- 文档站专用覆盖都能收口在 `custom-id="docs"` 下
- 主题层配置集中管理，不会散落在各个页面里

## 4. 在文档页里渲染 Markdown

```md
<script setup lang="ts">
const source = `
# Hello docs

<thinking>
这个块会被自定义 Vue 组件接管渲染。
</thinking>
`
</script>

<MarkdownRender
  custom-id="docs"
  :content="source"
  :custom-html-tags="['thinking']"
/>
```

这里有三个关键点：

- `custom-id="docs"` 用来把覆盖范围限制在文档站
- `custom-html-tags` 告诉解析器把标签变成真正的自定义节点，而不是原样输出 HTML
- 对普通文档内容来说，`content` 比手动维护 `nodes` 更简单

## 5. 把 CSS 放到可预期的位置

如果你的文档主题有自己的样式文件，推荐在主题样式里引入 `markstream-vue/index.css`，并确保它位于 reset 或基础层之后。

```css
/* docs/.vitepress/theme/style.css */

@import 'markstream-vue/index.css' layer(components);

[data-custom-id='docs'] .prose {
  max-width: 72ch;
}
```

实用规则：

- 站点有 reset，就先加载 reset，再加载这里
- 如果你用了 Tailwind / UnoCSS，使用 `@import '...' layer(components)`
- 如果你启用了 KaTeX，还要额外引入 `katex/dist/katex.min.css`

深入看： [Tailwind 集成与样式顺序](/zh/guide/tailwind)

## 6. `thinking` 这类可信标签的推荐接法

对文档页来说，推荐流程仍然是：

1. 用 `custom-html-tags` 声明标签
2. 用 `setCustomComponents('docs', mapping)` 注册对应渲染器
3. 让页面渲染器始终带着 `custom-id="docs"`

大多数情况下这就够了。只有当源格式本身需要改 AST，而不只是换个组件渲染时，才需要 parser hooks。

深入看： [自定义标签与高级组件](/zh/guide/custom-components)、[API 参考](/zh/guide/api)

## 7. 文档站里最常见的几个坑

- 自定义标签被当成原生 HTML：少了 `custom-html-tags`
- 组件一直没生效：没有在 `enhanceApp` 注册，或映射 key 和标签名不一致
- 样式错乱：CSS 导入顺序不对，或者被 utility layer 覆盖
- 覆盖影响到别的页面：用了全局映射，没有通过 `custom-id` 限定作用域
- Mermaid 或 Monaco 在 SSR 类环境里异常：继续看对应专题页和客户端边界说明

如果页面布局或样式还是不对，先从这里排： [故障排除](/zh/guide/troubleshooting#css-looks-wrong-start-here)

## 下一步继续看

- [安装](/zh/guide/installation)：选 peer 依赖
- [使用与流式渲染](/zh/guide/usage)：理解 `content` vs `nodes`
- [自定义标签与高级组件](/zh/guide/custom-components)：处理嵌套标签和更复杂场景
- [Tailwind 集成与样式顺序](/zh/guide/tailwind)：处理 utility CSS 技术栈
- [故障排除](/zh/guide/troubleshooting)：继续排样式、peers 和 SSR
