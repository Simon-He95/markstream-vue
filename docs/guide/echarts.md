---
title: ECharts integration
description: Render ECharts charts in markstream-vue via custom components, streaming chart options progressively for AI-generated content.
keywords:
  - echarts integration
  - custom components vue
  - streaming charts
  - ai generated charts
---
# ECharts integration

`markstream-vue` supports rendering ECharts charts through custom components. This page covers three recommended approaches, from simplest to most advanced.

## Why ECharts with markstream-vue?

ECharts is a powerful charting library that works naturally with the streaming architecture of `markstream-vue`. You can:

- Write chart options directly in Markdown code blocks
- Stream chart updates progressively (ideal for AI-generated content)
- Reuse existing ECharts themes and configurations
- Export charts as images

## Approach 1: Custom CodeBlock component (Recommended)

This approach treats ECharts as a special code block language, similar to how Mermaid is handled. It's the most user-friendly and follows the existing architecture pattern.

### 1.1 Create the ECharts component

Create `EChartsBlockNode.vue`:

```vue
<script setup lang="ts">
import * as echarts from 'echarts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Props {
  node: {
    type: 'code_block'
    language: string
    code: string
    loading?: boolean
  }
  isDark?: boolean
}

const props = defineProps<Props>()

// Only render echarts code blocks
const isECharts = computed(() => props.node.language === 'echarts' || props.node.language === 'chart')

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

async function initChart() {
  if (!isECharts.value || !chartRef.value)
    return

  // Dispose existing instance
  if (chartInstance) {
    chartInstance.dispose()
  }

  // Initialize with theme based on dark mode
  const theme = props.isDark ? 'dark' : undefined
  chartInstance = echarts.init(chartRef.value, theme)

  try {
    // Parse JSON option from code
    const option = JSON.parse(props.node.code)
    chartInstance.setOption(option, true)
  }
  catch (error) {
    console.error('[ECharts] Invalid option:', error)
    chartInstance?.dispose()
    chartInstance = null
  }
}

// Reinitialize on theme change
watch(() => props.isDark, () => {
  initChart()
})

// Reinitialize on code change
watch(() => props.node.code, () => {
  if (chartInstance) {
    try {
      const option = JSON.parse(props.node.code)
      chartInstance.setOption(option, true)
    }
    catch (error) {
      console.error('[ECharts] Invalid option:', error)
    }
  }
})

onMounted(initChart)

onBeforeUnmount(() => {
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<template>
  <div v-if="isECharts" ref="chartRef" class="echarts-container" style="width: 100%; height: 400px" />
  <slot v-else />
</template>

<style scoped>
.echarts-container {
  margin: 1rem 0;
  border-radius: 0.5rem;
  overflow: hidden;
}
</style>
```

### 1.2 Register the custom component

```ts
// main.ts or your component entry
import { setCustomComponents } from 'markstream-vue'
import EChartsBlockNode from './components/EChartsBlockNode.vue'

setCustomComponents({
  code_block: EChartsBlockNode
})
```

### 1.3 Use in Markdown

Now you can write ECharts charts directly in Markdown:

```markdown
\```echarts
{
  "title": { "text": "Sales Data" },
  "tooltip": {},
  "xAxis": {
    "type": "category",
    "data": ["Mon", "Tue", "Wed", "Thu", "Fri"]
  },
  "yAxis": { "type": "value" },
  "series": [{
    "type": "bar",
    "data": [120, 200, 150, 80, 70]
  }]
}
\```
```

### 1.4 Install ECharts

```bash
pnpm add echarts
# or
npm install echarts
```

### Pros & Cons

**Pros:**
- Familiar code block syntax
- Follows existing Mermaid pattern
- Works with streaming updates
- Easy to implement

**Cons:**
- Overrides all `code_block` rendering (need to handle non-echarts blocks)
- Requires JSON parsing (no JS expressions)

---

## Approach 2: Custom HTML tag

Use a custom HTML-like tag for ECharts charts, providing clearer separation from regular code blocks.

### 2.1 Configure custom HTML tags

```ts
// parser configuration (or pass `custom-html-tags` to MarkdownRender)
import { getMarkdown } from 'markstream-vue'

const md = getMarkdown('echarts', {
  customHtmlTags: ['echarts', 'chart'],
})
```

