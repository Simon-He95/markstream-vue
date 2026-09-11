# markstream-solid

Solid streaming Markdown renderer for incomplete Markdown, AI chat output, code blocks, KaTeX, Mermaid, D2, and Infographic.

```bash
pnpm add markstream-solid solid-js
```

Optional renderers are peers:

```bash
pnpm add stream-diffs katex mermaid @terrastruct/d2 @antv/infographic
```

```tsx
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, final: boolean }) {
  return <MarkdownRender content={props.content} final={props.final} />
}
```

Register custom node components globally or by `customId`:

```tsx
import { setCustomComponents } from 'markstream-solid'

setCustomComponents('chat', {
  thinking: props => <section>{props.node.content}</section>,
})
```

The package also exposes `index.tailwind.css`, `index.px.css`, Worker clients under `workers/*`, and optional loader configuration APIs.
