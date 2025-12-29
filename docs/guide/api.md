# API guide

This page connects the parser helpers, renderer props, and customization hooks exposed by `markstream-vue`. Pair it with the [Usage](/guide/usage) and [Props](/guide/props) pages when wiring everything together.

## Render pipeline at a glance

```
Markdown string → getMarkdown() → markdown-it-ts instance
            ↓
   parseMarkdownToStructure() → AST (BaseNode[])
            ↓
   <MarkdownRender> → node components (CodeBlockNode, ImageNode, …)
```

You can jump in at any stage:
- Provide `content` to let the component handle parsing automatically.
- Provide `nodes` when you need full control over the AST (server-side parsing, custom transforms).

## Parser helpers

| Helper | Purpose | When to use |
| ------ | ------- | ----------- |
| `getMarkdown(msgId?, options?)` | Returns a configured `markdown-it-ts` instance with the plugins this package expects. | Customize parser options (HTML toggles, additional plugins) before transforming tokens. |
| `parseMarkdownToStructure(content, md?)` | Generates the AST consumed by `MarkdownRender`. Accepts either a markdown string or tokens. | Pre-parse on the server, run validations, or reuse the AST across renders. |

Both helpers are framework-agnostic and can run in Node or the browser. For large documents you can reuse the `md` instance between parses to avoid re-initializing plugins.

## Custom components & scoping

Use `setCustomComponents(customId?, mapping)` to override any node renderer. Pair it with the `custom-id` prop on `MarkdownRender` so replacements stay scoped.

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

Tips:
- Use descriptive IDs (`docs`, `playground`, `pdf-export`) for tracing.
- Call `setCustomComponents(undefined, mapping)` to set globals, but prefer scoped IDs to avoid surprises in multi-instance apps.
- Clean up mappings in SPA routers if you register them dynamically.

## Parse hooks & transforms

When passing `content`, you can intercept parser stages through `parse-options` (prop) or the `ParseOptions` parameter of `parseMarkdownToStructure`.

Hooks:
- `preTransformTokens(tokens)` — mutate tokens before default handling.
- `postTransformTokens(tokens)` — inspect/adjust tokens before node generation.
- `postTransformNodes(nodes)` — modify the AST right before rendering.

Example: render AI “thinking” tags as custom components (no hooks needed):

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

Hooks remain useful if you want to reshape the emitted `thinking` node (strip wrappers, remap attrs, merge blocks, etc.).

## Utility exports

Besides the core renderer and parser helpers, the package exposes:

- `CodeBlockNode`, `MarkdownCodeBlockNode`, `MermaidBlockNode`, `MathBlockNode`, `ImageNode`, etc. — see [Components](/guide/components) for their props and CSS requirements.
- `VisibilityWrapper`, `NodeRenderer`, and type exports under `types`.

For parser types and hooks, see [/guide/parser-api](/guide/parser-api) (or the `stream-markdown-parser` README on npm).

## Styling + troubleshooting reminders

- Always include a reset before `markstream-vue/index.css` and wrap it with `@layer components` when using Tailwind or UnoCSS. See the [Tailwind guide](/guide/tailwind) and the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here).
- Code/graph peers (Monaco, Shiki, Mermaid, KaTeX) each need their own CSS imports. Missing styles often manifest as blank editors or invisible formulas.
- Use `custom-id` to scope overrides and avoid global selector conflicts.

Need more examples? Jump into the [Playground](/guide/playground) or run `pnpm play` locally to experiment with custom parsers and renderers.
