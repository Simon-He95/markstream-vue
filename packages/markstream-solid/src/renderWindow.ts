export const DEFAULT_NODE_HEIGHT = 32
export const MAX_DEFERRED_NODE_COUNT = 900

export interface LiveRange { start: number, end: number }

export interface DeferNodesOptions {
  deferNodesUntilVisible?: boolean
  maxLiveNodes?: number
  parsedNodeCount: number
  viewportPriority?: boolean
  virtualizationEnabled: boolean
}

export function resolveVirtualizationEnabled(parsedNodeCount: number, maxLiveNodes?: number) {
  const configured = Math.trunc(maxLiveNodes ?? 320)
  if (!Number.isFinite(configured) || configured <= 0)
    return false
  return parsedNodeCount > Math.max(1, configured)
}

export function resolveDeferNodes(options: DeferNodesOptions) {
  if (options.deferNodesUntilVisible === false)
    return false
  const configured = Math.trunc(options.maxLiveNodes ?? 320)
  if (!Number.isFinite(configured) || configured <= 0)
    return false
  if (options.virtualizationEnabled || options.parsedNodeCount > MAX_DEFERRED_NODE_COUNT)
    return false
  return options.viewportPriority !== false
}

export function resolveAverageNodeHeight(nodeHeights: ReadonlyMap<number, number>, fallback = DEFAULT_NODE_HEIGHT) {
  if (!nodeHeights.size)
    return fallback
  let total = 0
  for (const height of nodeHeights.values())
    total += height
  return Math.max(16, total / nodeHeights.size)
}

export function estimateHeightRange(start: number, end: number, nodeHeights: ReadonlyMap<number, number>, averageNodeHeight: number) {
  let total = 0
  for (let index = start; index < end; index += 1)
    total += nodeHeights.get(index) ?? averageNodeHeight
  return total
}

export function computeLiveRange(total: number, focusIndex: number, maxLiveNodes?: number, liveNodeBuffer?: number): LiveRange {
  if (!total)
    return { start: 0, end: 0 }
  const max = Math.max(1, Math.trunc(maxLiveNodes ?? 320))
  const buffer = Math.max(0, Math.trunc(liveNodeBuffer ?? 60))
  const focus = Math.max(0, Math.min(Math.trunc(focusIndex), total - 1))
  let start = Math.max(0, focus - buffer)
  let end = Math.min(total, focus + buffer + 1)
  const size = end - start
  if (size > max) {
    const excess = size - max
    start += Math.ceil(excess / 2)
    end -= Math.floor(excess / 2)
  }
  else if (size < max) {
    const missing = max - size
    start = Math.max(0, start - Math.ceil(missing / 2))
    end = Math.min(total, end + Math.floor(missing / 2))
  }
  return { start: Math.max(0, Math.min(start, total)), end: Math.max(0, Math.min(Math.max(end, start), total)) }
}
