# Code Block Runtime

This page documents the optional `stream-diffs` runtime used by `CodeBlockNode`. In 2.0 the previous Monaco-based options API and the `stream-monaco` fallback were removed: `stream-diffs` is the only enhanced code block surface, and code/diff behavior uses its built-in defaults.

## Install

```bash
pnpm add stream-diffs
```

No worker plugin or package-specific CSS import is required.

If `stream-diffs` is not installed, the loader keeps the `<pre>` fallback and renders the code block without an enhanced surface.

## Runtime boundary

```text
markstream-vue                         stream-diffs
---------------                        ------------
CodeBlockNode                          controller + DOM surface
  - Vue props / unmount                  - HTMLElement target
  - streaming completion                 - code or diff data
  - viewport decision                    - File / FileDiff rendering
  - header and toolbar                   - syntax highlighting
```

The `stream-diffs` root entry is framework-agnostic. It does not import Vue or own a Vue lifecycle. The package also exposes an optional `stream-diffs/vue` convenience entry for direct Vue consumers, but `markstream-vue` does not use that entry.

## CodeBlockNode handoff

`CodeBlockNode` uses one stable visual path:

1. While code is streaming, Vue renders `PreCodeNode`.
2. After the block is complete and visible, the component dynamically imports the `stream-diffs` root runtime and mounts one File or FileDiff surface into its existing container.
3. The component applies the active theme to that surface and removes the temporary `<pre>` only when the surface is ready.
4. On component unmount, the Vue adapter disposes the controller.

Completion, visibility, and unmount are `CodeBlockNode` concerns. They are not `stream-diffs` lifecycle hooks.

`CodeBlockShell` owns the title and action bar. The File surface is created with its internal `data-diffs-header` disabled so the DOM has one header.

## Theming

Use the `theme` / `darkTheme` / `lightTheme` / `themes` props for light/dark themes. `CodeBlockNode` sends theme changes to its mounted surface without recreating the Vue component.

The former `monacoOptions` / `codeBlockMonacoOptions` props are removed in 2.0 with no replacement; code and diff options fall back to the `stream-diffs` built-in defaults.

## Optional preload

If a route is known to contain completed, visible code blocks, preload the module during idle time:

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

This only warms the optional module. It does not create a surface, finalize a streaming block, or bypass the completion-and-visibility gate.

## Diff interactions

Diff blocks keep the same adapter boundary. The enhanced diff surface (folding, unchanged-region handling, inline vs side-by-side layout) is driven by `stream-diffs` built-in defaults; there is no per-block diff options prop in 2.0.