### 2.2 Register the component

```ts
import { setCustomComponents } from 'markstream-vue'
import EChartsComponent from './components/EChartsComponent.vue'

setCustomComponents({
  echarts: EChartsComponent,
  chart: EChartsComponent
})
```

### 2.3 Create the component

```vue
<script setup lang="ts">
import * as echarts from 'echarts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Props {
  node: {
    type: string
    tag: string
    content: string
    attrs?: Record<string, string>
  }
  isDark?: boolean
}

const props = defineProps<Props>()

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

// Parse attributes for width/height
const width = computed(() => props.node.attrs?.width || '100%')
const height = computed(() => props.node.attrs?.height || '400px')

async function initChart() {
  if (!chartRef.value)
    return

  if (chartInstance) {
    chartInstance.dispose()
  }

  const theme = props.isDark ? 'dark' : undefined
  chartInstance = echarts.init(chartRef.value, theme)

  try {
    const option = JSON.parse(props.node.content)
    chartInstance.setOption(option, true)
  }
  catch (error) {
    console.error('[ECharts] Invalid option:', error)
  }
}

watch(() => props.isDark, initChart)
watch(() => props.node.content, () => {
  if (chartInstance) {
    try {
      const option = JSON.parse(props.node.content)
      chartInstance.setOption(option, true)
    }
    catch (error) {
      console.error('[ECharts] Invalid option:', error)
    }
  }
})

onMounted(initChart)
onBeforeUnmount(() => {
  chartInstance?.dispose()
})
</script>

<template>
  <div ref="chartRef" class="echarts-chart" :style="{ width, height }" />
</template>
```

### 2.4 Use in Markdown

```markdown
<echarts width="100%" height="500px">
{
  "series": [{
    "type": "pie",
    "data": [
      { "value": 335, "name": "Direct" },
      { "value": 310, "name": "Email" },
      { "value": 234, "name": "Affiliate" }
    ]
  }]
}
</echarts>
```

### Pros & Cons

**Pros:**
- Clear type separation
- Supports custom attributes (width, height)
- Doesn't interfere with code blocks

**Cons:**
- Requires parser configuration
- Less familiar syntax
- Not standard Markdown

---

## Approach 3: VmrContainer integration

Use ECharts inside a custom container (similar to admonitions), ideal for documentation with chart descriptions.

### 3.1 Register container component

```ts
import { setCustomComponents } from 'markstream-vue'
import EChartsContainerNode from './components/EChartsContainerNode.vue'

setCustomComponents({
  vmr_container: EChartsContainerNode
})
```

### 3.2 Create the container component

```vue
<script setup lang="ts">
import * as echarts from 'echarts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Props {
  node: {
    type: 'vmr_container'
    name: string
    children?: Array<{ type: string, raw: string }>
  }
  isDark?: boolean
}

const props = defineProps<Props>()

// Only handle echarts containers
const isEChartsContainer = computed(() => props.node.name === 'echarts')

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

// Extract JSON from children
const chartOption = computed(() => {
  if (!props.node.children || props.node.children.length === 0) {
    return null
  }
  const code = props.node.children[0].raw
  try {
    return JSON.parse(code)
  }
  catch {
    return null
  }
})

async function initChart() {
  if (!isEChartsContainer.value || !chartRef.value || !chartOption.value)
    return

  if (chartInstance) {
    chartInstance.dispose()
  }

  const theme = props.isDark ? 'dark' : undefined
  chartInstance = echarts.init(chartRef.value, theme)
  chartInstance.setOption(chartOption.value, true)
}

watch(() => props.isDark, initChart)
watch(chartOption, (option) => {
  if (chartInstance && option) {
    chartInstance.setOption(option, true)
  }
})

onMounted(initChart)
onBeforeUnmount(() => {
  chartInstance?.dispose()
})
</script>

<template>
  <div v-if="isEChartsContainer" class="vmr-container vmr-container-echarts">
    <div ref="chartRef" style="width: 100%; height: 400px" />
    <slot v-if="!chartOption" />
  </div>
  <div v-else class="vmr-container" :class="`vmr-container-${node.name}`">
    <slot />
  </div>
</template>

<style scoped>
.vmr-container-echarts {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  margin: 1rem 0;
}

.dark .vmr-container-echarts {
  border-color: #374151;
}
</style>
```

