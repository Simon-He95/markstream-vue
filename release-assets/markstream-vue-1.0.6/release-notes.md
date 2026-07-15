# markstream-vue 1.0.6 — less work before users need it

This release focuses on long restored AI conversations and code-heavy streams. Large final documents can now stay bounded, and expensive offscreen code, image, math, Mermaid, D2, and Infographic work waits until it approaches the viewport.

![markstream-vue 1.0.6 release poster with Rem and benchmark highlights](https://github.com/Simon-He95/markstream-vue/releases/download/markstream-vue%401.0.6/markstream-vue-1.0.6-rem.png)

## Measured highlights

Same machine, same `1.0.6` benchmark harness, exact `1.0.5` and `1.0.6` tag sources, five-run median, Chrome with 4× CPU throttling:

| Scenario | 1.0.5 | 1.0.6 | Change |
| --- | ---: | ---: | ---: |
| Heavy restore: main-thread work | 1,579.5 ms | 402.1 ms | **-74.5%** |
| Heavy restore: DOM nodes | 583 | 233 | **-60.0%** |
| Heavy restore: peak JS heap | 43.0 MB | 17.5 MB | **-59.3%** |
| Heavy restore: long-task total | 1,218 ms | 267 ms | **-78.1%** |
| TypeScript-fence stream: catch-up | 381.2 ms | 303.6 ms | **-20.4%** |

The heavy-restore case is a 95-node final chat document with offscreen code, images, KaTeX, Mermaid, and Infographic content. These numbers describe the initial unscrolled restore, where `1.0.6` intentionally defers work that is not visible yet. Plain-text streaming remained roughly flat in the same run.

## What improved

- **Bounded final restores:** long `chat` and `minimal` restores can automatically virtualize the node list instead of mounting the whole document.
- **Viewport-first heavy content:** offscreen code, images, math, Mermaid, D2, Infographic, and async components avoid eager enhancement and runtime loading.
- **Faster streaming structure updates:** stable top-level parser nodes are reused on safe append/tail paths, while custom transforms continue to take the conservative path.
- **Better render scheduling:** larger chat/minimal batches, a more realistic frame budget, shorter delays, and per-frame throttling for high-frequency virtual metrics.
- **Smoother text commits:** grapheme streaming avoids repeatedly slicing the entire pending tail.
- **Stable code and diff handoff:** incomplete fence languages wait for completion; fallback heights, folded diffs, highlights, and Monaco transitions remain stable across streaming and restore.
- **More resilient streams:** fixes cover deferred render races, virtual-timeline identity, math and Mermaid mid-states, CJK emphasis delimiters, linkify candidates, tooltips, and copy events.

## Upgrade

```bash
pnpm add markstream-vue@1.0.6
```

Full comparison: https://github.com/Simon-He95/markstream-vue/compare/markstream-vue@1.0.5...markstream-vue@1.0.6
