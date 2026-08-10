---
title: ECharts 集成
description: 介绍如何在 markstream-vue 中集成 ECharts 图表，包括通过自定义 CodeBlock 组件解析 JSON 配置并渲染图表的方法。
keywords:
  - ECharts
  - 自定义组件
  - 图表渲染
---

# ECharts 集成

`markstream-vue` 支持通过自定义组件渲染 ECharts 图表。本文介绍三种推荐方案，从最简单到最高级。

## 为什么在 markstream-vue 中使用 ECharts？

ECharts 是一个强大的图表库，与 `markstream-vue` 的流式架构天然契合。你可以：

- 直接在 Markdown 代码块中编写图表配置
- 流式更新图表（适合 AI 生成的内容）
- 复用现有的 ECharts 主题和配置
- 导出图表为图片

---

## 方案一：自定义 CodeBlock 组件（推荐）

此方案将 ECharts 作为一种特殊的代码块语言，类似于 Mermaid 的处理方式。这是对用户最友好的方式，也符合现有架构模式。

### 1.1 创建 ECharts 组件

创建 `EChartsBlockNode.vue`：

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

// 只渲染 echarts 代码块
const isECharts = computed(() => props.node.language === 'echarts' || props.node.language === 'chart')

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

async function initChart() {
  if (!isECharts.value || !chartRef.value)
    return

  // 销毁已存在的实例
  if (chartInstance) {
    chartInstance.dispose()
  }

  // 根据暗黑模式初始化主题
  const theme = props.isDark ? 'dark' : undefined
  chartInstance = echarts.init(chartRef.value, theme)

  try {
    // 从代码中解析 JSON 配置
    const option = JSON.parse(props.node.code)
    chartInstance.setOption(option, true)
  }
  catch (error) {
    console.error('[ECharts] 配置无效:', error)
    chartInstance?.dispose()
    chartInstance = null
  }
}

// 主题切换时重新初始化
watch(() => props.isDark, () => {
  initChart()
})

