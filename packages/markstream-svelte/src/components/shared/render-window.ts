export const DEFAULT_NODE_HEIGHT = 32
export const MAX_DEFERRED_NODE_COUNT = 900

export interface LiveRange {
  start: number
  end: number
}

export interface DeferNodesOptions {
  deferNodesUntilVisible?: boolean
  maxLiveNodes?: number
  parsedNodeCount: number
  viewportPriority?: boolean
  virtualizationEnabled: boolean
}

export function resolveVirtualizationEnabled(parsedNodeCount: number, maxLiveNodes?: number) {
  const configuredMaxLiveNodes = Math.trunc(maxLiveNodes ?? 320)
  if (!Number.isFinite(configuredMaxLiveNodes) || configuredMaxLiveNodes <= 0)
    return false
  const resolvedMaxLiveNodes = Math.max(1, configuredMaxLiveNodes)
  return parsedNodeCount > resolvedMaxLiveNodes
}

export function resolveDeferNodes(options: DeferNodesOptions) {
  if (options.deferNodesUntilVisible === false)
    return false
  const configuredMaxLiveNodes = Math.trunc(options.maxLiveNodes ?? 320)
  if (!Number.isFinite(configuredMaxLiveNodes) || configuredMaxLiveNodes <= 0)
    return false
  if (options.virtualizationEnabled)
    return false
  if (options.parsedNodeCount > MAX_DEFERRED_NODE_COUNT)
    return false
  return options.viewportPriority !== false
}

export function resolveAverageNodeHeight(
  nodeHeights: ReadonlyMap<number, number>,
  fallback = DEFAULT_NODE_HEIGHT,
) {
  if (!nodeHeights.size)
    return fallback

  let total = 0
  for (const height of nodeHeights.values())
    total += height

  return Math.max(16, total / nodeHeights.size)
}

export function estimateHeightRange(
  start: number,
  end: number,
  nodeHeights: ReadonlyMap<number, number>,
  averageNodeHeight: number,
) {
  if (start >= end)
    return 0

  let total = 0
  for (let index = start; index < end; index += 1)
    total += nodeHeights.get(index) ?? averageNodeHeight
  return total
}

export function computeLiveRange(
  total: number,
  focusIndex: number,
  maxLiveNodes?: number,
  liveNodeBuffer?: number,
): LiveRange {
  if (!total)
    return { start: 0, end: 0 }

  const resolvedMaxLiveNodes = Math.max(1, Math.trunc(maxLiveNodes ?? 320))
  const resolvedBuffer = Math.max(0, Math.trunc(liveNodeBuffer ?? 60))
  const focus = Math.max(0, Math.min(Math.trunc(focusIndex), total - 1))

  let start = Math.max(0, focus - resolvedBuffer)
  let end = Math.min(total, focus + resolvedBuffer + 1)
  const size = end - start

  if (size > resolvedMaxLiveNodes) {
    const excess = size - resolvedMaxLiveNodes
    start += Math.ceil(excess / 2)
    end -= Math.floor(excess / 2)
  }
  else if (size < resolvedMaxLiveNodes) {
    const missing = resolvedMaxLiveNodes - size
    start = Math.max(0, start - Math.ceil(missing / 2))
    end = Math.min(total, end + Math.floor(missing / 2))
  }

  return {
    start: Math.max(0, Math.min(start, total)),
    end: Math.max(0, Math.min(Math.max(end, start), total)),
  }
}
