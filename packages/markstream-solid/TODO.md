# Solid implementation checklist

Tracking issue: https://github.com/Simon-He95/markstream-vue/issues/799

- [x] Inspect the Vue 3 implementation and existing framework packages before implementation.
- [x] Add a native Solid renderer using the shared parser and smooth stream controller.
- [x] Preserve root, paragraph, text and code DOM references across streaming updates.
- [x] Add content/nodes precedence, final and parseOptions, custom components and HTML policies.
- [x] Add Markdown nodes and optional KaTeX/Mermaid/D2/infographic/code integrations.
- [x] Add client/server builds, declarations and CSS exports.
- [x] Add playground-solid with editing, stream/pause/resume, replay, full restore and large history.
- [x] Check full-history batching, bounded live windows, immediate bottom jumps and return to top.
- [x] Check multiple chunk sizes, replacement, reset, restore then resume, repeated final and unmount cleanup.
- [x] Add SSR tests, packed install smoke and browser hydration with a subsequent append.
- [x] Add a repeatable Vue 3/Solid performance comparison with warmup and repeated measurements.
- [x] Complete final repository checks, package smoke and production browser checks; record results and the existing video/ lint blocker in VALIDATION.md.

Publishing remains a separate release action. Vue-specific framework bindings use the native Solid equivalents documented in PARITY.md.

## Vue 3 parity follow-up

- [x] Code toolbar, font controls, collapse/expand, copy feedback, line numbers and diff fallback.
- [x] HTML/SVG preview events, sandboxed HTML modal, close and cleanup behavior.
- [x] Mermaid/D2/infographic source/preview, export, collapse, zoom/pan/fullscreen and events.
- [x] Native standalone node exports, links/images/tables/footnotes, tooltip and i18n behavior.
- [x] Renderer mode, DOM mode, typewriter, parse coalescing, viewport deferral and batching options.
- [x] Virtual metrics, state capture/restore, height caches and outer timeline integration.
- [x] Public API/consumer checks, optional heavy-node browser regressions, streaming/restoration/performance comparison.

## Playground UI and pre/highlight handoff

- [x] Align the chat shell, Controls sidebar, themes and speed simulator with Vue 3; share CSS, options, sample and chunk scheduling.
- [x] Share code header/theme/visual/layout/surface and diff measurement helpers through core; remove duplicate Vue/Solid utility files.
- [x] Align code headers, gutter/padding, fonts, wrapping, tab size and scrollbar reservation; eagerly render the initial batch.
- [x] Run the existing Vue 3 handoff assertions against Solid in wrap/scroll, dark/light, first navigation/reload and narrow layouts.
- [x] Cover native playback controls, source restoration, Unicode transport and mobile/dark settings in the production browser regression.
