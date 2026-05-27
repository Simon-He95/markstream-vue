# Vue 2 Components & API

markstream-vue2 provides the same powerful components as markstream-vue, but built for Vue 2. All components are compatible with Vue 2.6+ (with `@vue/composition-api`) and Vue 2.7+.

## TypeScript exports

`markstream-vue2` exports renderer and component prop interfaces:

```ts
import type {
  CodeBlockNodeProps,
  D2BlockNodeProps,
  InfographicBlockNodeProps,
  MermaidBlockNodeProps,
  NodeRendererProps,
  PreCodeNodeProps,
} from 'markstream-vue2'
import type { CodeBlockNode } from 'stream-markdown-parser'
```

Notes:
- `NodeRendererProps` matches `<MarkdownRender>` props.
- `CodeBlockNodeProps`, `MermaidBlockNodeProps`, `D2BlockNodeProps`, `InfographicBlockNodeProps`, and `PreCodeNodeProps` all use `CodeBlockNode` for `node` (use `language: 'mermaid'` / `language: 'd2'` / `language: 'd2lang'` / `language: 'infographic'` to route specialized renderers).

## Main Component: MarkdownRender

The primary component for rendering markdown content in Vue 2.

### Props

`MarkdownRender` in Vue 2 mirrors the Vue 3 renderer props. In templates, use kebab-case.

#### Core props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | - | Markdown content to render |
| `nodes` | `BaseNode[]` | - | Pre-parsed AST nodes (typically `ParsedNode[]` from the parser) |
| `custom-id` | `string` | - | Identifier for scoping custom components and CSS (`[data-custom-id="..."]`) |
| `final` | `boolean` | `false` | Marks the input as end-of-stream; stops emitting streaming `loading` nodes |
| `parse-options` | `ParseOptions` | - | Parser options and token hooks (only when `content` is provided) |
| `custom-html-tags` | `string[]` | - | HTML-like tags emitted as custom nodes (e.g. `thinking`) |
| `html-policy` | `'safe' \| 'escape' \| 'trusted'` | `'safe'` | Controls `html_block` / `html_inline` rendering. `safe` blocks active/embed/form tags, `escape` shows literal HTML text, and `trusted` restores the broader trusted HTML behavior while still stripping scripts and unsafe attrs. |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | - | Customize the internal MarkdownIt instance |
| `debug-performance` | `boolean` | `false` | Log parse/render timing and virtualization stats (dev only) |
| `is-dark` | `boolean` | `false` | Theme flag forwarded to heavy nodes; adds `.dark` to the root container |
| `index-key` | `number \| string` | - | Key prefix when rendering multiple instances in lists |
| `typewriter` | `boolean` | `false` | Shows the blinking typewriter cursor while streamed content grows |
| `fade` | `boolean` | `true` | Enables non-code-node enter fade and appended-text fade |
| `show-tooltips` | `boolean` | `true` | Global tooltip switch for `LinkNode` and code block nodes |

#### Streaming & heavy-node toggles

| Prop | Default | Description |
|------|---------|-------------|
| `render-code-blocks-as-pre` | `false` | Render non-Mermaid/Infographic/D2 code blocks as `<pre><code>` |
| `code-block-stream` | `true` | Stream code block updates as content arrives |
| `viewport-priority` | `true` | Defer heavy work (Monaco/Mermaid/D2/KaTeX) until near viewport |
| `defer-nodes-until-visible` | `true` | Render heavy nodes as placeholders until visible (non-virtualized mode only) |
| `smooth-streaming` | `'auto'` | Enables built-in pacing for streaming `content` updates (`boolean | 'auto'`) |
| `smooth-streaming-options` | - | Fine-tune pacing (`SmoothMarkdownStreamOptions`) |

#### Performance (virtualization & batching)

| Prop | Default | Description |
|------|---------|-------------|
| `max-live-nodes` | `320` | Max fully rendered nodes kept in DOM (set `0` to disable virtualization) |
| `live-node-buffer` | `60` | Overscan buffer around the focus range |
| `batch-rendering` | `true` | Incremental batch rendering when virtualization is disabled |
| `initial-render-batch-size` | `40` | Nodes rendered immediately before batching starts |
| `render-batch-size` | `80` | Nodes rendered per batch tick |
| `render-batch-delay` | `16` | Extra delay (ms) before each batch after rAF |
| `render-batch-budget-ms` | `6` | Time budget (ms) before adaptive batch sizes shrink |
| `render-batch-idle-timeout-ms` | `120` | Timeout (ms) for `requestIdleCallback` slices |

