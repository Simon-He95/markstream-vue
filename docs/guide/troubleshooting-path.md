---
description: Diagnose markstream-vue problems by symptom across CSS order, missing peers, SSR boundaries, trusted tags, and streaming performance.
---

# Troubleshooting by Symptom

Use this page when something is wrong but you are not yet sure whether the cause is CSS order, missing peers, SSR boundaries, custom-tag wiring, or renderer choice.

If you already know the exact subsystem, jump straight to the deeper page linked from each section below.

## Start with the symptom you see

| What you see | Start here | Then go to |
| --- | --- | --- |
| Styles look broken, spacing is off, or Tailwind wins | [CSS looks wrong? Start here](/guide/troubleshooting#css-looks-wrong-start-here) | [Tailwind Integration & Style Ordering](/guide/tailwind) |
| A trusted tag like `<thinking>` renders as raw HTML | [Docs Site & VitePress](/guide/vitepress-docs-integration) or [Custom Tags & Advanced Components](/guide/custom-components) | [API Reference](/guide/api) |
| `window is not defined` or browser-only peers crash during SSR | [Troubleshooting](/guide/troubleshooting) | [Nuxt SSR](/nuxt-ssr) |
| Mermaid, KaTeX, Monaco, or D2 does not render | [Installation](/guide/installation) | [Renderer & Node Components](/guide/components) |
| Chat output feels slow or reparses too much | [AI Chat & Streaming](/guide/ai-chat-streaming) | [Performance](/guide/performance) |
| A built-in node is the wrong shape for your app | [Override Built-in Components](/guide/component-overrides) | [Renderer & Node Components](/guide/components) |

## 1. Styles look wrong

Symptoms:

- paragraphs, tables, or lists have odd spacing
- code blocks or images look unstyled
- utility classes from Tailwind or UnoCSS override the renderer

Check in this order:

1. import your reset before `markstream-vue/index.css`
2. if you use Tailwind or UnoCSS, use `@import '...' layer(components)`
3. if math is enabled, import `katex/dist/katex.min.css`
4. if the renderer lives in a larger app surface, scope overrides with `custom-id`

Start with the CSS checklist: [Troubleshooting](/guide/troubleshooting#css-looks-wrong-start-here)

## 2. Custom tags or custom components do not appear

Symptoms:

- `<thinking>` shows up as raw HTML
- your custom Vue component never renders
- the component works in one place but not another

Check in this order:

1. make sure the tag is listed in `custom-html-tags`
2. register the mapping with `setCustomComponents(customId, mapping)`
3. render the page with the matching `custom-id`
4. if you are in VitePress, put the registration in `enhanceApp`

Best paths:

- docs-site or theme case: [Docs Site & VitePress](/guide/vitepress-docs-integration)
- app-level custom tags: [Custom Tags & Advanced Components](/guide/custom-components)

## 3. SSR errors or browser-only crashes

Symptoms:

- `window is not defined`
- Mermaid or Monaco works locally but fails in SSR
- hydration differs between server and client

Check in this order:

1. confirm whether the failing peer is browser-only
2. move that initialization behind client-only boundaries
3. keep server-safe rendering on the base `MarkdownRender` path

Best paths:

- general checklist: [Troubleshooting](/guide/troubleshooting)
- Nuxt-specific rules: [Nuxt SSR](/nuxt-ssr)

## 4. Heavy features do not render

Symptoms:

- Mermaid fences stay as source text
- formulas stay blank
- Monaco blocks are empty
- D2 falls back to source

Most of the time, this is not a parser bug. It is one of:

- the peer package is not installed
- required CSS is missing, especially for KaTeX
- SSR or worker boundaries are wrong

Start with [Installation](/guide/installation), then confirm the component-specific notes in [Renderer & Node Components](/guide/components).

## 5. Streaming or chat output feels slow

Symptoms:

- every token update causes visible reflow
- long chat transcripts get heavy quickly
- the app reparses too much Markdown on each update

The usual fix is architectural rather than cosmetic:

- parse outside `MarkdownRender`
- pass `nodes` + `final`
- keep heavy peers off until they are needed

Best path: [AI Chat & Streaming](/guide/ai-chat-streaming), then [Performance](/guide/performance)

## 6. Still not sure?

If you still cannot classify the issue:

1. reproduce it in the playground with the smallest Markdown sample possible
2. remove optional peers until the failure becomes simpler
3. compare against the nearest scenario guide:
   `Docs Site & VitePress`, `AI Chat & Streaming`, or `Usage & Streaming`

If it still looks like a real bug, collect:

- the minimal Markdown sample
- framework/runtime details
- whether Tailwind, UnoCSS, or SSR is involved
- which optional peers are installed

Then use the hosted test page or issue link from [Troubleshooting](/guide/troubleshooting).
