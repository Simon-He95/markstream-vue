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

## Component, worker, streaming and docs follow-up

- [x] Align Mermaid/Infographic/D2 headers, icons, mode layout, source typography and scoped Chinese labels.
- [x] Use stable native math nodes with real worker injection, cancellation, coalescing and optional-peer fallback.
- [x] Share theme/layout tokens, pre/diff CSS and streaming fade state through core; preserve selected text DOM.
- [x] Match live-tail deferral and virtual flow-root behavior; remove initial full-document playback work; share pinned-image styling.
- [x] Avoid empty-editor visual-ready queue waits and repeated font/theme resets; correct idle/batch delay and budget recovery.
- [x] Compare 43 component style cases across four states and 25 properties; verify worker messages and full playback in production.
- [x] Add bilingual Solid docs, framework/guide/quick-start entries, Pages playground link, LLM/SEO routing and docs build validation.

## Restoration throughput, scroll stability and images

- [x] Locate diff folding, trailing-line editor handoff and Mermaid source/preview height changes with per-node frame traces.
- [x] Preserve measured streaming code geometry and align diagram height caps; require zero backward scrolls.
- [x] Match Vue 3 completed-content and continuous-stream batching semantics; align batch adaptation and idle scheduling.
- [x] Keep the original comparison and add a true multi-batch, 1,000-node restoration scenario.
- [x] Share playground static assets, bundle the demo PNG, defer incomplete image URLs and verify both decoded images.
- [x] Restrict tag-based custom component routing to HTML nodes; preserve Image headings, ordinary paragraphs and typed custom node metadata.
- [x] Continue bottom following while final input drains through smooth rendering; assert the finished viewport remains at the bottom.

## Virtual timeline entry

- [x] Reproduce the Markdown timeline stack overflow and isolate restoreState / heightCache effect dependencies.
- [x] Verify known-width reactive restoration, changed incoming state and independent height caches.
- [x] Click the real playground entry during streaming and after restore; navigate 1,000 Markdown items and exit with bounded DOM and no browser errors.
- [x] Resolve the shared-parser footnote prefix being temporarily classified as bracket math; defer ambiguous trailing definitions and preserve the captured before/after traces.

## Nested blockquote parity

- [x] Match Vue 3 margin containment for nested and mixed block quotes while preserving the simple-paragraph path.
- [x] Move the existing pure simple-inline helpers into core and reuse them from Vue and Solid.
- [x] Verify custom paragraph overrides, streaming DOM identity, replacement/restoration and per-level browser geometry across widths and themes.

## Shared parser footnote streaming

- [x] Keep footnote prefixes out of tolerant bracket math without changing explicit TeX or supported bracket formulas.
- [x] Defer unresolved standalone trailing definitions until body/newline/final, preserving known references, literals, code and final empty definitions.
- [x] Compare every incremental AST prefix against cold parsing; verify final output and full restoration.
- [x] Replay identical Vue 3 / Solid input at 1/7/64 characters, smooth off/on, with bracket/colon stages held to expose transient rollback.
