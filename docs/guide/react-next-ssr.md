---
title: Next.js SSR Markdown renderer with markstream-react
description: Render Markdown in Next.js App Router and Pages Router with markstream-react/next for SSR-first HTML, markstream-react/server for server-only rendering, and client components for live AI chat streams.
keywords:
  - Next.js Markdown renderer
  - Next.js streaming Markdown
  - Next.js AI chat Markdown
  - markstream-react next
  - React SSR Markdown renderer
  - server-rendered Markdown React
faq:
  - question: Can markstream-react render Markdown on the Next.js server?
    answer: Yes. Use markstream-react/next for server HTML plus hydration, or markstream-react/server for server-only Markdown rendering.
  - question: Should live SSE Markdown streams use a Client Component?
    answer: Yes. Live SSE and WebSocket streams should use the root markstream-react package inside a Client Component.
---

# Next.js SSR Markdown renderer with markstream-react

`markstream-react` now exposes two explicit SSR entrypoints for Next.js:

- `markstream-react/next`: the official Next entry. Import it from App Router server components or Pages Router SSR pages when you want real server HTML first and client enhancement after hydration.
- `markstream-react/server`: a pure server entry. Use it when you want a stable server-only render path with no client component boundary.

Import styles once from your app shell:

```tsx
// app/layout.tsx or pages/_app.tsx
import 'markstream-react/index.css'
import 'katex/dist/katex.min.css'
```

## App Router with `markstream-react/next`

```tsx
import MarkdownRender from 'markstream-react/next'

const markdown = `# Hello Next.js

This route ships real SSR HTML first.`

export default function Page() {
  return <MarkdownRender content={markdown} final />
}
```

Direct component maps contain React component functions, so keep them inside a local Client Component wrapper when you use `markstream-react/next` from an App Router Server Component. Server Components should only pass serializable props such as `content` into that wrapper, matching the [Next.js Client Component prop rules](https://nextjs.org/docs/app/api-reference/directives/use-client).

```tsx
// app/markdown-renderer.tsx
'use client'

import type { NodeComponentProps } from 'markstream-react/next'
import MarkdownRender, { defineStreamingComponents } from 'markstream-react/next'

function DocumentLink(props: NodeComponentProps<{ content: string }>) {
  return <a>{props.node.content}</a>
}

const streamingComponents = defineStreamingComponents({
  documentlink: DocumentLink,
})

export function ClientMarkdown({ content }: { content: string }) {
  return (
    <MarkdownRender
      content={content}
      final
      streamingComponents={streamingComponents}
    />
  )
}
```

```tsx
// app/page.tsx
import { ClientMarkdown } from './markdown-renderer'

export default function Page() {
  return <ClientMarkdown content="<DocumentLink>Open</DocumentLink>" />
}
```

## Pure Server Rendering with `markstream-react/server`

```tsx
import MarkdownRender from 'markstream-react/server'

const markdown = `# Server entry

This path stays fully server-rendered.`

export default function Page() {
  return <MarkdownRender content={markdown} final />
}
```

The pure server entry does not create a Client Component boundary, so server files can pass `streamingComponents` and `htmlComponents` directly when the render should remain server-only.

## Custom Components and Custom Tags

If you register overrides from a server file, prefer the server helpers so you avoid importing the root package side effects:

```tsx
import MarkdownRender, { setCustomComponents } from 'markstream-react/server'

setCustomComponents('next-ssr-demo', {
  thinking: ({ children }: any) => <aside data-ssr-status="thinking-tag">{children}</aside>,
})
```

Then render with `customId="next-ssr-demo"` and `customHtmlTags={['thinking']}`.

Current SSR acceptance also covers:

- `customId` scoping isolation
- custom node children rendered into the initial HTML
- `customHtmlTags` attributes preserved in the initial HTML

## TypeScript

`markstream-react/next` and `markstream-react/server` both publish standalone declaration files. You can import shared prop types directly from the entrypoint you use:

```tsx
import type {
  HtmlPreviewFrameProps,
  NodeRendererProps,
  TooltipProps,
} from 'markstream-react/next'
```

## Current Verification Commands

```bash
pnpm exec vitest run test/markstream-react-next-ssr.test.tsx
pnpm --filter markstream-react build
pnpm run test:e2e:next-ssr
```
