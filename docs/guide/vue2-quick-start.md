# Vue 2 Quick Start

Get started with markstream-vue2 in your Vue 2 project.

## Basic Setup

### 1. Installation

First, install the package:

```bash
pnpm add markstream-vue2
```

### 2. Import Styles

In your main entry file (e.g., `main.js` or `main.ts`):

```js
import Vue from 'vue'
import App from './App.vue'
import 'markstream-vue2/index.css'

// For Vue 2.6.x, also install and configure @vue/composition-api
// import VueCompositionAPI from '@vue/composition-api'
// Vue.use(VueCompositionAPI)

new Vue({
  render: h => h(App)
}).$mount('#app')
```

### 3. Use the Component

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  name: 'App',
  components: {
    MarkdownRender
  },
  data() {
    return {
      markdown: `# Hello Vue 2!

This is **markstream-vue2** - a streaming-friendly Markdown renderer for Vue 2.

## Features

- Code syntax highlighting
- Mermaid diagrams
- Math formulas
- And much more!

\`\`\`javascript
console.log('Hello from Vue 2!')
\`\`\`
`
    }
  }
}
</script>

<template>
  <div id="app">
    <MarkdownRender :content="markdown" />
  </div>
</template>
```

## Using with Vue 2.7+ (Composition API)

Vue 2.7 includes built-in Composition API support:

```vue
<script>
import MarkdownRender from 'markstream-vue2'
import { defineComponent, ref } from 'vue'

export default defineComponent({
  name: 'App',
  components: {
    MarkdownRender
  },
  setup() {
    const markdown = ref(`# Hello Vue 2.7!

This uses the Composition API.

\`\`\`javascript
const message = 'Hello from Vue 2.7!'
console.log(message)
\`\`\`
`)
    return { markdown }
  }
})
</script>

<template>
  <div id="app">
    <MarkdownRender :content="markdown" />
  </div>
</template>
```

## Using with Vue 2.6.x (@vue/composition-api)

For Vue 2.6.x, install `@vue/composition-api`:

```bash
pnpm add @vue/composition-api
```

```js
import VueCompositionAPI from '@vue/composition-api'
// main.js
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueCompositionAPI)
```

Then use it the same way as Vue 2.7:

```vue
<script>
import { defineComponent, ref } from '@vue/composition-api'
import MarkdownRender from 'markstream-vue2'

export default defineComponent({
  name: 'App',
  components: {
    MarkdownRender
  },
  setup() {
    const markdown = ref(`# Hello Vue 2.6!

This uses @vue/composition-api.
`)
    return { markdown }
  }
})
</script>

<template>
  <div id="app">
    <MarkdownRender :content="markdown" />
  </div>
</template>
```

## Enabling Optional Features

### Code Syntax Highlighting

Install dependencies:

```bash
pnpm add stream-markdown
```

```vue
<script>
import MarkdownRender, { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue2'

// Use Shiki-based code blocks inside MarkdownRender
setCustomComponents({ code_block: MarkdownCodeBlockNode })

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `\`\`\`javascript
const hello = 'world'
console.log(hello)
\`\`\``
    }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

### Mermaid Diagrams

Install mermaid:

```bash
pnpm add mermaid
```

Import styles. The loader is enabled by default; call `enableMermaid()` only if you disabled it or need a custom loader:

```js
import { enableMermaid } from 'markstream-vue2'
// main.js
import 'markstream-vue2/index.css'

// optional: re-enable or override loader
enableMermaid()
```

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `#### Mermaid Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Keep trying]
\`\`\``
    }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

### D2 Diagrams

Install D2:

```bash
pnpm add @terrastruct/d2
```

Import styles. The loader is enabled by default; call `enableD2()` only if you disabled it or need a custom loader:

```js
import { enableD2 } from 'markstream-vue2'
// main.js
import 'markstream-vue2/index.css'

// optional: re-enable or override loader
enableD2()
```

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `#### D2 Diagram

\`\`\`d2
direction: right
Client -> API: request
API -> DB: query
DB -> API: rows
API -> Client: response
\`\`\``
    }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

