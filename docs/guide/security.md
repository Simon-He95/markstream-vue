# Security

`MarkdownRender` defaults to `htmlPolicy="safe"`. This is the right default for AI output and other content that should allow a small, sanitized HTML subset.

## Security model

`safe` means active HTML is removed before Vue renders it:

- `script`, `style`, `form`, `iframe`, `object`, `embed`, `template`, and related active/embed/form tags are blocked.
- `on*` event attributes are removed.
- Unsafe URL protocols such as `javascript:`, `vbscript:`, unsafe `data:`, and protocol-relative URLs are blocked.
- Inline styles with script URLs, CSS expressions, or imports are removed.
- Markdown links with `target="_blank"` keep `noopener noreferrer`.
- Streaming mid-states are sanitized the same way as final content.

`trusted` means the content source is fully controlled by your application. Do not use it for LLM output, public comments, support tickets, imported docs from users, or any other user-generated content.

## HTML policies

### `htmlPolicy="safe"`

Allows common structural HTML such as links, images, lists, tables, and details blocks. Dangerous tags, event attributes, unsafe URL protocols, and inline styles are removed or escaped before rendering.

`safe` is a constrained rendering policy, not a permission to render arbitrary active HTML. It still allows ordinary `http:` / `https:` links and images. If your threat model forbids third-party network requests, use `htmlPolicy="escape"`, a custom ImageNode, or enforce a CSP / image proxy.

Use this for AI chat, docs generated from trusted pipelines, and general Markdown surfaces where limited HTML is useful.

### `htmlPolicy="escape"`

Renders all HTML as text.

Use this for untrusted user-generated content, public comments, third-party feeds, or any place where raw HTML is not required.

```vue
<MarkdownRender
  :content="content"
  html-policy="escape"
/>
```

### `htmlPolicy="trusted"`

Keeps a broader HTML set while still dropping hard-blocked tags such as scripts. Use it only for content you fully control.
It may keep inline styles and broader HTML. Do not use it for model output or user-generated content.

## Custom components

`customHtmlTags` marks tags as structured streaming nodes. It does not make model output trusted.

Custom components are trusted code. Markstream sanitizes the HTML attrs it passes into custom components, but it cannot control what your component does internally. Avoid `v-html` on raw model content, executing URLs from model output, or assigning model output directly to `iframe srcdoc`.

Prefer text interpolation inside custom components:

```vue
<script setup lang="ts">
defineProps<{ node: { content?: string } }>()
</script>

<template>
  <div class="thinking-node">
    {{ node.content }}
  </div>
</template>
```

## Links and images

Markdown links and rendered HTML attrs are checked for unsafe protocols such as `javascript:`, `vbscript:`, and HTML `data:` documents.

Markdown image URLs use a strict default policy. Allowed image sources are `http:`, `https:`, relative URLs, `#hash` / `?query` URLs, and bitmap `data:image/png|gif|jpg|jpeg|webp|avif|bmp` URLs. Blocked image sources include protocol-relative URLs, `javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`, `blob:`, `file:`, and `filesystem:`.

Bitmap data URLs are only allowed for Markdown image / `img src` handling. `srcset` keeps the narrower resource URL policy and rejects data URLs.

If your application needs trusted `blob:` image URLs, render images through a custom ImageNode/custom component and apply your own URL policy.

Protocol-relative URLs such as `//cdn.example.com/a.png` are blocked because they can silently load external resources.

Mermaid SVG output is sanitized before mounting in both strict and loose Mermaid modes. `isStrict=false` controls Mermaid's parse/render configuration; it does not mean raw SVG insertion. Unsupported active SVG/HTML structures such as `foreignObject` are still stripped by the built-in sanitizer. If you need full trusted Mermaid HTML-label output, render it through a trusted custom component outside the built-in sanitizer.

Mermaid-generated `bindFunctions` click handlers are disabled by default after sanitized SVG mount. Set `mermaidProps.enableMermaidInteractions=true` only for trusted diagrams that need Mermaid click bindings.

`sanitizeMermaidSvg`, `toSafeMermaidSvgMarkup`, and `toSafeSvgElement` require a `DOMParser`-compatible runtime. In plain Node.js without `DOMParser`, they return `null`, `''`, and `null` respectively; use them in browser, jsdom, or linkedom contexts for server-side SVG sanitizing.