#### Global code block options

| Prop | Type | Description |
|------|------|-------------|
| `code-block-dark-theme` | `any` | Monaco dark theme object forwarded to every `CodeBlockNode` |
| `code-block-light-theme` | `any` | Monaco light theme object forwarded to every `CodeBlockNode` |
| `code-block-monaco-options` | `Record<string, any>` | Options forwarded to `stream-monaco`, including diff hover-action settings like `diffHunkActionsOnHover`, `diffHunkHoverHideDelayMs`, and `onDiffHunkAction` |
| `code-block-min-width` | `string \| number` | Min width forwarded to `CodeBlockNode` |
| `code-block-max-width` | `string \| number` | Max width forwarded to `CodeBlockNode` |
| `code-block-props` | `Record<string, any>` | Extra props forwarded to every `CodeBlockNode` |
| `mermaid-props` | `Partial<Omit<MermaidBlockNodeProps, 'node' \| 'loading' \| 'isDark'>>` | Extra props forwarded to Mermaid fences and custom `mermaid` renderers |
| `d2-props` | `Partial<Omit<D2BlockNodeProps, 'node' \| 'loading' \| 'isDark'>>` | Extra props forwarded to D2 fences and custom `d2` renderers |
| `infographic-props` | `Partial<Omit<InfographicBlockNodeProps, 'node' \| 'loading' \| 'isDark'>>` | Extra props forwarded to infographic fences and custom `infographic` renderers |
| `themes` | `string[]` | Theme list forwarded to `stream-monaco` |

#### Heavy renderer prop forwarding

`MarkdownRender` can tune heavy blocks directly:

```vue
<MarkdownRender
  :content="markdown"
  :viewport-priority="true"
  :mermaid-props="{
    showHeader: false,
    renderDebounceMs: 180,
    previewPollDelayMs: 500
  }"
  :d2-props="{ progressiveIntervalMs: 500 }"
  :infographic-props="{ showHeader: false }"
/>
```

Streaming notes:
- Keep `viewport-priority` enabled to prevent offscreen Mermaid / Monaco / D2 work from running while text is still streaming.
- For jittery SSE or AI token streams, start with `content` + built-in `smooth-streaming`.
- Use `nodes` when a worker, store, or custom AST pipeline already owns parsing.
- Mermaid strict mode is now the default. Set `:mermaid-props="{ isStrict: false }"` only for trusted diagrams that need loose Mermaid HTML-label behavior.
- Common Mermaid tuning keys: `renderDebounceMs`, `contentStableDelayMs`, `previewPollDelayMs`, `previewPollMaxDelayMs`, `previewPollMaxAttempts`.

Trusted compatibility example:

```vue
<MarkdownRender
  :content="trustedMarkdown"
  html-policy="trusted"
  :mermaid-props="{ isStrict: false }"
/>
```

#### Events

- `@copy`, `@handleArtifactClick`, `@click`, `@mouseover`, `@mouseout`

### Usage

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: '# Hello Vue 2!'
    }
  },
  methods: {
  }
}
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="markdown"
    :max-live-nodes="150"
  />
</template>
```

## Code Block Components

### MarkdownCodeBlockNode

Lightweight code highlighting using Shiki.

```vue
<script>
import { MarkdownCodeBlockNode } from 'markstream-vue2'

