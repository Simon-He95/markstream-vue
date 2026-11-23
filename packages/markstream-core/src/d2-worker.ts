export interface D2WorkerOwner {
  ready?: Promise<unknown> | null
  worker?: { terminate?: () => void } | null
}

const disposedInstances = new WeakSet<object>()

/**
 * Releases the worker owned by a D2 SDK instance constructed by a renderer.
 *
 * The SDK assigns its worker asynchronously while it initializes, so a caller
 * unmounting mid-initialization must wait for `ready` before terminating.
 * Instances supplied by a shared loader belong to the loader and must never be
 * passed here.
 */
export function disposeOwnedD2Instance(instance: D2WorkerOwner | null | undefined): void {
  if (!instance || typeof instance !== 'object' || disposedInstances.has(instance))
    return
  disposedInstances.add(instance)

  const terminate = () => {
    try {
      instance.worker?.terminate?.()
    }
    catch {
      // Cleanup runs during unmount; a failing loader must not abort it.
    }
  }

  if (instance.worker) {
    terminate()
    return
  }

  const ready = instance.ready
  if (ready && typeof ready.then === 'function')
    void ready.then(terminate, terminate)
}
