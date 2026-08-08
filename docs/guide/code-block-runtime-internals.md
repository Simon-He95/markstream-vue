# Code Block Runtime Internals

This legacy route describes how markstream-vue connects `CodeBlockNode` to the framework-agnostic `stream-diffs` root runtime.

## Loading contract

`getStreamDiffsRuntime()` is the loader export (renamed from the historical `getUseMonaco` in 2.0). It dynamically imports `stream-diffs`, not `stream-diffs/vue`. The returned adapter exposes the small editor-compatible surface that `CodeBlockNode` needs: create, update, theme, measure, and dispose.

```text
CodeBlockNode                 markstream-vue runtime                stream-diffs
-------------                 ----------------------                ------------
Vue state and viewport   ->   cached dynamic import             ->   DOM controller
component unmount        ->   controller cleanup                ->   surface dispose
```

The import is cached while it is in flight. A failed load leaves the code block on its `<pre>` representation; a later block can retry the optional import.

## Finalization contract

The controller receives a plain `HTMLElement` plus code or diff strings. It has no knowledge of Vue props, watchers, component instances, or unmount hooks.

`CodeBlockNode` owns this policy:

1. Keep the fallback visible during streaming.
2. Wait for completion and viewport eligibility.
3. Create one static File or FileDiff surface using `stream: false`.
4. Apply the active theme and reveal the surface only after its first render.
5. Dispose it when the Vue component unmounts or changes identity.

This keeps high-frequency streaming updates out of the syntax-highlighting surface and gives each finalized block a single controller lifetime.

## Preload

`preloadCodeBlockRuntime()` is an optional module warm-up. It does not mount a code block or override the completion/visibility policy.

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

## Themes

Theme changes are sent to the mounted `stream-diffs` surface. Theme application is scoped to that surface, so one code block does not change another block through a global runtime mutation.

## Disposal

The Vue adapter calls `cleanupEditor()` when a code block unmounts or is replaced. The controller releases its DOM surface and subscriptions. The runtime module itself remains cached by the JavaScript module loader for later blocks.
