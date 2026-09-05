---
title: CSS Custom Highlight code-block PoC
description: Experimental scoped code-block renderer using CSS Custom Highlight ranges.
keywords:
  - CSS Custom Highlight
  - code block performance
  - stream-diffs benchmark
---

<!-- Licensed to the Apache Software Foundation (ASF) under one or more contributor license agreements. See the NOTICE file distributed with this work for additional information regarding copyright ownership. The ASF licenses this file to you under the Apache License, Version 2.0. -->

# CSS Custom Highlight code-block PoC

Issue #726 adds an opt-in `CssHighlightCodeBlock` prototype. It keeps a plain
`<pre><code>` while a block is streaming and applies namespaced CSS Custom
Highlight ranges only after the node settles.

```ts
import { setCustomComponents } from 'markstream-vue'
import MyCssHighlightCodeBlock from './MyCssHighlightCodeBlock.vue'

setCustomComponents('css-highlight-benchmark', {
  code_block: MyCssHighlightCodeBlock,
})
```

`CssHighlightCodeBlock` is exported as an experimental lazy component. Register
it through the stable `code_block` override API; it remains opt-in and does not
replace the default renderer.

The adapter intentionally uses a small lexer rather than MicroLighter's
module-global `highlightAll()` API. Each instance receives a unique registry
prefix, uses `StaticRange`, cancels stale work, and removes all ranges on
unmount. Unsupported browsers and languages remain readable without
highlighting. This is an experiment, not a replacement for `stream-diffs`.

The measured benefits are deliberately narrow: a shallow DOM (for example, two
nodes instead of thousands of line/token nodes), no layout handoff when a block
settles, and very cheap theme changes because only the highlight stylesheet is
updated. These measurements do **not** show that CSS Highlight is generally
faster. With several large code blocks, tokenization and range construction can
create a seconds-long main-thread settle cliff, while the default `stream-diffs`
renderer remains responsive in the same streaming window.

Run the reproducible Chrome fixture benchmark with:

```bash
pnpm benchmark:css-highlight
```

For streaming behavior, reuse the real-browser split harness:

```bash
MARKSTREAM_STREAMING_SPLIT_RENDERERS=markstream-local,markstream-css-highlight-local,markstream-css-highlight-worker \
  pnpm benchmark:streaming-split
```

The CSS Highlight renderers are opt-in in `benchmark:streaming-split` and are
not included in the default renderer list. Set
`MARKSTREAM_STREAMING_SPLIT_INCLUDE_CSS_HIGHLIGHT=1` to include both rows, or
select a renderer explicitly as above. The worker row is reported as
`unavailable` until a worker tokenizer and lifecycle are implemented.

The streaming artifact separates per-chunk commit avg/p95/max, main-thread
busy ratio, long tasks, frame timing, mutations, and the settle handoff. The
CSS Highlight row also reports tokenizer, `StaticRange` construction, registry
update, first-enhanced, and disposal timings. `loading` commits must report
zero tokenizer and registry work. The worker-tokenizer row is intentionally
reported as unavailable until a pure transferable tokenizer and worker
lifecycle are implemented.

It records plain `<pre>`, this local adapter, and pinned MicroLighter 2.1.0
rows for 1/12/24 blocks and 100/1,000/10,000 lines by default. The checked-in
artifact was generated with the 100- and 1,000-line subset to keep the fixture
run practical; pass `MARKSTREAM_CSS_HIGHLIGHT_LINES=100,1000,10000` to collect
the full matrix. To approximate production code density as well as the sparse
fixture, run with `MARKSTREAM_CSS_HIGHLIGHT_DENSITY=dense`; the selected density
is recorded in the result JSON. Static results include total duration, long-task
count/total/max, and (for the local adapter) tokenize, range-build, and registry
segment timings. It also attempts the
stream-diffs main-thread surface and records an explicit `unavailable` reason
when browser import-map dependencies are not provided. The worker-pool row is
explicitly `not-run` because it requires the stream-diffs playground worker
manager.

## Decision note

The current evidence supports keeping this as a documented custom-component
recipe. A synthetic Chrome run showed that shallow DOM does not guarantee a
faster result: tokenizer and range creation dominated at 1,000-line fixtures.
Treat the component as an opt-in experiment; `stream-diffs` remains the default
for streaming workloads. The static fixture is not a streaming conclusion; use
the split harness before making a renderer decision.
The raw exploratory measurements are checked in at
`test/benchmark/css-highlight-results.json`. A release decision still requires
the real-browser matrix described in Issue #726, including MicroLighter 2.1.0
and the current `main` revision after PR #18 was merged (the fix is not yet a
published package release).