// 代码变化时更新图表
watch(() => props.node.code, () => {
  if (chartInstance) {
    try {
      const option = JSON.parse(props.node.code)
      chartInstance.setOption(option, true)
    }
    catch (error) {
      console.error('[ECharts] 配置无效:', error)
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

### 1.2 注册自定义组件

```ts
// main.ts 或组件入口文件
import { setCustomComponents } from 'markstream-vue'
import EChartsBlockNode from './components/EChartsBlockNode.vue'

setCustomComponents({
  code_block: EChartsBlockNode
})
```

### 1.3 在 Markdown 中使用

现在可以直接在 Markdown 中编写 ECharts 图表：

```markdown
\```echarts
{
  "title": { "text": "销售数据" },
  "tooltip": {},
  "xAxis": {
    "type": "category",
    "data": ["周一", "周二", "周三", "周四", "周五"]
  },
  "yAxis": { "type": "value" },
  "series": [{
    "type": "bar",
    "data": [120, 200, 150, 80, 70]
  }]
}
\```
```

### 1.4 安装 ECharts

```bash
pnpm add echarts
# 或
npm install echarts
```

### 优缺点

**优点：**
- 熟悉的代码块语法
- 遵循现有的 Mermaid 模式
- 支持流式更新
- 易于实现

**缺点：**
- 会覆盖所有 `code_block` 的渲染（需要处理非 echarts 代码块）
- 需要 JSON 解析（不支持 JS 表达式）

---

## 方案二：自定义 HTML 标签

使用自定义 HTML 类标签来渲染 ECharts 图表，与常规代码块分离更清晰。

### 2.1 配置自定义 HTML 标签

```ts
// 解析器配置（或在 MarkdownRender 上直接传 `custom-html-tags`）
import { getMarkdown } from 'markstream-vue'

const md = getMarkdown('echarts', {
  customHtmlTags: ['echarts', 'chart'],
})
```

### 2.2 注册组件

```ts
import { setCustomComponents } from 'markstream-vue'
import EChartsComponent from './components/EChartsComponent.vue'

setCustomComponents({
  echarts: EChartsComponent,
  chart: EChartsComponent
})
```

### 2.3 创建组件

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

// 从属性中解析宽度/高度
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
    console.error('[ECharts] 配置无效:', error)
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
      console.error('[ECharts] 配置无效:', error)
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

### 2.4 在 Markdown 中使用

```markdown
<echarts width="100%" height="500px">
{
  "series": [{
    "type": "pie",
    "data": [
      { "value": 335, "name": "直接访问" },
      { "value": 310, "name": "邮件营销" },
      { "value": 234, "name": "联盟广告" }
    ]
  }]
}
</echarts>
```

### 优缺点

**优点：**
- 类型分离清晰
- 支持自定义属性（宽度、高度）
- 不干扰代码块

**缺点：**
- 需要 parser 配置
- 语法不够熟悉
- 不是标准 Markdown

---

## 方案三：VmrContainer 集成

在自定义容器中使用 ECharts（类似 admonitions），适合带图表说明的文档。

### 3.1 注册容器组件

```ts
import { setCustomComponents } from 'markstream-vue'
import EChartsContainerNode from './components/EChartsContainerNode.vue'

setCustomComponents({
  vmr_container: EChartsContainerNode
})
```

### 3.2 创建容器组件

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

// 只处理 echarts 容器
const isEChartsContainer = computed(() => props.node.name === 'echarts')

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

// 从子节点提取 JSON
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

### 3.3 在 Markdown 中使用

```markdown
:::echarts
{
  "title": { "text": "流量来源" },
  "series": [{
    "type": "pie",
    "radius": "50%",
    "data": [
      { "value": 1048, "name": "搜索引擎" },
      { "value": 735, "name": "直接访问" },
      { "value": 580, "name": "邮件营销" }
    ]
  }]
}
:::
```

### 优缺点

**优点：**
- 与现有容器系统一致
- 支持图表周围添加额外内容
- 适合文档场景

**缺点：**
- 配置较复杂
- 需要解析子节点

---

## SSR 注意事项

ECharts 需要 DOM 环境，不支持服务端渲染。请使用以下策略之一：

### Nuxt 3 中使用

```vue
<template>
  <ClientOnly>
    <MarkdownRender :content="markdown" />
  </ClientOnly>
</template>
```

### SSR 带降级

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { onMounted, ref } from 'vue'

const isClient = ref(false)
const markdown = '# ECharts 示例'

onMounted(() => {
  isClient.value = true
})
</script>

<template>
  <MarkdownRender v-if="isClient" :content="markdown" />
  <div v-else class="echarts-placeholder">
    加载图表中...
  </div>
</template>
```

### 组件内检查 window

```ts
import { computed } from 'vue'

const canRender = computed(() => typeof window !== 'undefined' && isECharts.value)
```

---

## 高级功能

### 使用 ResizeObserver 实现响应式图表

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

### 导出为图片

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

### 使用 ECharts 主题切换

```ts
import dark from 'echarts/theme/dark'
import { computed } from 'vue'

const theme = computed(() => props.isDark ? 'dark' : undefined)
chartInstance = echarts.init(chartRef.value, theme.value)
```

---

## 应该选择哪种方案？

| 方案 | 适用场景 | 复杂度 |
|------|----------|--------|
| **CodeBlock** | 大多数用户，简单集成 | ⭐ |
| **自定义标签** | 高级用户，多种图表类型 | ⭐⭐ |
| **VmrContainer** | 文档场景，带样式容器 | ⭐⭐⭐ |

**推荐：** 从 **方案一（CodeBlock）** 开始。这是最直接的方式，也符合用户与 Mermaid 图表交互的方式。

---

## 完整示例

使用方案一的完整最小设置：

```ts
import MarkdownRender, { setCustomComponents } from 'markstream-vue'
// main.ts
import { createApp } from 'vue'
import EChartsBlockNode from './EChartsBlockNode.vue'
import 'markstream-vue/index.css'
import 'echarts'

// 注册自定义组件
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

## 故障排除

1. **图表未渲染** — 检查浏览器控制台的 JSON 解析错误。确保代码块内容是有效的 JSON。

2. **容器空白** — 验证 ECharts 已安装且 DOM 元素有尺寸。设置明确的宽高样式。

3. **主题未切换** — 切换主题时需要重新创建 ECharts 实例。使用 `watch(() => props.isDark)` 来销毁并重新初始化。

4. **SSR 错误** — 在 Nuxt 中使用 `<ClientOnly>` 包裹组件，或在初始化前检查 `typeof window !== 'undefined'`。

5. **内存泄漏** — 始终在 `onBeforeUnmount` 中调用 `chartInstance.dispose()`。

仍有问题？请查阅 [ECharts 官方文档](https://echarts.apache.org/zh/index.html)或在 GitHub 上提 issue。
