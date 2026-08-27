/**
 * Throttle utility for performance optimization.
 * Ensures a function is called at most once per specified time period.
 * Optimized to reduce setTimeout calls.
 */

export interface ThrottledFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void
  cancel: () => void
}

/**
 * Creates a throttled version of the provided function.
 * The throttled function will invoke the original function at most once per `wait` milliseconds.
 *
 * @param fn - The function to throttle
 * @param wait - The minimum time in milliseconds between invocations
 * @returns A throttled version of the function with a `cancel()` method that
 * drops any pending trailing call and clears the scheduled timeout (useful on
 * unmount so a late timer cannot fire after teardown).
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
): ThrottledFunction<T> {
  let lastCall = 0
  let timeout: ReturnType<typeof setTimeout> | null = null
  let pendingArgs: Parameters<T> | null = null

  const execute = () => {
    const args = pendingArgs
    pendingArgs = null
    timeout = null

    if (args) {
      lastCall = Date.now()
      fn(...args)
    }
  }

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now()
    const remaining = wait - (now - lastCall)

    // Store the latest args
    pendingArgs = args

    if (remaining <= 0) {
      // Execute immediately
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      lastCall = now
      pendingArgs = null
      fn(...args)
    }
    else if (!timeout) {
      // Schedule single timeout
      timeout = setTimeout(execute, remaining)
    }
    // else: timeout already scheduled, will use latest pendingArgs
  }

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
    pendingArgs = null
  }

  return throttled
}
