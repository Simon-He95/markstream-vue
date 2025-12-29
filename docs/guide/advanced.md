# Advanced customization — parseOptions & custom nodes

This page explains how to customize parsing and provide scoped custom components.

## parseOptions
`parseOptions` can be passed to `MarkdownRender` or used directly with `parseMarkdownToStructure`.

- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — mutate tokens immediately after the `markdown-it` parse
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — further token transforms
- `postTransformNodes?: (nodes: ParsedNode[]) => ParsedNode[]` — manipulate final node tree

### Example: custom HTML-like tags (recommended)
For simple custom tags like `<thinking>...</thinking>`, you no longer need to normalize the source or rewrite tokens. Just opt the tag into the allowlist and register a component:

```ts
import { setCustomComponents } from 'markstream-vue'
import ThinkingNode from './ThinkingNode.vue'

setCustomComponents('docs', { thinking: ThinkingNode })
```

```vue
<MarkdownRender
  custom-id="docs"
  :custom-html-tags="['thinking']"
  :content="markdown"
/>
```

When `custom-html-tags` includes a tag name, the parser:
- suppresses streaming mid‑states until `<tag ...>` is complete,
- emits a `CustomComponentNode` with `type: '<tag>'`, `content`, optional `attrs`, and `loading/autoClosed` flags.

## Custom component parsing

The built‑in custom tag pipeline above handles most “component‑like” tags (inline or block).
Hooks are still useful when you need to reshape the node — for example, to strip wrappers, merge adjacent blocks, or map attributes:

```ts
function preTransformTokens(tokens: MarkdownToken[]) {
  return tokens.map((t) => {
    if (t.type === 'html_block' && t.tag === 'thinking')
      return { ...t, content: String(t.content ?? '').replace(/<\/?thinking[^>]*>/g, '').trim() }
    return t
  })
}

const nodes = parseMarkdownToStructure(markdown, md, { preTransformTokens })
```

Alternative flows (pick what fits your pipeline):
- Have the backend split `thinking` into its own field/type; render `thinking` with one `MarkdownRender` and the remaining content with another, so the parser never sees raw custom HTML inline.
- Replace custom blocks with placeholders before parsing: capture `<thinking>...</thinking>` via regex, render the cleaned body with `MarkdownRender`, then swap placeholders back to your custom component. When `thinking` is always at the top, you can also slice the head section out for dedicated rendering.

## setCustomComponents(id, mapping)
- Use `setCustomComponents('docs', { thinking: ThinkingComponent })` to scope to `MarkdownRender` instances with `custom-id="docs"`.
- Call `removeCustomComponents` to clean up mappings and avoid memory leaks in single-page apps.

## Scoped example
```vue
<MarkdownRender content="..." custom-id="docs" />
// In setup
setCustomComponents('docs', { thinking: ThinkingNode })
```

Advanced hooks are a powerful way to add domain-specific grammar to Markdown without changing the core parser.

### Typewriter prop

`MarkdownRender` accepts a `typewriter` boolean prop which controls whether non-`code_block` nodes are wrapped with a small enter transition. This is useful for demo UIs but may be undesirable in SSR or print/export flows where deterministic output is needed.

Example:

```vue
<MarkdownRender :content="markdown" :typewriter="false" />
```

CSS variables: `--typewriter-fade-duration` and `--typewriter-fade-ease` are available for theme tuning.

## Internationalization (i18n)

By default, `getMarkdown` uses English text for UI elements (e.g., "Copy" button in code blocks). You can customize these texts by providing an `i18n` option:

**Using a translation map:**

```ts
import { getMarkdown } from 'markstream-vue'

const md = getMarkdown('editor-1', {
  i18n: {
    'common.copy': '复制',
  }
})
```

**Using a translation function:**

```ts
import { getMarkdown } from 'markstream-vue'
import { useI18n } from 'vue-i18n' // or any i18n library

const { t } = useI18n()

const md = getMarkdown('editor-1', {
  i18n: (key: string) => t(key)
})
```

**Default translations:**

- `common.copy`: "Copy" — Used in code block copy buttons

This design keeps the markdown utilities pure and free from global side effects, allowing you to integrate with any i18n solution or provide static translations.

Try this — minimal example using parseOptions and a custom component registration:

```ts
import { parseMarkdownToStructure, setCustomComponents } from 'markstream-vue'

setCustomComponents('docs', { thinking: ThinkingNode })
const nodes = parseMarkdownToStructure('[[CUSTOM:1]]')
```
