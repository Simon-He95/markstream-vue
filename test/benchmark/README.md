# Performance Testing Tools

This directory contains tools and documentation for analyzing the performance of KaTeX Worker-based rendering.

## Files

### Benchmark Tests
- **`katex-worker-vs-direct.test.ts`** - Comprehensive benchmark comparing Worker vs direct rendering
- **`katex-performance-demo.html`** - Interactive visual demo for performance testing

### Documentation
- **`katex-worker-performance-analysis.md`** - Complete guide on measuring performance
- **`docs/zh/katex-cache-analysis.md`** - Quick summary (Chinese)

## Quick Start

### Run Benchmarks

```bash
# Run all performance tests
pnpm test test/benchmark/

# Run specific test
pnpm test test/benchmark/katex-worker-vs-direct.test.ts

# With detailed output
pnpm test test/benchmark/katex-worker-vs-direct.test.ts -- --reporter=verbose
```

### Visual Demo

Open `katex-performance-demo.html` in a browser to see an interactive performance comparison.

### Runtime Monitoring

Add to your application:

```typescript
import { enablePerfMonitoring, getPerfReport } from 'markstream-vue/utils/performance-monitor'

enablePerfMonitoring()

// After some usage...
setTimeout(() => getPerfReport(), 30000)
```

Or use browser console:

```javascript
window.__katexPerfReport()
```

## Key Insights

### Cache is Critical
- Cache hit: **~0.01ms**
- Worker render: **5-50ms**
- **Speedup: 500-5000x** 🚀

### Real-World Performance
- Typical cache hit rate: **70-85%**
- Performance improvement: **3-10x**
- Memory overhead: **~36KB for 200 formulas**

### When Worker + Cache Wins
✅ Complex formulas (>10ms render time)
✅ Multiple formulas per page (>5)
✅ Repeated formulas (cache hit rate >30%)
✅ User interaction matters (scrolling, animations)

## Decision Matrix

| Scenario | Recommendation |
|----------|----------------|
| Complex formulas | ✅ Use Worker + Cache |
| Many formulas per page | ✅ Use Worker + Cache |
| High repetition | ✅✅ Cache is highly effective |
| Simple formulas only | ⚠️ Worker overhead acceptable |
| SSR/Node.js | ⚠️ Fallback to direct render |

## Current Architecture (Best Practice)

```typescript
// 1. Check cache first (<0.01ms)
const cached = cache.get(key)
if (cached)
  return cached

// 2. Use Worker (non-blocking)
return renderKaTeXInWorker(content)
  .then((html) => {
    cache.set(key, html) // Populate cache
    return html
  })
  .catch(() => {
    // 3. Fallback to direct render
    return katex.renderToString(content)
  })
```

**This hybrid approach is optimal!** ✅
