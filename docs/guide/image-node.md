---
title: ImageNode custom preview
description: Handle image preview and lightbox behavior in markstream-vue using the ImageNode click event without replacing the whole renderer.
keywords:
  - imagenode component
  - image preview
  - lightbox markdown
  - image click event
---
# ImageNode — Custom preview handling

`ImageNode` renders images and emits events for user interactions. We expose a `click` event on images so you can take over the click behavior (for example to open a custom image preview / lightbox) without replacing the whole renderer.

- Events: `click` — emitted when a user clicks a successfully loaded image. Payload is `[Event, string]` where the second item is the src actually used for rendering (this may be a fallback URL).
- Events: `load` / `error` — emitted when an image finishes loading or fails, payload is the image `src`.

## Example: wrapper + VitePress registration

Create a small wrapper component that intercepts `click` and use `setCustomComponents` to register it in the client app.

### 1) `CustomImageNode.vue` (simple wrapper)

```vue twoslash
<script setup lang="ts">
import { ImageNode } from 'markstream-vue'

const emit = defineEmits(['load', 'error', 'click'])

function onImageClick(payload: [Event, string]) {
  const [, src] = payload
  // Simple example: open the image in a new tab for preview.
  // Replace this with a modal/lightbox call in real apps.
  window.open(src, '_blank')
  // Re-emit the click so parent code can also react if needed.
  emit('click', payload)
}
</script>

<template>
  <ImageNode v-bind="$attrs" @load="emit('load', $event)" @error="emit('error', $event)" @click="onImageClick" />
</template>
```

### 2) Register in VitePress theme enhance

```ts twoslash
import type { App, Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'
// docs/.vitepress/theme/index.ts
declare const CustomImageNode: Component

export default ({ app }: { app: App }) => {
  setCustomComponents('vitepress-image-preview', { image: CustomImageNode })
}
```

## Optional: richer preview interactions

For zoom/gesture/slide support, call a lightbox library such as `photoswipe`, `fslightbox` or `basiclightbox` inside `onImageClick`, or control an application-level modal to show the preview.

## Local file images in desktop apps

Markdown image sources are still browser URLs. A filesystem path such as `/Users/eric/.app/data/image.png` is treated as a site-absolute URL, not as a direct file read. If the page runs at `http://localhost:5173`, the browser requests `http://localhost:5173/Users/eric/.app/data/image.png`. `file://` image URLs are blocked by the default image URL policy.

For Electron, Tauri, and other desktop shells, expose trusted files through an application-controlled URL first, then rewrite Markdown image sources with a custom image component. Common options are:

- an Electron custom protocol such as `app-file://...`
- a local HTTP endpoint such as `http://127.0.0.1:<port>/blobs/...`
- a generated object URL or data URL for files the application has already read and authorized

Keep the mapping scoped to directories your application owns. Do not pass arbitrary filesystem paths from Markdown directly to `file://`.

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

Register that component with `setCustomComponents`:

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const DesktopImageNode: Component

setCustomComponents('desktop-app', {
  image: DesktopImageNode,
})
```

## Summary

The `click` event from `ImageNode` is the primary hook for implementing custom previews. The usual approach is wrapping the original component and registering it with `setCustomComponents` in the client app. The wrapper can also forward `load`/`error` events or add additional behavior (analytics, alternative lazy-load handling, custom placeholders, etc.).

Quick try — register `CustomImageNode` in a VitePress client enhance and test clicking images in the `playground`:

```ts twoslash
// docs/.vitepress/theme/index.ts
import type { App, Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const CustomImageNode: Component

export default ({ app }: { app: App }) => setCustomComponents('vitepress-image-preview', { image: CustomImageNode })
```
