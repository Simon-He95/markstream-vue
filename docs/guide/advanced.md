# Advanced parser hooks & low-level customization

This page is for low-level parser work: token transforms, AST reshaping, and custom node pipelines.

If you only need one of these common tasks, start elsewhere first:

- Replace a built-in renderer such as `image`, `code_block`, or `mermaid`: [Override Built-in Components](/guide/component-overrides)
- Support trusted tags such as `thinking`: [Custom Tags & Advanced Components](/guide/custom-components)
- Tune behavior without replacing renderers: [Props & Options](/guide/props)

## parseOptions
`parseOptions` can be passed to `MarkdownRender` or used directly with `parseMarkdownToStructure`.

- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — mutate tokens immediately after the `markdown-it` parse
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — further token transforms

If you need to reshape the AST, post-process the returned `ParsedNode[]` and pass it to `MarkdownRender` via the `nodes` prop.

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
- emits a `CustomComponentNode` with `type: 'thinking'` (the tag name, no angle brackets), plus `content`, optional `attrs`, and `loading/autoClosed` flags.

## Custom component parsing

The built‑in custom tag pipeline above handles most “component‑like” tags (inline or block).
Hooks are still useful when you need to reshape the node — for example, to strip wrappers, merge adjacent blocks, or map attributes:

```ts
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

function preTransformTokens(tokens: MarkdownToken[]) {
  return tokens.map((t) => {
    if (t.type === 'html_block' && t.tag === 'thinking')
      return { ...t, content: String(t.content ?? '').replace(/<\/?thinking[^>]*>/g, '').trim() }
    return t
  })
}

const md = getMarkdown()
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

### Typewriter and fade props

`MarkdownRender` accepts a `typewriter` boolean prop for the blinking stream cursor. It defaults to `false`; enable it when you want the cursor during streaming. It also accepts a separate `fade` boolean prop for the subtle non-`code_block` enter transition and appended-text fade. This lets you keep the cursor while disabling fade for deterministic SSR, print, or export flows.

Example:

```vue
<MarkdownRender :content="markdown" :typewriter="true" :fade="false" />
```

CSS variables: `--typewriter-cursor-color` tunes the cursor color; `--fade-duration` and `--fade-ease` tune the initial enter transition; `--stream-update-fade-duration` and `--stream-update-fade-ease` tune the short replayed fade used for newly appended streamed text. When the stream-specific variables are not set, the appended-text fade falls back to the same duration and easing as `fade`.

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

**Overriding default texts globally:**

If you just want to change some default UI texts (e.g., "Copy" → "复制") without setting up full i18n, use `setDefaultI18nMap` to replace the fallback translations:

```ts
import { setDefaultI18nMap } from 'markstream-vue'

setDefaultI18nMap({
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.decrease': '减少',
  'common.reset': '重置',
  'common.increase': '增加',
  'common.expand': '展开',
  'common.collapse': '收起',
  'common.preview': '预览',
  'common.source': '源码',
  'common.export': '导出',
  'common.open': '打开',
  'common.zoomIn': '放大',
  'common.zoomOut': '缩小',
  'common.resetZoom': '重置缩放',
  'image.loadError': '图片加载失败',
  'image.loading': '图片加载中...',
})
```

This is useful when:
- You don't need language switching but prefer different wording
- You want Chinese (or other language) UI by default
- You're not using `vue-i18n` but still want custom UI texts

**Default translations:**

- `common.copy`: "Copy" — Used in code block copy buttons
- `common.copied`: "Copied" — Shown after copying
- `image.loadError`: "Image failed to load" — Image fallback text
- `image.loading`: "Loading image..." — Shown while loading

This design keeps the markdown utilities pure and free from global side effects, allowing you to integrate with any i18n solution or provide static translations.

Try this — minimal example using parseOptions and a custom component registration:

```ts
import { getMarkdown, parseMarkdownToStructure, setCustomComponents } from 'markstream-vue'

const md = getMarkdown()
setCustomComponents('docs', { thinking: ThinkingNode })
const nodes = parseMarkdownToStructure('[[CUSTOM:1]]', md)
```
