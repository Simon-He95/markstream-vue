/**
 * Performance monitoring utility for KaTeX rendering
 * Helps determine if Worker is beneficial in production
 */

interface RenderMetrics {
  type: 'worker' | 'direct' | 'cache-hit'
  duration: number
  formulaLength: number
  timestamp: number
  success: boolean
  error?: string
}

class PerformanceMonitor {
  private metrics: RenderMetrics[] = []
  private enabled = false
  private maxMetrics = 1000 // Prevent memory leak

  enable() {
    this.enabled = true
  }

  disable() {
    this.enabled = false
  }

  recordRender(metrics: RenderMetrics) {
    if (!this.enabled)
      return

    this.metrics.push(metrics)

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift()
    }
  }

  getStats() {
    if (this.metrics.length === 0) {
      return {
        totalRenders: 0,
        cacheHitRate: 0,
        averageWorkerTime: 0,
        averageDirectTime: 0,
        averageCacheHitTime: 0,
        workerSavings: 0,
        recommendation: 'Insufficient data',
      }
    }

    const workerMetrics = this.metrics.filter(m => m.type === 'worker' && m.success)
    const directMetrics = this.metrics.filter(m => m.type === 'direct' && m.success)
    const cacheHitMetrics = this.metrics.filter(m => m.type === 'cache-hit')

    const totalRenders = this.metrics.length
    const cacheHits = cacheHitMetrics.length
    const cacheHitRate = (cacheHits / totalRenders) * 100

    const avgWorkerTime = workerMetrics.length > 0
      ? workerMetrics.reduce((sum, m) => sum + m.duration, 0) / workerMetrics.length
      : 0

    const avgDirectTime = directMetrics.length > 0
      ? directMetrics.reduce((sum, m) => sum + m.duration, 0) / directMetrics.length
      : 0

    const avgCacheHitTime = cacheHitMetrics.length > 0
      ? cacheHitMetrics.reduce((sum, m) => sum + m.duration, 0) / cacheHitMetrics.length
      : 0

    // Calculate time saved by using Worker + Cache vs always using direct
    const estimatedDirectTime = totalRenders * avgDirectTime
    const actualTime = workerMetrics.reduce((sum, m) => sum + m.duration, 0)
      + directMetrics.reduce((sum, m) => sum + m.duration, 0)
      + cacheHitMetrics.reduce((sum, m) => sum + m.duration, 0)

    const workerSavings = estimatedDirectTime - actualTime

    // Recommendation logic
    let recommendation = ''
    if (cacheHitRate > 70 && avgWorkerTime < avgDirectTime * 2) {
      recommendation = '✅ Worker + Cache is highly beneficial'
    }
    else if (cacheHitRate > 50) {
      recommendation = '✅ Worker + Cache is beneficial'
    }
    else if (avgWorkerTime > avgDirectTime * 3) {
      recommendation = '⚠️ Worker overhead too high, consider direct rendering'
    }
    else if (avgDirectTime < 5) {
      recommendation = '⚠️ Formulas too simple, Worker overhead may not be worth it'
    }
    else {
      recommendation = '✅ Worker prevents main thread blocking'
    }

    return {
      totalRenders,
      cacheHits,
      cacheHitRate: cacheHitRate.toFixed(1),
      workerCalls: workerMetrics.length,
      directCalls: directMetrics.length,
      averageWorkerTime: avgWorkerTime.toFixed(2),
      averageDirectTime: avgDirectTime.toFixed(2),
      averageCacheHitTime: avgCacheHitTime.toFixed(3),
      workerSavings: workerSavings.toFixed(2),
      recommendation,
    }
  }

  printReport() {
    const stats = this.getStats()

    console.group('📊 KaTeX Rendering Performance Report')
    console.log(`Total renders: ${stats.totalRenders}`)
    console.log(`Cache hits: ${stats.cacheHits} (${stats.cacheHitRate}%)`)
    console.log(`Worker calls: ${stats.workerCalls}`)
    console.log(`Direct calls: ${stats.directCalls}`)
    console.log('')
    console.log('Timing:')
    console.log(`  Worker average: ${stats.averageWorkerTime}ms`)
    console.log(`  Direct average: ${stats.averageDirectTime}ms`)
    console.log(`  Cache hit average: ${stats.averageCacheHitTime}ms`)
    console.log('')
    console.log(`Time saved: ${stats.workerSavings}ms`)
    console.log(`Recommendation: ${stats.recommendation}`)
    console.groupEnd()

    return stats
  }

  reset() {
    this.metrics = []
  }

  // Export metrics for analysis
  exportMetrics() {
    return {
      metrics: [...this.metrics],
      stats: this.getStats(),
      timestamp: Date.now(),
    }
  }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor()

// Convenience functions
export function enablePerfMonitoring() {
  perfMonitor.enable()
  console.log('📊 KaTeX performance monitoring enabled')
}

export function disablePerfMonitoring() {
  perfMonitor.disable()
  console.log('📊 KaTeX performance monitoring disabled')
}

export function getPerfReport() {
  return perfMonitor.printReport()
}

// Can be called from browser console: window.__katexPerfReport()
if (typeof window !== 'undefined') {
  ; (window as any).__katexPerfReport = getPerfReport
  ; (window as any).__katexPerfMonitor = perfMonitor
}