### 3.3 Use in Markdown

```markdown
:::echarts
{
  "title": { "text": "Traffic Sources" },
  "series": [{
    "type": "pie",
    "radius": "50%",
    "data": [
      { "value": 1048, "name": "Search" },
      { "value": 735, "name": "Direct" },
      { "value": 580, "name": "Marketing" }
    ]
  }]
}
:::
```

### Pros & Cons

**Pros:**
- Consistent with existing container system
- Supports additional content around charts
- Good for documentation

**Cons:**
- More complex setup
- Requires parsing children

---

## SSR Considerations

ECharts requires the DOM and doesn't support server-side rendering. Use one of these strategies:

### For Nuxt 3

```vue
<template>
  <ClientOnly>
    <MarkdownRender :content="markdown" />
  </ClientOnly>
</template>
```

### For SSR with fallback

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { onMounted, ref } from 'vue'

const isClient = ref(false)
const markdown = '# ECharts demo'

onMounted(() => {
  isClient.value = true
})
</script>

<template>
  <MarkdownRender v-if="isClient" :content="markdown" />
  <div v-else class="echarts-placeholder">
    Loading chart...
  </div>
</template>
```

### Check for window in component

```ts
import { computed } from 'vue'

const canRender = computed(() => typeof window !== 'undefined' && isECharts.value)
```

---

## Advanced Features

### ResizeObserver for responsive charts

```ts
import { useResizeObserver } from '@vueuse/core'

useResizeObserver(chartRef, (entries) => {
  if (chartInstance && entries[0]) {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0) {
      chartInstance.resize()
    }
  }
})
```

### Export as image

```ts
function exportChart() {
  if (!chartInstance)
    return
  const url = chartInstance.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: props.isDark ? '#1a1a1a' : '#fff'
  })
  const link = document.createElement('a')
  link.href = url
  link.download = 'chart.png'
  link.click()
}
```

### Theme switching with ECharts themes

```ts
import dark from 'echarts/theme/dark'
import { computed } from 'vue'

const theme = computed(() => props.isDark ? 'dark' : undefined)
chartInstance = echarts.init(chartRef.value, theme.value)
```

---

## Which approach should I choose?

| Approach | Best for | Complexity |
|----------|----------|------------|
| **CodeBlock** | Most users, simple integration | ⭐ |
| **Custom HTML tag** | Advanced users, multiple chart types | ⭐⭐ |
| **VmrContainer** | Documentation, styled containers | ⭐⭐⭐ |

**Recommendation:** Start with **Approach 1 (CodeBlock)**. It's the most straightforward and aligns with how users already interact with Mermaid diagrams.

---

## Complete example

Here's a complete minimal setup using Approach 1:

```ts
import MarkdownRender, { setCustomComponents } from 'markstream-vue'
// main.ts
import { createApp } from 'vue'
import EChartsBlockNode from './EChartsBlockNode.vue'
import 'markstream-vue/index.css'
import 'echarts'

// Register custom component
setCustomComponents({
  code_block: EChartsBlockNode
})

const app = createApp({
  components: { MarkdownRender },
  template: `
    <MarkdownRender :content="markdown" />
  `,
  data() {
    return {
      markdown: `<!-- eslint-disable -->
\`\`\`echarts
{
  "xAxis": { "type": "category", "data": ["A", "B", "C"] },
  "yAxis": { "type": "value" },
  "series": [{ "type": "bar", "data": [10, 20, 30] }]
}
\`\`\``
    }
  }
})

app.mount('#app')
```

---

## Troubleshooting

1. **Chart not rendering** — Check browser console for JSON parse errors. Ensure the code block content is valid JSON.

2. **Blank container** — Verify ECharts is installed and the DOM element has dimensions. Set explicit width/height styles.

3. **Theme not switching** — ECharts instances need to be re-created when changing themes. Use `watch(() => props.isDark)` to dispose and reinitialize.

4. **SSR errors** — Wrap the component in `<ClientOnly>` (Nuxt) or check `typeof window !== 'undefined'` before initializing.

5. **Memory leaks** — Always call `chartInstance.dispose()` in `onBeforeUnmount`.

Still having issues? Check the [ECharts documentation](https://echarts.apache.org/en/index.html) or open an issue on GitHub.
