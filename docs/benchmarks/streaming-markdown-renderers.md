---
title: Streaming Markdown benchmark methodology
description: Benchmark scenarios and methodology for measuring Markdown streaming renderer performance. Describes test fixtures, chunk patterns, and measurement approaches used or planned for Markstream benchmarks.
keywords:
  - streaming markdown benchmark
  - renderer performance measurement
  - streaming renderer test fixtures
  - chunk pattern benchmarks
---
# Streaming Markdown benchmark methodology

This page describes the benchmark scenarios we use or plan to use for measuring streaming Markdown renderer performance. Run `pnpm benchmark:1.0` for current markstream-vue release-gate data.

Cross-renderer comparison results are not published yet.

## Tested packages (planned and current)

| Package | Framework | Notes |
| --- | --- | --- |
| markstream-vue | Vue 3 | content input path / nodes input path |
| markstream-react | React | content input path / nodes input path |
| react-markdown | React | static baseline |
| streamdown | React | streaming-focused baseline |
| markdown-it | parser | parser-only baseline |
| marked | parser | parser-only baseline |

## Scenarios

| Scenario | Size | Chunk pattern | Includes |
| --- | --- | --- | --- |
| short chat | 5 KB | 20-char chunks | paragraphs, lists |
| long answer | 20 KB | token chunks | code, lists, links |
| reasoning answer | 100 KB | paragraph chunks | code, tables |
| technical doc | 1 MB | paragraph chunks | headings, tables, code |
| diagram-heavy | 50 KB | block chunks | Mermaid, KaTeX |

## How to reproduce

```bash
pnpm install
pnpm benchmark:1.0
```

The benchmark script:
1. Generates Markdown content at various sizes
2. Simulates streaming by delivering content in chunks
3. Measures render time, DOM updates, and memory usage
4. Outputs results to the console and generates report files

## 1.0 Benchmark Report

For detailed performance data for markstream-vue 1.0, run:

```bash
pnpm benchmark:1.0
```

See the generated report at [1.0 Benchmark Report](/guide/benchmark-1-0) for:
- Raw timing data
- Memory profiles
- Streaming split performance
- Package versions and commit SHA

## Performance characteristics (markstream-vue 1.0 only)

For markstream-vue 1.0 release-gate data, refer to the [1.0 Benchmark Report](/guide/benchmark-1-0). Cross-framework and cross-renderer comparison numbers require additional benchmark fixtures and will be published separately.

## Methodology notes

- Benchmarks run on Node.js for parser-level tests and in browser (Playwright) for renderer-level tests
- Content is generated to simulate realistic AI output patterns (code blocks, tables, math, diagrams)
- Streaming is simulated at 20-char chunks delivered at 30Hz
- Memory is measured via `performance.memory` (Chrome) and heap snapshots (Node.js)
