# Parser streaming and history performance audit

This change keeps two consumer optimizations: return linkify demotion-context cache hits without Map delete/set promotion, and directly emit ordinary single text tokens before allocating the general inline parse state. Cache limits and inference rules stay the same; eviction follows insertion order. The plain-text path preserves the exact text shape, including center:false, and leaves recovery markers on the existing path.

The related markdown-it-ts change reuses an already verified full-source append delta. Both repos were measured through the actual Markstream parser factory and default plugins. No Vue rendering behavior, public API, configuration flag or dependency version changes are included.

## Consumer contribution

Node v24.16.0, Apple M1 Pro, darwin/arm64. Five independent-process rounds, two warmups, median wall and process CPU milliseconds. Both columns use the same final markdown-it-ts build; only the consumer changes. Baseline consumer: 1dc6f7c37.

| Workload | Wall ms, old → new consumer | CPU ms, old → new consumer |
|---|---:|---:|
| stream-table | 687.34 → 524.59 | 913.00 → 736.75 |
| chunks-table-1 | 3521.46 → 2402.29 | 3762.63 → 2609.85 |
| restore-table-100-messages | 285.25 → 211.74 | 483.02 → 393.37 |
| family-restore-math | 132.78 → 95.75 | 218.60 → 167.07 |
| family-restore-feature-mixed | 142.84 → 139.02 | 262.66 → 260.67 |

Restore includes creation of a fresh parser for every message and retains all returned nodes during the batch; it is warmed module/JIT throughput, not cold startup. Streaming measures every update. It excludes Vue mount/layout, code highlighting, math/diagram rendering and network time. Small regressions and neutral cases are retained in the full matrix, rather than described as wins. Standalone tests also pass with the repository's existing published dependency; these timing numbers specifically use the locally built companion parser.

## Evidence and rejected directions

The [full 59-workload matrix and reproduction instructions](https://github.com/Simon-He95/markdown-it-ts/blob/codex/markstream-performance-audit/docs/perf-markstream-consumer.md), [all final samples](https://github.com/Simon-He95/markdown-it-ts/blob/codex/markstream-performance-audit/docs/perf-markstream-consumer.json), and [experimental samples](https://github.com/Simon-He95/markdown-it-ts/blob/codex/markstream-performance-audit/docs/perf-markstream-experiments.json) live with the cross-repo harness.

Twelve directions were investigated; only three production changes across both repos survived. Rejected prototypes include incremental table-token merging (stale post-block plugin metadata), signature-based row caching (2.1–2.4× slower), removing the linkify filter (mixed gains/regressions), Token spread removal (no stable marginal gain after the plain-text path), and skipping core-rule clocks (inconsistent consumer gains). Worker experiments improved some restore wall times but increased total CPU; automatic source-only AST caching changed stateful hook results and expanded serialized size about 13×.

Every intermediate structured output matched baseline JSON hashes across all 59 final workloads. JSON does not prove object prototype or undefined-property parity, so exact text-shape regression tests supplement it. Ordinary text was also checked against the original baseline bundle for 2,328 distinct content/raw/final combinations. New tests cover cache hits/eviction, frozen text tokens, exact center:false output, empty text and recovery boundaries.

Validation: full lint, root and parser typecheck, and 349 test files / 3,077 tests pass using existing dependencies. The companion integration suite rebuilds and links the local markdown-it-ts, then restores dependency files and parser dist. The pre-existing .tmp source copies are excluded from test collection via CLI.

Final locally rebuilt/linked integration: 349 files / 3,077 tests pass, with dependency files and dist restored. The existing main-playground-performance E2E passes loading, scrolling and replay; it is a sanity check, not a browser speedup comparison.
