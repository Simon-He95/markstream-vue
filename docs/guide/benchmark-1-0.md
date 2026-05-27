---
description: Generate the 1.0 benchmark report for markstream-vue with environment disclosure and playground performance metrics.
---

# 1.0 Benchmark Report

Run the public benchmark report before publishing `markstream-vue@1.0`:

```bash
pnpm benchmark:1.0
```

The command builds the playground, serves it with `vite preview`, then runs the playground checks that are already used for performance regression coverage:

- Diagnostic Studio baseline, thinking, diff, and stress samples in MarkdownCodeBlock and Monaco modes using `/test?benchmark=1`, which disables the version sandbox iframe and annotation layer so frame metrics and renderer DOM metrics track the renderer surface.
- Main playground reverse-flex chat initial load, full-scroll pass, and streaming replay using `/?benchmark=1`.

It writes:

```txt
benchmark/
  results/
    diagnostic-baseline.json
    ...
  1.0.0.chrome-linux-x64.json
  1.0.0.chrome-linux-x64.md
  latest-summary.md
```

The Markdown summary includes the release package version, git SHA, workspace package versions, Node, OS, CPU, browser, viewport, server mode, LCP, CLS, settle time, frame sample count, frame p95 `requestAnimationFrame` interval, full-scroll heavy-settle frame p95, max long task, page DOM node count, renderer DOM node count, visible fallback count, heavy-block readiness, scroll drift, and best-effort Chrome-only heap after renderer unmount plus GC when the browser exposes that value.

Initial rows report heavy-block readiness only for blocks visible in the phase viewport, and show N/A when that viewport contains no heavy blocks. Full-scroll rows report all heavy blocks after the scroll pass. Page DOM nodes are recorded for diagnostics; renderer DOM nodes are scoped to `.preview-surface` or `.chatbot-messages` and are the DOM budget used by the release gate. The report also records parse commits, smooth-stream coalesced parse updates, and markdown-it stream parser full/append/tail/cache counters so stream parser regressions are visible in benchmark output. Frame p95 is recorded for every phase; on full-scroll rows, `scrollFrameP95Ms` covers only the active scroll loop. `heavySettleFrameP95Ms` records post-scroll heavy-block settle separately. Frame p95 values are report metrics for 1.0; the hard release gate stays on fallback counts, heavy-block readiness, DOM budget, CLS, long tasks, and settle time.

When a scenario fails, the runner continues through the remaining scenarios, writes the full report with passed and failed entries, then exits with a non-zero status.

For script debugging only, set `MARKSTREAM_BENCHMARK_SKIP_BUILD=1` to reuse an existing playground build. Do not use that shortcut for release evidence unless the build artifact was just produced. Set `MARKSTREAM_BENCHMARK_SAMPLES=baseline,diff` only when narrowing a local investigation.

## CI workflow

The `1.0 Benchmark` GitHub Actions workflow runs on a nightly schedule and can be started manually. It uploads the generated `benchmark/` directory as an artifact.

Use workflow artifacts for release notes. Local generated reports are snapshots for their disclosed OS/CPU/browser environment; `benchmark/latest-summary.md` is a convenience copy of the local report, not the canonical CI latest. These numbers are release regression metrics, not universal performance guarantees. Do not claim speedups that are not present in a generated report.

## Release gate

The 1.0 release gate runs:

```bash
pnpm run release:gate:1.0
```

That command executes `release:verify`, `docs:build:ci`, `size:check`, and the benchmark report. The release command uses `.tmp/benchmark` for the generated report so publishing does not depend on tracked benchmark artifacts.

Before publishing, run the full package dry run:

```bash
pnpm run release:dry-run:1.0
```

That repeats the release gate, then dry-runs the parser, core, and Vue package publish path.
