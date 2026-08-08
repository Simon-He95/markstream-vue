---
title: Mobile WebView Markdown rendering for AI apps
description: Use Markstream in iOS WKWebView and Android WebView surfaces with px CSS, mobile-friendly code blocks, virtualization, and worker-aware heavy block rendering.
keywords:
  - mobile WebView Markdown renderer
  - iOS WKWebView Markdown
  - Android WebView Markdown
  - AI chat WebView Markdown
  - px CSS Markdown renderer
  - mobile streaming Markdown
faq:
  - question: Why should mobile WebViews use index.px.css?
    answer: px CSS keeps Markstream internal sizing stable when the host app or operating system changes the root font size.
  - question: Should mobile chat surfaces use the enhanced code block surface?
    answer: Usually no. Use plain `pre` rendering on mobile WebViews unless the user explicitly needs the enhanced `stream-diffs` surface.
  - question: When should virtualization be enabled on mobile?
    answer: Enable it earlier than desktop, especially when AI responses exceed about 10 KB or include multiple code, diagram, or math blocks.
---

# Mobile WebView Markdown Rendering

Render streaming Markdown in mobile app WebViews with proper font scaling and performance.

## The challenge

Mobile apps often scale root font size for accessibility or design reasons. If your WebView sets `html { font-size: 14px }` or uses dynamic font scaling, Markstream's default `rem`-based CSS will scale unexpectedly — making rendered Markdown too large or too small.

## Markstream's solution: `px` CSS

Markstream provides `index.px.css` variants that use `px` units instead of `rem`:

```ts
// Instead of:
import 'markstream-vue/index.css'

// Use:
import 'markstream-vue/index.px.css'
```

This prevents the renderer's internal sizing from being affected by root font size changes.

Vue, React, and Svelte currently publish `index.px.css`:
- `markstream-vue/index.px.css`
- `markstream-react/index.px.css`
- `markstream-svelte/index.px.css`

Angular does not currently expose a `px` CSS build; use the default CSS and test font scaling manually.

## Framework setup for mobile

### Vue 3 / Nuxt
```ts
// main.ts
import 'markstream-vue/index.px.css'
```

### React / Next.js
```tsx
// App.tsx or layout
import 'markstream-react/index.px.css'
```

### Svelte 5
```svelte
<script lang="ts">
  import 'markstream-svelte/index.px.css'
</script>
```

## Performance on mobile

Mobile WebViews have less CPU and memory than desktop browsers. Key optimizations:

### 1. Use `mode="chat"` for streaming
```vue
<MarkdownRender mode="chat" :content="content" :final="isDone" />
```
Chat mode uses smaller render batches and disables animations that may be expensive on mobile.

### 2. Enable virtualization early
```vue
<MarkdownRender :content="content" node-virtual="auto" :max-live-nodes="200" />
```
On mobile, enable virtualization for documents > 10KB (vs 100KB on desktop).

### 3. Use plain `pre` code blocks on mobile
The enhanced `stream-diffs` surface can be heavy for mobile WebViews. For read-only chat, fall back to plain `<pre>` rendering:

```vue
<MarkdownRender
  :content="content"
  :render-code-blocks-as-pre="true"
/>
```

### 4. Limit concurrent heavy blocks
```vue
<MarkdownRender
  :content="content"
  :viewport-priority="true"
  :defer-nodes-until-visible="true"
/>
```

## iOS-specific notes

### WKWebView
- Worker support is limited in some WKWebView configurations
- Use CDN-backed workers if Web Workers aren't available
- `index.px.css` is especially important for iOS dynamic type scaling

### JavaScriptCore
- Regex lookbehind assertions (`(?<=...)`) are not supported on iOS 15 and below
- Markstream uses compatible regex patterns for iOS compatibility

## Android-specific notes

### Android WebView
- Web Worker support varies by Android version and WebView implementation
- Chrome Custom Tabs generally have better performance than embedded WebViews
- Mermaid rendering may be slower on older Android devices

### Font scaling
- Android system font scaling affects `rem` units — use `index.px.css`
- Test with accessibility font scaling enabled (up to 200%)

## Recommended mobile config

```vue
<MarkdownRender
  mode="chat"
  :content="content"
  :final="isDone"
  node-virtual="auto"
  :max-live-nodes="300"
  :live-node-buffer="60"
  :viewport-priority="true"
  :defer-nodes-until-visible="true"
  :render-code-blocks-as-pre="true"
  :fade="false"
  smooth-streaming="auto"
/>
```

With `index.px.css` for CSS:
```ts
import 'markstream-vue/index.px.css'
```

## Related guides

- [AI Chat Streaming](/use-cases/ai-chat-streaming)
- [Long AI Responses](/use-cases/long-ai-responses)
- [Installation guide](/guide/installation)
