---
title: react-markdown 迁移 Cookbook
description: react-markdown 迁移 Cookbook，提供 code 组件替换、remark-gfm、rehype-raw 与 urlTransform 等常见场景的 before/after 示例。
keywords:
  - react-markdown 迁移
  - Markdown 迁移
  - 迁移示例
---

# react-markdown 迁移 Cookbook

这一页是对主迁移指南 [从 react-markdown 迁移](/zh/guide/react-markdown-migration) 的补充，专门放常见场景的 before / after 示例。

::: tip 想看可运行的例子？
可以直接打开线上 [React migration demo](https://markstream-react.pages.dev/migration-demo)，在 React playground 里查看同一套 before / after 和审计输出。
:::

当你已经确定要迁移，但卡在这些具体问题时，就看这一页：

- `components.code` 怎么替换？
- `remark-gfm` 怎么办？
- `rehype-raw` 怎么迁？
- `urlTransform` 怎么替？
- `allowedElements` 怎么处理？

## 1. 纯渲染器替换

```tsx
// before
import Markdown from 'react-markdown'

export function Article({ markdown }: { markdown: string }) {
  return <Markdown>{markdown}</Markdown>
}
```

```tsx
// after
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function Article({ markdown }: { markdown: string }) {
  return <MarkdownRender content={markdown} />
}
```

## 2. `components.h1` 和 `components.a`

`react-markdown` 的自定义通常是围绕 HTML tag：

```tsx
import Markdown from 'react-markdown'

<Markdown
  components={{
    h1({ children }) {
      return <h1 className="docs-title">{children}</h1>
    },
    a({ href, children }) {
      return <a href={href} target="_blank" rel="noreferrer">{children}</a>
    },
  }}
>
  {markdown}
</Markdown>
```

`markstream-react` 则是围绕节点类型：

```tsx
import type { NodeComponentProps } from 'markstream-react'
import MarkdownRender, { setCustomComponents } from 'markstream-react'

function CustomHeading({ node, ctx, renderNode, indexKey }: NodeComponentProps<any>) {
  const Tag = `h${node.level || 1}` as keyof JSX.IntrinsicElements

  return (
    <Tag className="docs-title">
      {node.children?.map((child: any, i: number) =>
        renderNode && ctx
          ? renderNode(child, `${String(indexKey)}-heading-${i}`, ctx)
          : null,
      )}
    </Tag>
  )
}

function CustomLink({ node, ctx, renderNode, indexKey }: NodeComponentProps<any>) {
  return (
    <a href={node.href} target="_blank" rel="noreferrer">
      {node.children?.map((child: any, i: number) =>
        renderNode && ctx
          ? renderNode(child, `${String(indexKey)}-link-${i}`, ctx)
          : null,
      )}
    </a>
  )
}

setCustomComponents('docs', {
  heading: CustomHeading,
  link: CustomLink,
})

export function Article({ markdown }: { markdown: string }) {
  return <MarkdownRender customId="docs" content={markdown} />
}
```

## 3. `components.code`

很多 `react-markdown` 项目会覆盖 `code` 来接代码高亮：

```tsx
<Markdown
  components={{
    code({ className, children, ...rest }) {
      const isBlock = /language-/.test(className || '')

      if (isBlock) {
        return (
          <pre className="docs-code">
            <code className={className} {...rest}>
              {children}
            </code>
          </pre>
        )
      }

      return <code {...rest}>{children}</code>
    },
  }}
>
  {markdown}
</Markdown>
```

在 `markstream-react` 里，一般选这三条之一：

- 继续用默认 `CodeBlockNode`
- 把 `code_block` 切到 `MarkdownCodeBlockNode`
- 设置 `renderCodeBlocksAsPre`

下面是 `MarkdownCodeBlockNode` 的例子：

```tsx
import MarkdownRender, { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-react'

setCustomComponents('docs', {
  code_block: ({ node, isDark, ctx }: any) => (
    <MarkdownCodeBlockNode
      node={node}
      isDark={isDark}
      stream={ctx?.codeBlockStream}
      {...(ctx?.codeBlockProps || {})}
    />
  ),
})

export function Article({ markdown }: { markdown: string }) {
  return <MarkdownRender customId="docs" content={markdown} />
}
```

## 4. `remark-gfm`

很多 `react-markdown` 示例会这样写：

```tsx
import remarkGfm from 'remark-gfm'

<Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
```

在 `markstream-react` 里，不要默认把它重新接回来。

先删掉，再观察你的真实内容是否仍然正常。表格、任务列表、删除线、代码围栏这些本来就是解析器常见覆盖场景；如果你依赖某些非常具体的插件行为，再做额外回归确认。

## 5. `rehype-raw`

典型 `react-markdown` 写法：

```tsx
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'

<Markdown rehypePlugins={[rehypeRaw]}>{markdown}</Markdown>
```

到了 `markstream-react`，已经没有公开的 `rehype` 阶段。

推荐迁移规则：

- 如果你只是要标准 HTML 渲染，请直接验证内置 HTML 行为。
- 如果你接它是为了支持 `<thinking>` 之类的可信自定义标签，请改用 `customHtmlTags`。

```tsx
import type { NodeComponentProps } from 'markstream-react'
import MarkdownRender, { setCustomComponents } from 'markstream-react'

function ThinkingNode({ node }: NodeComponentProps<any>) {
  return <aside className="thinking-box">{node.content}</aside>
}

setCustomComponents('chat', { thinking: ThinkingNode })

export function Message({ markdown }: { markdown: string }) {
  return (
    <MarkdownRender
      customId="chat"
      content={markdown}
      customHtmlTags={['thinking']}
    />
  )
}
```

## 6. `urlTransform`

典型 `react-markdown` URL 改写：

```tsx
function rewriteDocsUrl(url: string) {
  if (url.startsWith('/docs/'))
    return `https://example.com${url}`
  return url
}

