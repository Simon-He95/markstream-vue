# Solid playground

Run `pnpm install` and `pnpm play:solid`, then open http://localhost:4178.

The home page follows the Vue 3 playground: chat layout, responsive Controls sidebar, brand/code themes, HTML policy, dark mode, smooth streaming, Estimated TPS and random chunk profiles. Both playgrounds import the same page CSS, speed-panel CSS, theme lists, Markdown sample, chunk scheduler and ReadableStream generator. Solid owns the signals, components and stream lifecycle.

Retry replays the input. Pause/Resume preserves active elapsed time. Controls also provides source editing, full document restoration, a 1,000-node fixture and toolbar/preview examples. The Virtual timeline action uses the native Solid timeline. Vue scroller and CDN link to the Vue playground's framework-specific demos.

Open `/line-number-handoff-check` to compare the native pre fallback with the real highlighted editor. Use `?theme=dark&codeOverflow=scroll` for the dark horizontal-scroll case. The shared browser harness checks typography, gutter/padding, first-glyph coordinates, height continuity, dark/light themes and narrow layouts against the Vue 3 contract:

```bash
pnpm test:e2e:line-number-handoff-playgrounds --framework=vue3,solid
CODE_OVERFLOW=scroll pnpm test:e2e:line-number-handoff-playgrounds --framework=vue3,solid
```

`pnpm play:solid:build` creates the production playground. `pnpm test:e2e:solid-playground` verifies its controls, streaming/restoration, previews, virtualization, hydration and seven Vue 3/Solid performance scenarios. Generated data and screenshots are saved in `.tmp/solid/`.