export default {
  components: { MarkdownCodeBlockNode },
  data() {
    return {
      codeNode: {
        type: 'code_block',
        language: 'javascript',
        code: 'const hello = "world"',
        raw: 'const hello = "world"'
      }
    }
  },
  methods: {
    handleCopy() {
      alert('Code copied!')
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MarkdownCodeBlockNode
      :node="codeNode"
      :show-copy-button="true"
      @copy="handleCopy"
    >
      <template #header-right>
        <span class="lang-badge">{{ codeNode.language }}</span>
      </template>
    </MarkdownCodeBlockNode>
  </div>
</template>
```

### CodeBlockNode

Feature-rich Monaco-powered code blocks.

```vue
<script>
import { CodeBlockNode } from 'markstream-vue2'

export default {
  components: { CodeBlockNode },
  data() {
    return {
      codeNode: {
        type: 'code_block',
        language: 'typescript',
        code: 'const greeting: string = "Hello"',
        raw: 'const greeting: string = "Hello"'
      }
    }
  },
  methods: {
    handleCopy(code) {
      console.log('Code copied:', code)
    },
    handlePreviewCode(artifact) {
      console.log('Preview code:', artifact)
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <CodeBlockNode
      :node="codeNode"
      :monaco-options="{ fontSize: 14, theme: 'vs-dark' }"
      :stream="true"
      @copy="handleCopy"
      @preview-code="handlePreviewCode"
    />
  </div>
</template>
```

## Math Components

### MathBlockNode

Renders block-level math formulas with KaTeX.

```vue
<script>
import { MathBlockNode } from 'markstream-vue2'

export default {
  components: { MathBlockNode },
  data() {
    return {
      mathNode: {
        type: 'math_block',
        content: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
        raw: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}'
      }
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MathBlockNode
      :node="mathNode"
    />
  </div>
</template>
```

### MathInlineNode

Renders inline math formulas.

```vue
<script>
import { MathInlineNode } from 'markstream-vue2'

export default {
  components: { MathInlineNode },
  data() {
    return {
      inlineMathNode: {
        type: 'math_inline',
        content: 'E = mc^2',
        raw: 'E = mc^2'
      }
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <p>
      The formula is:
      <MathInlineNode :node="inlineMathNode" />
    </p>
  </div>
</template>
```

## Mermaid Diagrams

### MermaidBlockNode

Progressive Mermaid diagram rendering.

#### Quick reference
- **Tooltip control**: `showTooltips` defaults to `true`; set `false` to disable header action tooltips.

```vue
<script>
import { MermaidBlockNode } from 'markstream-vue2'

export default {
  components: { MermaidBlockNode },
  data() {
    return {
      mermaidNode: {
        type: 'code_block',
        language: 'mermaid',
        code: `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]`,
        raw: ''
      }
    }
  },
  methods: {
    onExport(ev) {
      console.log('Mermaid SVG:', ev.svgString)
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MermaidBlockNode
      :node="mermaidNode"
      :is-strict="true"
      :render-debounce-ms="180"
      :preview-poll-delay-ms="500"
      :show-tooltips="true"
      @export="onExport"
    />
  </div>
</template>
```

Useful streaming props:
- `render-debounce-ms`
- `content-stable-delay-ms`
- `preview-poll-delay-ms`
- `preview-poll-max-delay-ms`
- `preview-poll-max-attempts`

## D2 Diagrams

### D2BlockNode

Progressive D2 diagram rendering with source fallback.

```vue
<script>
import { D2BlockNode } from 'markstream-vue2'

export default {
  components: { D2BlockNode },
  data() {
    return {
      d2Node: {
        type: 'code_block',
        language: 'd2',
        code: `direction: right
Client -> API: request
API -> DB: query`,
        raw: ''
      }
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <D2BlockNode
      :node="d2Node"
      :progressive-interval-ms="600"
    />
  </div>
</template>
```

## Utility Functions

### setCustomComponents

Register custom node renderers for specific markdown nodes.

```js
import { setCustomComponents } from 'markstream-vue2'

// Define custom component
const CustomHeading = {
  name: 'CustomHeading',
  props: ['node', 'indexKey', 'customId'],
  render(h) {
    const level = this.node.level || 1
    return h(`h${level}`, {
      class: 'custom-heading',
      attrs: { 'data-custom-id': this.customId }
    }, this.node.children.map(c => c.content))
  }
}

// Register globally
setCustomComponents('docs', {
  heading: CustomHeading
})
```

### getMarkdown

Get a configured markdown-it instance.

```js
import { getMarkdown } from 'markstream-vue2'

const md = getMarkdown('my-msg-id', {
  html: true,
  linkify: true,
  typographer: true
})

const tokens = md.parse('# Hello World')
```

### parseMarkdownToStructure

Parse markdown string to AST structure.

```js
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue2'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# Title\n\nContent here...', md)

// Use with MarkdownRender
// <MarkdownRender :nodes="nodes" />
```

### enableKatex / enableMermaid / enableD2

(Re)enable feature loaders for KaTeX, Mermaid, and D2. Default loaders are already on; call these only if you disabled them earlier or want to override the loader (for example, using a CDN build).

```js
import { enableD2, enableKatex, enableMermaid } from 'markstream-vue2'

// Enable KaTeX loader
enableKatex()

// Enable Mermaid loader
enableMermaid()

// Enable D2 loader
enableD2()
```

## Custom Component API

### Props Interface

All custom node components receive these props:

```ts
interface NodeComponentProps {
  node: ParsedNode // The parsed node data
  indexKey: number | string // Unique key for the node
  customId?: string // Custom ID for scoping
  isDark?: boolean // Forwarded theme flag (from MarkdownRender)
  typewriter?: boolean // Forwarded typewriter flag (non-code nodes only)
  loading?: boolean // Streaming/loading state (from node.loading)
}
```

### Example Custom Component

```vue
<script>
export default {
  name: 'CustomParagraph',
  props: {
    node: {
      type: Object,
      required: true
    },
    indexKey: {
      type: [Number, String],
      default: 0
    },
    customId: {
      type: String,
      default: ''
    }
  },
  computed: {
    tag() {
      return 'p'
    },
    classes() {
      return [
        'custom-paragraph',
        `custom-paragraph-${this.indexKey}`
      ]
    },
    attrs() {
      return {
        'data-custom-id': this.customId,
        'data-node-type': this.node.type
      }
    }
  }
}
</script>

<template>
  <component
    :is="tag"
    :class="classes"
    v-bind="attrs"
  >
    <slot>
      <template v-for="(child, i) in node.children">
        <span v-if="child.type === 'text'" :key="i">
          {{ child.content }}
        </span>
        <!-- Handle other node types... -->
      </template>
    </slot>
  </component>
</template>

<style scoped>
.custom-paragraph {
  line-height: 1.7;
  color: #333;
}
</style>
```

## Streaming Support

markstream-vue2 supports streaming markdown content with the `loading` state on nodes:

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      streamingContent: '',
      fullContent: `# Streaming Demo

This content streams in **small chunks**.

\`\`\`javascript
console.log('Streaming...')
\`\`\`
`
    }
  },
  mounted() {
    this.startStreaming()
  },
  methods: {
    startStreaming() {
      let i = 0
      const interval = setInterval(() => {
        if (i < this.fullContent.length) {
          this.streamingContent += this.fullContent[i]
          i++
        }
        else {
          clearInterval(interval)
        }
      }, 30)
    }
  }
}
</script>

<template>
  <div>
    <MarkdownRender :content="streamingContent" />
  </div>
</template>
```

## TypeScript Support

markstream-vue2 includes full TypeScript definitions. For Vue 2.6.x, configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@vue/composition-api", "markstream-vue2"],
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

For Vue 2.7+, types are included automatically:

```ts
import type { ParsedNode } from 'markstream-vue2'
import MarkdownRender from 'markstream-vue2'

// Your component with proper typing
import { defineComponent, ref } from 'vue'

export default defineComponent({
  components: { MarkdownRender },
  setup() {
    const markdown = ref('# Hello')
    const nodes = ref<ParsedNode[]>([])

    return { markdown, nodes }
  }
})
```

## Differences from Vue 3 Version

The Vue 2 version maintains API compatibility with the Vue 3 version with these considerations:

1. **Composition API**: Requires Vue 2.7+ or `@vue/composition-api` for Vue 2.6.x
2. **Slots**: Use Vue 2 scoped slot syntax
3. **Event names**: Use kebab-case for event names in templates
4. **v-model**: No changes needed, works the same way

## Next Steps

- See [Vue 2 Quick Start](/guide/vue2-quick-start) for setup examples
- Explore [Vue 3 Components](/guide/components) for more component examples (API is the same)
- Check [Usage & API](/guide/usage) for advanced patterns
