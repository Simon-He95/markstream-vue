import type {
  NodeRendererMode,
  NodeRendererProps,
} from './shared/node-helpers'

export type RendererModeDefaults = Pick<
  NodeRendererProps,
  | 'showTooltips'
  | 'fade'
  | 'batchRendering'
  | 'initialRenderBatchSize'
  | 'renderBatchSize'
  | 'renderBatchDelay'
  | 'renderBatchBudgetMs'
  | 'renderBatchIdleTimeoutMs'
  | 'deferNodesUntilVisible'
  | 'maxLiveNodes'
  | 'liveNodeBuffer'
  | 'nodeVirtual'
>

export const RENDERER_MODE_DEFAULTS: Record<NodeRendererMode, RendererModeDefaults> = {
  docs: {
    showTooltips: true,
    fade: true,
    batchRendering: true,
    initialRenderBatchSize: 40,
    renderBatchSize: 80,
    renderBatchDelay: 16,
    renderBatchBudgetMs: 6,
    renderBatchIdleTimeoutMs: 120,
    deferNodesUntilVisible: true,
    maxLiveNodes: 220,
    liveNodeBuffer: 60,
    nodeVirtual: 'auto',
  },
  chat: {
    showTooltips: false,
    fade: false,
    batchRendering: true,
    initialRenderBatchSize: 32,
    renderBatchSize: 48,
    renderBatchDelay: 6,
    renderBatchBudgetMs: 8,
    renderBatchIdleTimeoutMs: 60,
    deferNodesUntilVisible: true,
    maxLiveNodes: 0,
    liveNodeBuffer: 0,
    nodeVirtual: 'auto',
  },
  minimal: {
    showTooltips: false,
    fade: false,
    batchRendering: true,
    initialRenderBatchSize: 32,
    renderBatchSize: 48,
    renderBatchDelay: 6,
    renderBatchBudgetMs: 8,
    renderBatchIdleTimeoutMs: 60,
    deferNodesUntilVisible: true,
    maxLiveNodes: 0,
    liveNodeBuffer: 0,
    nodeVirtual: 'auto',
  },
}

export function normalizeRendererMode(value: unknown): NodeRendererMode {
  return value === 'chat' || value === 'minimal' || value === 'docs'
    ? value
    : 'docs'
}