### Math Formulas (KaTeX)

Install katex:

```bash
pnpm add katex
```

Import styles. The loader is enabled by default; call `enableKatex()` only if you disabled it or need a custom loader:

```js
import { enableKatex } from 'markstream-vue2'
// main.js
import 'markstream-vue2/index.css'

import 'katex/dist/katex.min.css'

// optional: re-enable or override loader
enableKatex()
```

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `#### Math Example

Inline math: $E = mc^2$

Block math:

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$`
    }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

## Custom Components

You can customize how specific nodes are rendered using `setCustomComponents`:

```vue
<script>
import MarkdownRender, { setCustomComponents } from 'markstream-vue2'

// Create a custom heading component
const CustomHeading = {
  name: 'CustomHeading',
  props: ['node'],
  render(h) {
    const level = this.node.level || 1
    const Tag = `h${level}`
    return h(Tag, { class: 'custom-heading' }, this.node.children.map(c => c.content))
  }
}

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: `# Custom Heading

This heading is rendered with a custom component.
`
    }
  },
  mounted() {
    // Register custom component
    setCustomComponents('my-app', {
      heading: CustomHeading
    })
  }
}
</script>

<template>
  <div>
    <MarkdownRender
      custom-id="my-app"
      :content="markdown"
    />
  </div>
</template>

<style scoped>
.custom-heading {
  color: #e11d48;
  border-bottom: 2px solid #e11d48;
  padding-bottom: 0.5rem;
}
</style>
```

## Streaming Content

markstream-vue2 supports streaming markdown content with built-in smooth pacing for AI-generated content:

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: '',
      isFinal: false,
      fullText: `# Streaming Demo

This content is being streamed **in small chunks**.

## Features

1. Progressive rendering
2. No layout shift
3. Smooth animations

\`\`\`javascript
const streaming = true
console.log('Streaming enabled:', streaming)
\`\`\`
`
    }
  },
  methods: {
    startStreaming() {
      this.markdown = ''
      this.isFinal = false
      let i = 0
      const interval = setInterval(() => {
        if (i < this.fullText.length) {
          this.markdown += this.fullText[i]
          i++
        }
        else {
          this.isFinal = true
          clearInterval(interval)
        }
      }, 20)
    }
  }
}
</script>

<template>
  <div>
    <button @click="startStreaming">
      Start Streaming
    </button>
    <MarkdownRender
      custom-id="chat"
      :content="markdown"
      :final="isFinal"
      :max-live-nodes="0"
      :batch-rendering="true"
      :typewriter="true"
    />
  </div>
</template>
```

The default `smooth-streaming="auto"` enables pacing when `typewriter` is on or `max-live-nodes <= 0`. Use `:smooth-streaming="true"` only if you want first-screen content to also start from blank — this bypasses the mounted gate and can cause hydration mismatch or blank flash in SSR scenarios.

Fine-tune pacing with `smooth-streaming-options`:

```vue
<MarkdownRender
  :content="markdown"
  :final="isFinal"
  :smooth-streaming-options="{
    minCharsPerSecond: 45,
    maxCharsPerSecond: 1200,
    targetLatencyMs: 900,
    catchUpLatencyMs: 350,
  }"
/>
```

## VitePress Integration (Vue 2)

For VitePress with Vue 2, you can use markstream-vue2 in your custom theme:

```js
import MarkdownRender, { setCustomComponents } from 'markstream-vue2'
// docs/.vitepress/theme/index.js
import DefaultTheme from 'vitepress/theme'
import 'markstream-vue2/index.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Register the component globally
    app.component('MarkdownRender', MarkdownRender)

    // Set custom components if needed
    setCustomComponents('vitepress', {
      // Your custom components here
    })
  }
}
```

## Next Steps

- Explore [Components documentation](/guide/vue2-components) for all available components
- Check out [API Reference](/guide/api) for detailed API documentation
- See [Examples](/guide/examples) for more usage examples
