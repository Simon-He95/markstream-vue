# Install Scenarios

## Package selection

| Host app | Package |
|----------|---------|
| Vue 3 / Nuxt 3 | `markstream-vue` |
| Vue 2.6 / 2.7 | `markstream-vue2` |
| React 18+ | `markstream-react` |
| Angular 20+ | `markstream-angular` |
| Svelte 5 | `markstream-svelte` |

## Peer selection

| Feature | Peers |
|---------|-------|
| Lightweight highlighted code blocks | `stream-markdown` |
| Monaco-powered code blocks | `stream-monaco` |
| Mermaid | `mermaid` |
| D2 | `@terrastruct/d2` |
| KaTeX math | `katex` |

## CSS checklist

- reset first
- Markstream CSS after reset
- in Tailwind or UnoCSS projects, use `@import '...' layer(components)`
- import KaTeX CSS when math is used
- when standalone node components are rendered directly, wrap them with the package root class such as `.markstream-vue`, `.markstream-react`, or `.markstream-svelte`

## Input choice

- `content`: docs pages, static articles, low-frequency updates, and most SSE / token streaming / AI chat surfaces.
- `content` + built-in smooth streaming: jittery AI streams where visible output should be paced independently from raw chunk cadence.
  - `smoothStreaming="auto"` / `smooth-streaming="auto"` is the default.
  - Auto mode enables pacing when `typewriter=true` or `maxLiveNodes <= 0` / `max-live-nodes <= 0`.
  - `typewriter` only controls the blinking cursor and defaults to `false`.
  - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
- `nodes` + `final`: worker-preparsed content, shared AST stores, custom AST transforms, or cases where another layer already owns parsing.
