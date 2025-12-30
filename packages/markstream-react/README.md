# markstream-react

React renderer that consumes the structured AST output from `stream-markdown-parser` and renders it with lightweight semantic HTML components. This is the React counter-part to the Vue renderer that powers `markstream-vue`.

## Development

```bash
pnpm --filter markstream-react dev
```

## Build

```bash
pnpm --filter markstream-react build
```

## Usage

```tsx
import { NodeRenderer } from 'markstream-react'
import 'markstream-react/index.css'

export default function Article({ markdown }: { markdown: string }) {
  return (
    <NodeRenderer content={markdown} />
  )
}
```

You can also pass a pre-parsed `nodes` array if you already have AST data.

## Custom components (e.g. `<thinking>`)

Custom tag-like blocks are exposed as nodes with `type: '<tag>'` (for example `type: 'thinking'`) when you register the tag in `customHtmlTags` or register a custom component mapping for it.

```tsx
import type { NodeComponentProps } from 'markstream-react'
import { NodeRenderer, setCustomComponents } from 'markstream-react'

function ThinkingNode(props: NodeComponentProps<{ type: 'thinking', content: string }>) {
  const { node, ctx } = props
  return (
    <div className="thinking-node">
      <div className="thinking-title">Thinking</div>
      <NodeRenderer
        content={node.content}
        customId={ctx?.customId}
        isDark={ctx?.isDark}
        typewriter={false}
        batchRendering={false}
        deferNodesUntilVisible={false}
        viewportPriority={false}
        maxLiveNodes={0}
      />
    </div>
  )
}

setCustomComponents('chat', { thinking: ThinkingNode })
```