<Markdown urlTransform={rewriteDocsUrl}>{markdown}</Markdown>
```

在 `markstream-react` 中，建议拆成两层：

- `parseOptions.validateLink` 负责放行/拦截
- 自定义 `link` / `image` 渲染器负责改写 URL

```tsx
import type { NodeComponentProps } from 'markstream-react'
import MarkdownRender, { setCustomComponents } from 'markstream-react'

function rewriteDocsUrl(url: string) {
  if (url.startsWith('/docs/'))
    return `https://example.com${url}`
  return url
}

function CustomLink({ node, ctx, renderNode, indexKey }: NodeComponentProps<any>) {
  const href = rewriteDocsUrl(node.href)

  return (
    <a href={href}>
      {node.children?.map((child: any, i: number) =>
        renderNode && ctx
          ? renderNode(child, `${String(indexKey)}-link-${i}`, ctx)
          : null,
      )}
    </a>
  )
}

setCustomComponents('docs', { link: CustomLink })

export function Article({ markdown }: { markdown: string }) {
  return <MarkdownRender customId="docs" content={markdown} />
}
```

## 7. `allowedElements`

典型 `react-markdown` 过滤：

```tsx
<Markdown allowedElements={['h1', 'h2', 'p', 'a', 'code', 'pre']}>
  {markdown}
</Markdown>
```

`markstream-react` 没有直接对等的 prop。

推荐规则：

- 如果这个 allowlist 很轻、不是关键安全边界，可以先完成渲染器迁移，再留 TODO。
- 如果这是安全或核心展示要求的一部分，就在渲染前自己过滤解析后的节点树。

也就是说，这一项通常属于“手工迁移项”，而不是自动 1:1 替换项。

## 8. 把流式能力当作第二阶段

等静态迁移稳定后，如果你有聊天 / SSE / AI 输出，再考虑升到 `nodes` 模式：

```tsx
import MarkdownRender from 'markstream-react'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

declare const messageId: string
const md = getMarkdown(`chat-${messageId}`)
const nodes = parseMarkdownToStructure(buffer, md, { final: done })

export function Message() {
  return <MarkdownRender nodes={nodes} viewportPriority deferNodesUntilVisible />
}
```

这一步是可选项。不要为了“看起来更高级”而强行把纯静态场景也改成流式。

## 相关文档

- [从 react-markdown 迁移](/zh/guide/react-markdown-migration)
- [React 安装](/zh/guide/react-installation)
- [React 组件与 API](/zh/guide/react-components)
- [解析器 API](/zh/guide/parser-api)
