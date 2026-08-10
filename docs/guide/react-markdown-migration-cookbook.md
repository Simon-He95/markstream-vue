---
title: react-markdown Migration Cookbook
description: Focused before/after examples for migrating react-markdown apps to markstream-react, covering components.code and remark-gfm changes.
keywords:
  - react-markdown migration
  - migration cookbook
  - before after examples
  - remark-gfm replacement
---
# react-markdown Migration Cookbook

This page complements the main [migration guide](/guide/react-markdown-migration) with focused before/after examples.

::: tip Prefer a runnable example?
See the hosted [React migration demo](https://markstream-react.pages.dev/migration-demo) for the same before/after shapes rendered inside the React playground.
:::

Use this page when you already know you want to migrate, and need to answer a specific question such as:

- How do I replace `components.code`?
- What happens to `remark-gfm`?
- What do I do with `rehype-raw`?
- How do I replace `urlTransform`?
- What about `allowedElements`?

## 1. Plain renderer swap

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

## 2. `components.h1` and `components.a`

`react-markdown` customizes rendered HTML tags:

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

`markstream-react` customizes node types:

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

Many `react-markdown` apps override `code` to add syntax highlighting:

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

In `markstream-react`, choose one of these:

- Keep the default `CodeBlockNode`
- Switch `code_block` to `MarkdownCodeBlockNode`
- Set `renderCodeBlocksAsPre`

Example with `MarkdownCodeBlockNode`:

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

Many `react-markdown` examples add:

```tsx
import remarkGfm from 'remark-gfm'

<Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
```

With `markstream-react`, do not re-add a plugin by default.

Start by removing it and verify whether your actual content still renders correctly. Tables, task lists, strikethrough, and code fences are already common use cases for the parser. If your app depended on very specific plugin behavior, review the output before calling the migration complete.

## 5. `rehype-raw`

Typical `react-markdown` setup:

```tsx
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'

<Markdown rehypePlugins={[rehypeRaw]}>{markdown}</Markdown>
```

In `markstream-react`, there is no public `rehype` stage.

Recommended migration path:

- If you only needed standard HTML rendering, verify the built-in HTML behavior.
- If you used trusted custom tags such as `<thinking>`, move to `customHtmlTags`.

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

Typical `react-markdown` URL rewriting:

```tsx
function rewriteDocsUrl(url: string) {
  if (url.startsWith('/docs/'))
    return `https://example.com${url}`
  return url
}

<Markdown urlTransform={rewriteDocsUrl}>{markdown}</Markdown>
```

In `markstream-react`, split this into two concerns:

- `parseOptions.validateLink` for allow/deny decisions
- custom `link` or `image` renderers for rewriting

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

Typical `react-markdown` filtering:

```tsx
<Markdown allowedElements={['h1', 'h2', 'p', 'a', 'code', 'pre']}>
  {markdown}
</Markdown>
```

There is no direct equivalent prop in `markstream-react`.

Recommended rule:

- If the allowlist is light and non-critical, migrate the renderer first and leave a TODO.
- If the allowlist is security-sensitive or user-facing, filter the parsed node tree before rendering.

That means this is usually a manual migration item, not an automatic 1:1 replacement.

## 8. Streaming as a second pass

Once the static migration is stable, you can move to the parser-driven `nodes` flow for chat/SSE/AI rendering:

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

This step is optional. Do not force it when the repository only needs static markdown rendering.

## Related docs

- [Migrate from react-markdown](/guide/react-markdown-migration)
- [React Installation](/guide/react-installation)
- [React Components & API](/guide/react-components)
- [Parser API](/guide/parser-api)
