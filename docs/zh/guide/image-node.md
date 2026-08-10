---
title: ImageNode 自定义图片预览
description: 介绍 markstream-vue 的 ImageNode 组件，说明如何自定义图片预览、懒加载、放大查看与图片相关处理行为。
keywords:
  - ImageNode
  - 自定义图片预览
  - 图片组件
---

# ImageNode — 自定义图片预览

`ImageNode` 在内部渲染图片并在用户交互时发出事件。我们为图片点击暴露了一个事件，因此你可以接手点击行为（例如打开自定义图片预览/Lightbox），而无需替换整个渲染器。

- 事件：`click` — 当用户在成功加载的图片上触发点击时发出。负载形如 `[Event, string]`，其中第二项为最终用于渲染的图片 URL（可能是 fallback）。
- 事件：`load` / `error` — 图片加载成功或失败事件，负载为图片 `src`。

示例：创建一个包装组件来拦截 `click` 事件，并在 VitePress 中注册它作为自定义组件。

1) `CustomImageNode.vue`（包装原始 `ImageNode`，拦截点击并在新标签打开图片作为简易预览）：

```vue twoslash
<script setup lang="ts">
import { ImageNode } from 'markstream-vue'

const emit = defineEmits(['load', 'error', 'click'])

function onImageClick(payload: [Event, string]) {
  const [, src] = payload
  // 简单示例：在新标签页打开图片用于预览
  // 在真实项目中可替换为 modal/lightbox 组件
  window.open(src, '_blank')
  // 仍然向外暴露 click 事件，供上层处理
  emit('click', payload)
}
</script>

<template>
  <ImageNode v-bind="$attrs" @load="emit('load', $event)" @error="emit('error', $event)" @click="onImageClick" />
</template>
```

2) 在 VitePress 主题增强（`docs/.vitepress/theme/index.ts` 的 `enhanceApp`）中注册自定义组件：

```ts twoslash
import type { App, Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'
// docs/.vitepress/theme/index.ts
declare const CustomImageNode: Component

export default ({ app }: { app: App }) => {
  // setCustomComponents 接受一个 id（任意字符串，用于区分不同注册）和组件映射
  // 通过这种方式，库在渲染 ImageNode 时会使用你提供的组件
  setCustomComponents('vitepress-image-preview', { image: CustomImageNode })
}
```

可选建议：
- 若希望更丰富的预览体验（缩放、手势、幻灯片），可在 `onImageClick` 中调用诸如 `photoswipe`、`fslightbox` 等库，或使用应用级 modal 管理预览状态。

## 桌面应用中的本地文件图片

Markdown 图片的 `src` 仍然是浏览器 URL。像 `/Users/eric/.app/data/image.png` 这样的文件系统路径会被浏览器当成站点绝对路径，而不是直接读取本机文件。如果页面运行在 `http://localhost:5173`，浏览器实际请求的是 `http://localhost:5173/Users/eric/.app/data/image.png`。默认图片 URL 策略也会阻断 `file://` 图片。

Electron、Tauri 等桌面应用应该先把受信任文件暴露为应用自己控制的 URL，再通过自定义图片组件改写 Markdown 图片源。常见做法包括：

- Electron 自定义协议，例如 `app-file://...`
- 本地 HTTP 地址，例如 `http://127.0.0.1:<port>/blobs/...`
- 应用读取并授权后的 object URL 或 data URL

路径映射应限制在应用自己的数据目录内，不要把 Markdown 中的任意文件系统路径直接转成 `file://`。

```vue twoslash
<script setup lang="ts">
import type { ImageNodeProps } from 'markstream-vue'
import { computed } from 'vue'

const props = defineProps<ImageNodeProps>()

const src = computed(() => {
  const value = props.node.src

  if (value.startsWith('/Users/') && value.includes('/.my-app/data/sessions/'))
    return `app-file://${encodeURI(value)}`

  return value
})
</script>

<template>
  <img :src="src" :alt="props.node.alt" :title="props.node.title ?? props.node.alt">
</template>
```

再用 `setCustomComponents` 注册这个组件：

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const DesktopImageNode: Component

setCustomComponents('desktop-app', {
  image: DesktopImageNode,
})
```

说明小结：
- `ImageNode` 提供的 `click` 事件是接管自定义预览的入口；常见做法是用一个包装组件替换默认实现并通过 `setCustomComponents` 注册到 VitePress/客户端应用中。
- 包装组件也可以复用 `load` / `error` 事件，或在内部实现更多逻辑（统计、懒加载补偿、占位符策略等）。
