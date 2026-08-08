# markstream-core

Framework-agnostic smooth streaming controller and streaming text state utilities for [Markstream](https://github.com/Simon-He95/markstream-vue).

This package extracts the core pacing algorithm and streaming text resolution logic shared across all Markstream framework packages (Vue 3, Vue 2, React, Angular, Svelte).

## Installation

```bash
npm install markstream-core
```

## API

### `createSmoothMarkdownStream`

Factory API for a framework-agnostic streaming controller with snapshot + subscribe semantics.

```ts
import { createSmoothMarkdownStream } from 'markstream-core'

const controller = createSmoothMarkdownStream({ minCharsPerSecond: 40, maxCharsPerSecond: 1000 })

const unsubscribe = controller.subscribe(() => {
  const snapshot = controller.getSnapshot()
  updateUI(snapshot.visible)
  if (snapshot.final)
    onStreamDone()
})

controller.enqueue(chunk)
controller.finish()
controller.flush()
controller.pause()
controller.resume()
controller.destroy()
controller.dispose() // alias of destroy()
unsubscribe()
```

`SmoothMarkdownStreamController` is the public controller interface type returned by `createSmoothMarkdownStream`.

#### Options (`SmoothMarkdownStreamOptions`)

| Option | Default | Description |
|---|---|---|
| `minCharsPerSecond` | 40 | Minimum reveal speed |
| `maxCharsPerSecond` | 1000 | Maximum reveal speed |
| `targetLatencyMs` | 900 | Target latency for pacing calculation |
| `catchUpLatencyMs` | 350 | Latency threshold for catch-up mode |
| `catchUpThreshold` | 600 | Character backlog that triggers catch-up |
| `maxCommitFps` | 30 | Maximum commits per second |
| `startDelayMs` | 80 | Delay before first reveal |
| `maxCharsPerCommit` | 80 | Maximum characters per animation frame |
| `flushOnFinish` | false | Auto-flush when `finish()` is called |

### `resolveStreamingTextState`

Resolves the next streaming text state for simple append detection.

```ts
import { resolveStreamingTextState } from 'markstream-core'

const result = resolveStreamingTextState({
  nextContent: 'hello world',
  previousContent: 'hello',
  typewriterEnabled: true,
})
// result = { settledContent: 'hello', streamedDelta: ' world', appended: true }
```

### `resolveStreamingTextUpdate`

Extended resolver that handles React StrictMode replay guards and stream version resets.

```ts
import { resolveStreamingTextUpdate } from 'markstream-core'

const result = resolveStreamingTextUpdate({
  nextContent: 'hello world!',
  currentState: { settledContent: 'hello', streamedDelta: ' world' },
  typewriterEnabled: true,
})
```

### Shiki Highlighting Helpers

`markstream-core` exports shared helpers used by Markstream adapters to normalize Shiki language and theme options for the code highlighting runtime.

```ts
import {
  getHighlightRegistrationKey,
  getRegisterHighlightOptions,
  getRuntimeShikiRegistrationConfig,
  getShikiLangs,
  getShikiRendererOptions,
  getShikiThemes,
  normalizeShikiLanguage,
  registerHighlightOnce,
} from 'markstream-core'
```

- `getShikiLangs(langs)` normalizes common Shiki language aliases, removes duplicates, and sorts the result because language preload order has no priority semantics.
- `getShikiThemes(themes)` keeps valid string themes, removes duplicates, and preserves caller order so theme priority is not changed.
- `getRegisterHighlightOptions(themes, langs)` and `getShikiRendererOptions(themes, langs)` return normalized options for `registerHighlight()` and `createShikiStreamRenderer()`.
- `getHighlightRegistrationKey(themes, langs)` returns a normalized key. Language order is stable for equivalent preload sets, while theme order is preserved because renderer theme priority is order-sensitive.
- `getRuntimeShikiRegistrationConfig(themes, langs, options)` returns framework-neutral runtime config for adapters that may have a renderer without `registerHighlight()`.
- `registerHighlightOnce(registerHighlight, opts, key)` coalesces in-flight registrations for the same `registerHighlight` function and key.

## Framework Adapters

- **Vue 3**: `useSmoothMarkdownStream` in `markstream-vue` wraps the core controller with Vue reactivity.
- **React / Vue 2 / Angular / Svelte**: Framework packages depend on `markstream-core` internally.
  Import core APIs directly from `markstream-core` when needed.

## License

MIT
