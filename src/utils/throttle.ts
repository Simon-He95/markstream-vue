/**
 * Throttle utility for performance optimization.
 * Ensures a function is called at most once per specified time period.
 * Optimized to reduce setTimeout calls.
 */

/**
 * Creates a throttled version of the provided function.
 * The throttled function will invoke the original function at most once per `wait` milliseconds.
 *
 * @param fn - The function to throttle
 * @param wait - The minimum time in milliseconds between invocations
 * @returns A throttled version of the function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
): (...args: Parameters<T>) => void {
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

  return function throttled(...args: Parameters<T>) {
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
}
