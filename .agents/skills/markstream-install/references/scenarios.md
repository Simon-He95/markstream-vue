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

Peer sets are package-specific. Confirm the selected package's current `peerDependencies` before installing anything.

| Feature | Peers | Package notes |
|---------|-------|---------------|
| Enhanced File/Diff and diff code blocks | `stream-diffs` | All packages |
| Mermaid | `mermaid` | All renderer packages |
| D2 | `@terrastruct/d2` | All renderer packages |
| KaTeX math | `katex` | All renderer packages |
| Infographic blocks | `@antv/infographic` | All renderer packages; Vue 3 also requires `setInfographicLoader(...)` |

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
