<script setup lang="ts">
import type { Brush, Drauu, DrawingMode } from 'drauu'
import type { TestLabFrameworkId, TestLabSampleId } from '../../../playground-shared/testLabFixtures'
import type { TestPageViewMode } from '../../../playground-shared/testPageState'
import type { SandboxFrameworkId, SandboxRenderSource } from '../../../playground-shared/versionSandbox'
import type { StreamSliceMode } from '../composables/createLocalTextStream'
import type { StreamPresetId } from '../composables/streamPresets'
import type { StreamTransportMode } from '../composables/useStreamSimulator'
import { Icon } from '@iconify/vue'
import { useDebounceFn, useLocalStorage, useResizeObserver } from '@vueuse/core'
import { createDrauu } from 'drauu'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveMarkdownTextareaPaste } from '../../../playground-shared/markdownPaste'
import { TEST_LAB_FRAMEWORKS, TEST_LAB_SAMPLES } from '../../../playground-shared/testLabFixtures'
import { buildTestPageHref, buildTestPageHrefAsync, decodeMarkdownHashAsync, resolveFrameworkTestHref, resolveTestPageViewMode, withTestPageViewMode } from '../../../playground-shared/testPageState'
import {
  buildTestSandboxHref,
  normalizeSandboxSource,
  resolveSandboxSelection,

} from '../../../playground-shared/versionSandbox'
import CodeBlockNode from '../../../src/components/CodeBlockNode'
import { getUseMonaco } from '../../../src/components/CodeBlockNode/monaco'
import MarkdownCodeBlockNode from '../../../src/components/MarkdownCodeBlockNode'
import { disableKatex, enableKatex, isKatexEnabled } from '../../../src/components/MathInlineNode/katex'
import { disableMermaid, enableMermaid, isMermaidEnabled } from '../../../src/components/MermaidBlockNode/mermaid'
import MarkdownRender from '../../../src/components/NodeRenderer'
import PreCodeNode from '../../../src/components/PreCodeNode'
import { setCustomComponents } from '../../../src/utils/nodeComponents'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import LabSelect from '../components/LabSelect.vue'
import ThinkingNode from '../components/ThinkingNode.vue'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from '../composables/streamPresets'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from '../composables/useStreamSimulator'
import { testSandboxFrameworks } from '../testSandboxConfig'
import 'katex/dist/katex.min.css'

type SampleId = TestLabSampleId
type FrameworkId = TestLabFrameworkId
type AnnotationTool = 'select' | 'pen' | 'arrow' | 'rect' | 'ellipse' | 'text'
type DrawAnnotationKind = 'pen' | 'arrow' | 'rect' | 'ellipse'
type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw'
type AnnotationAlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
interface TextAnnotation {
  id: string
  x: number
  y: number
  content: string
  color: string
  fontSize: number
}
interface AnnotationSnapshot {
  drawSvg: string
  texts: TextAnnotation[]
}
interface PersistedAnnotationCache {
  content: string
  snapshot: AnnotationSnapshot
}
interface LocalSharePayload {
  content: string
  annotations?: AnnotationSnapshot
}
interface AnnotationSelectionBox {
  x: number
  y: number
  width: number
  height: number
}
interface AnnotationSelectionTarget {
  kind: 'draw' | 'text'
  id: string
  shape?: DrawAnnotationKind
}
interface AnnotationArrowSelectionLine {
  x1: number
  y1: number
  x2: number
  y2: number
}
interface AnnotationTextTransformState {
  x: number
  y: number
  fontSize: number
}
interface AnnotationTextDraft {
  id?: string
  x: number
  y: number
  content: string
  color?: string
  fontSize?: number
}
type DrawAnnotationGeometry
  = | { kind: 'rect', x: number, y: number, width: number, height: number }
    | { kind: 'ellipse', cx: number, cy: number, rx: number, ry: number }
    | { kind: 'arrow', x1: number, y1: number, x2: number, y2: number }
interface AnnotationSelectionTransformState {
  target: AnnotationSelectionTarget
  targets: AnnotationSelectionTarget[]
  pointerId: number
  mode: 'move' | 'resize' | 'arrow-start' | 'arrow-end'
  startX: number
  startY: number
  originBox: AnnotationSelectionBox
  handle?: ResizeHandle
  drawGeometry?: DrawAnnotationGeometry
  drawStates?: Record<string, DrawAnnotationGeometry>
  textState?: AnnotationTextTransformState
  textStates?: Record<string, AnnotationTextTransformState>
  duplicateOnMove?: boolean
  moved: boolean
}

const CURRENT_FRAMEWORK: FrameworkId = 'vue3'
const GITHUB_REPO_URL = 'https://github.com/Simon-He95/markstream-vue'
const ANNOTATION_CACHE_STORAGE_KEY = 'vmr-test-annotation-cache:v1'
const ANNOTATION_TEXT_EDITOR_WIDTH = 220
const ANNOTATION_TEXT_PLACEMENT_SUPPRESS_MS = 320
const ANNOTATION_DUPLICATE_OFFSET = 24
const ANNOTATION_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'] as const
const ANNOTATION_STROKES = [
  { label: '细', value: 3 },
  { label: '中', value: 6 },
  { label: '粗', value: 10 },
] as const
const ANNOTATION_RESIZE_HANDLES = ['nw', 'ne', 'se', 'sw'] as const satisfies ReadonlyArray<ResizeHandle>
const ANNOTATION_TOOL_OPTIONS = [
  { id: 'select', label: 'Cursor' },
  { id: 'pen', label: '画笔' },
  { id: 'arrow', label: '箭头' },
  { id: 'rect', label: '矩形' },
  { id: 'ellipse', label: '椭圆' },
  { id: 'text', label: '文字' },
] as const satisfies ReadonlyArray<{ id: AnnotationTool, label: string }>
const ANNOTATION_ALIGN_OPTIONS = [
  { id: 'left', label: '左对齐', shortLabel: '左齐' },
  { id: 'hcenter', label: '水平居中', shortLabel: '横中' },
  { id: 'right', label: '右对齐', shortLabel: '右齐' },
  { id: 'top', label: '顶对齐', shortLabel: '顶齐' },
  { id: 'vcenter', label: '垂直居中', shortLabel: '竖中' },
  { id: 'bottom', label: '底对齐', shortLabel: '底齐' },
] as const satisfies ReadonlyArray<{ id: AnnotationAlignMode, label: string, shortLabel: string }>
const ANNOTATION_SHORTCUT_HINT = 'Shift+A 标注 / V Cursor'
const STREAM_TRANSPORT_OPTIONS = [
  { value: 'readable-stream', label: 'ReadableStream' },
  { value: 'scheduler', label: 'Scheduler' },
] as const satisfies ReadonlyArray<{ value: StreamTransportMode, label: string }>
const STREAM_SLICE_OPTIONS = [
  { value: 'pure-random', label: 'Pure Random' },
  { value: 'boundary-aware', label: 'Boundary Aware' },
] as const satisfies ReadonlyArray<{ value: StreamSliceMode, label: string }>
const RENDER_MODE_OPTIONS = [
  { value: 'monaco', label: 'Monaco' },
  { value: 'markdown', label: 'MarkdownCodeBlock' },
  { value: 'pre', label: 'PreCodeNode' },
] as const satisfies ReadonlyArray<{ value: 'monaco' | 'markdown' | 'pre', label: string }>

const frameworkCards = TEST_LAB_FRAMEWORKS
const sampleCards = TEST_LAB_SAMPLES
const sandboxFrameworkOptions = testSandboxFrameworks.map(framework => ({
  value: framework.id,
  label: framework.label,
})) as ReadonlyArray<{ value: SandboxFrameworkId, label: string }>

const diffHideUnchangedRegions = {
  enabled: true,
  contextLineCount: 2,
  minimumLineCount: 4,
  revealLineCount: 0,
} as const

function resolveInitialDarkMode() {
  return typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : false
}

const testPageMonacoOptions = {
  renderSideBySide: false,
  useInlineViewWhenSpaceIsLimited: true,
  maxComputationTime: 0,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  diffAlgorithm: 'legacy',
  diffHideUnchangedRegions,
  hideUnchangedRegions: diffHideUnchangedRegions,
} as const

const selectedSampleId = useLocalStorage<SampleId>('vmr-test-sample', 'baseline')
const input = ref<string>(sampleCards[0].content)
const isBenchmarkMode = typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('benchmark') === '1'
const streamChunkSizeMin = useLocalStorage<number>('vmr-test-stream-chunk-size-min', 2)
const streamChunkSizeMax = useLocalStorage<number>('vmr-test-stream-chunk-size-max', 7)
const streamChunkDelayMin = useLocalStorage<number>('vmr-test-stream-delay-min', 14)
const streamChunkDelayMax = useLocalStorage<number>('vmr-test-stream-delay-max', 34)
const streamBurstiness = useLocalStorage<number>('vmr-test-stream-burstiness', 35)
const streamTransportMode = useLocalStorage<StreamTransportMode>('vmr-test-stream-transport-mode', 'readable-stream')
const streamSliceMode = useLocalStorage<StreamSliceMode>('vmr-test-stream-slice-mode', 'pure-random')
const streamDebug = useLocalStorage<boolean>('vmr-test-stream-debug', false)
const isDark = useLocalStorage<boolean>('vmr-test-dark', resolveInitialDarkMode())

const renderMode = useLocalStorage<'monaco' | 'pre' | 'markdown'>('vmr-test-render-mode', 'monaco')
const codeBlockStream = useLocalStorage<boolean>('vmr-test-code-stream', true)
const viewportPriority = useLocalStorage<boolean>('vmr-test-viewport-priority', true)
const batchRendering = useLocalStorage<boolean>('vmr-test-batch-rendering', true)
const typewriter = useLocalStorage<boolean>('vmr-test-typewriter', true)
const debugParse = useLocalStorage<boolean>('vmr-test-debug-parse', false)
const mathEnabled = useLocalStorage<boolean>('vmr-test-math-enabled', isKatexEnabled())
const mermaidEnabled = useLocalStorage<boolean>('vmr-test-mermaid-enabled', isMermaidEnabled())
const testPageCustomHtmlTags = ['think', 'thinking'] as const

getUseMonaco()
setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())

const shareUrl = ref<string>('')
const notice = ref<string>('')
const noticeType = ref<'success' | 'error' | 'info'>('success')
const isWorking = ref(false)
const copiedShareTarget = ref<TestPageViewMode | null>(null)
const issueUrl = ref<string>('')
const editorTextareaRef = ref<HTMLTextAreaElement | null>(null)
const previewCardRef = ref<HTMLElement | null>(null)
const previewStageRef = ref<HTMLElement | null>(null)
const benchmarkRenderPreview = ref(true)
const annotationDrawSvgRef = ref<SVGSVGElement | null>(null)
const annotationTextInputRef = ref<HTMLTextAreaElement | null>(null)
const streamSettingsDialogRef = ref<HTMLDialogElement | null>(null)
const isPreviewFullscreen = ref(false)
const testPageViewMode = ref<TestPageViewMode>('lab')
const MAX_URL_LEN = 10000
const LOCAL_SHARE_QUERY_KEY = 'share'
const LOCAL_SHARE_STORAGE_PREFIX = 'vmr-test-share:'
const annotationEnabled = ref(false)
const annotationTool = ref<AnnotationTool>('pen')
const annotationColor = ref<string>(ANNOTATION_COLORS[0])
const annotationStrokeWidth = ref<number>(ANNOTATION_STROKES[1].value)
const annotationStageWidth = ref(0)
const annotationStageHeight = ref(0)
const annotationTextItems = ref<TextAnnotation[]>([])
const annotationTextDraft = ref<AnnotationTextDraft | null>(null)
const annotationHistory = ref<AnnotationSnapshot[]>([{ drawSvg: '', texts: [] }])
const annotationHistoryIndex = ref(0)
const isApplyingAnnotationHistory = ref(false)
const annotationSelectedTargets = ref<AnnotationSelectionTarget[]>([])
const annotationSelection = ref<AnnotationSelectionTarget | null>(null)
const annotationSelectionBox = ref<AnnotationSelectionBox | null>(null)
const annotationArrowSelectionLine = ref<AnnotationArrowSelectionLine | null>(null)
const annotationSelectionTransform = ref<AnnotationSelectionTransformState | null>(null)
const annotationIgnoreTextPlacementUntil = ref(0)
let initialAnnotationSnapshot: AnnotationSnapshot | null = null
let preserveAnnotationsOnNextInputChange = false

const activeSample = computed(() => sampleCards.find(sample => sample.id === selectedSampleId.value) ?? sampleCards[0])
const streamPresetOptions = computed(() => [
  ...STREAM_PRESETS.map(preset => ({
    value: preset.id,
    label: preset.label,
  })),
  {
    value: CUSTOM_STREAM_PRESET_ID,
    label: 'Custom',
  },
])
const normalizedChunkSizeRange = computed(() => normalizeStreamRange(
  Number(streamChunkSizeMin.value),
  Number(streamChunkSizeMax.value),
  1,
  80,
  2,
  7,
))
const normalizedChunkDelayRange = computed(() => normalizeStreamRange(
  Number(streamChunkDelayMin.value),
  Number(streamChunkDelayMax.value),
  8,
  600,
  14,
  34,
))
const {
  content: streamContent,
  chunks: streamChunks,
  isPaused,
  isStreaming,
  lastChunkSize,
  lastDelayMs,
  reset: resetStreamState,
  start: startStreaming,
  stop: stopStreaming,
  togglePause: toggleStreamingPause,
} = useStreamSimulator({
  source: input,
  chunkSizeMin: computed(() => normalizedChunkSizeRange.value.min),
  chunkSizeMax: computed(() => normalizedChunkSizeRange.value.max),
  chunkDelayMin: computed(() => normalizedChunkDelayRange.value.min),
  chunkDelayMax: computed(() => normalizedChunkDelayRange.value.max),
  burstiness: computed(() => streamBurstiness.value / 100),
  sliceMode: streamSliceMode,
  transportMode: streamTransportMode,
})
const previewContent = computed(() => (isStreaming.value ? streamContent.value : input.value))
const streamProgress = computed(() => {
  if (!input.value.length)
    return 0
  return Math.min(100, Math.round((previewContent.value.length / input.value.length) * 100))
})
const activeStreamPreset = computed(() => findMatchingStreamPreset({
  chunkDelayMin: normalizedChunkDelayRange.value.min,
  chunkDelayMax: normalizedChunkDelayRange.value.max,
  chunkSizeMin: normalizedChunkSizeRange.value.min,
  chunkSizeMax: normalizedChunkSizeRange.value.max,
  burstiness: streamBurstiness.value,
}))
const selectedStreamPresetId = computed<StreamPresetId>({
  get: () => activeStreamPreset.value?.id ?? CUSTOM_STREAM_PRESET_ID,
  set: (presetId) => {
    if (presetId === CUSTOM_STREAM_PRESET_ID)
      return

    const preset = getStreamPreset(presetId)
    if (!preset)
      return

    streamChunkDelayMin.value = preset.chunkDelayMin
    streamChunkDelayMax.value = preset.chunkDelayMax
    streamChunkSizeMin.value = preset.chunkSizeMin
    streamChunkSizeMax.value = preset.chunkSizeMax
    streamBurstiness.value = preset.burstiness
  },
})
const streamPresetDescription = computed(() => activeStreamPreset.value?.descriptionZh ?? '当前参数已偏离预设，属于自定义 min/max 流式画像。')
const streamPresetLabel = computed(() => activeStreamPreset.value?.label ?? 'Custom')
const streamChunkRangeLabel = computed(() => `${normalizedChunkSizeRange.value.min}-${normalizedChunkSizeRange.value.max} 字`)
const streamDelayRangeLabel = computed(() => `${normalizedChunkDelayRange.value.min}-${normalizedChunkDelayRange.value.max}ms`)
const streamModeLabel = computed(() => streamTransportMode.value === 'readable-stream' ? 'ReadableStream' : 'Scheduler')
const renderModeLabel = computed(() => {
  if (renderMode.value === 'markdown')
    return 'MarkdownCodeBlock'
  if (renderMode.value === 'pre')
    return 'PreCodeNode'
  return 'Monaco'
})
const previewDiagramMaxHeight = computed(() => isPreviewFullscreen.value ? 'none' : '500px')
const previewD2MaxHeight = computed(() => 'none')
const charCount = computed(() => input.value.length)
const lineCount = computed(() => (input.value ? input.value.split('\n').length : 0))
const isSharePreviewMode = computed(() => testPageViewMode.value === 'preview')
const previewIsImmersive = computed(() => isPreviewFullscreen.value || isSharePreviewMode.value)
const previewViewportPriority = computed(() => previewIsImmersive.value ? false : viewportPriority.value)
const previewBatchRendering = computed(() => previewIsImmersive.value ? true : batchRendering.value)
const previewMaxLiveNodes = computed(() => previewIsImmersive.value ? 0 : 320)
const previewLiveNodeBuffer = computed(() => previewIsImmersive.value ? 180 : 60)
const previewInitialRenderBatchSize = computed(() => previewIsImmersive.value ? 240 : 40)
const previewRenderBatchSize = computed(() => previewIsImmersive.value ? 180 : 80)
const previewRenderBatchDelay = computed(() => previewIsImmersive.value ? 0 : 16)
const labShareUsesLocalStorage = ref(false)
const previewShareUsesLocalStorage = ref(false)
let shareModeHintRequestId = 0
const previewShareButtonLabel = computed(() => {
  if (isSharePreviewMode.value)
    return '复制当前分享链接'
  return previewShareUsesLocalStorage.value ? '复制本地预览链接' : '分享预览'
})
const labShareButtonLabel = computed(() => labShareUsesLocalStorage.value ? '复制本地实验页链接' : '复制实验页链接')
const showImmersivePreviewControls = computed(() => !isBenchmarkMode && (isSharePreviewMode.value || isPreviewFullscreen.value))
const immersiveBackLabel = computed(() => isSharePreviewMode.value ? '打开 Test Page' : '返回编辑')
const showPreviewAnnotations = computed(() => !isBenchmarkMode && (isSharePreviewMode.value || isPreviewFullscreen.value))
const showAnnotationToolbar = computed(() => showImmersivePreviewControls.value && annotationEnabled.value)
const annotationCanUndo = computed(() => annotationHistoryIndex.value > 0)
const annotationCanRedo = computed(() => annotationHistoryIndex.value < annotationHistory.value.length - 1)
const annotationFontSize = computed(() => annotationStrokeWidth.value * 4 + 12)
const annotationTextOutline = computed(() => isDark.value ? 'rgba(2, 6, 23, 0.76)' : 'rgba(255, 255, 255, 0.92)')
const annotationHasDrawings = computed(() => {
  const snapshot = annotationHistory.value[annotationHistoryIndex.value]
  return Boolean(snapshot?.drawSvg?.trim())
})
const annotationHasItems = computed(() => annotationHasDrawings.value || annotationTextItems.value.length > 0)
const annotationOverlayVisible = computed(() => showPreviewAnnotations.value)
const annotationDrawInteractive = computed(() =>
  annotationEnabled.value
  && showPreviewAnnotations.value
  && annotationTool.value !== 'text'
  && annotationTool.value !== 'select',
)
const annotationDrawSelectable = computed(() => annotationEnabled.value && showPreviewAnnotations.value && annotationTool.value === 'select')
const annotationTextInteractive = computed(() => annotationEnabled.value && showPreviewAnnotations.value && annotationTool.value === 'text')
const annotationTextLayerInteractive = computed(() => annotationEnabled.value && showPreviewAnnotations.value && annotationTool.value === 'select')
const annotationSelectionVisible = computed(() => Boolean(
  annotationEnabled.value
  && showPreviewAnnotations.value
  && annotationTool.value === 'select'
  && annotationSelectedTargets.value.length
  && annotationSelectionBox.value,
))
const annotationSingleArrowSelection = computed(() =>
  annotationSelectedTargets.value.length === 1
  && annotationSelection.value?.kind === 'draw'
  && annotationSelection.value.shape === 'arrow',
)
const annotationSelectionCanResize = computed(() => {
  return annotationSelectedTargets.value.length > 0 && !annotationSingleArrowSelection.value
})
const annotationArrowSelectionStyle = computed(() => {
  const arrow = annotationArrowSelectionLine.value
  if (!arrow)
    return undefined

  const dx = arrow.x2 - arrow.x1
  const dy = arrow.y2 - arrow.y1
  const length = Math.max(1, Math.sqrt(dx ** 2 + dy ** 2))
  const angle = Math.atan2(dy, dx) * 180 / Math.PI

  return {
    left: `${arrow.x1}px`,
    top: `${arrow.y1}px`,
    width: `${length}px`,
    transform: `rotate(${angle}deg)`,
  }
})
const annotationSelectionActionsVisible = computed(() =>
  annotationSelectionVisible.value && annotationSelectedTargets.value.length > 0,
)
const annotationCanAlign = computed(() =>
  annotationSelectedTargets.value.length > 1 && Boolean(annotationSelectionBox.value),
)
const previewMermaidProps = computed(() => ({ maxHeight: previewDiagramMaxHeight.value }))
const previewD2Props = computed(() => ({ maxHeight: previewD2MaxHeight.value }))
const previewInfographicProps = computed(() => ({ maxHeight: previewDiagramMaxHeight.value }))
const previewParseOptions = computed(() => {
  if (showPreviewAnnotations.value || !debugParse.value)
    return undefined

  return { debug: true }
})

const sandboxFrameworkId = useLocalStorage<SandboxFrameworkId>('vmr-test-sandbox-framework', 'vue3')
const sandboxSource = useLocalStorage<SandboxRenderSource>('vmr-test-sandbox-source', 'workspace')
const sandboxVersion = useLocalStorage<string>('vmr-test-sandbox-version', testSandboxFrameworks[0].defaultVersion)
const sandboxAutoSync = useLocalStorage<boolean>('vmr-test-sandbox-auto-sync', false)
const sandboxSnapshot = ref<string>(sampleCards[0].content)
const sandboxFrameKey = ref(0)

const activeSandbox = computed(() => resolveSandboxSelection(testSandboxFrameworks, {
  frameworkId: sandboxFrameworkId.value,
  source: sandboxSource.value,
  version: sandboxVersion.value,
}))
const activeSandboxFramework = computed(() => activeSandbox.value.framework)
const sandboxHref = computed(() => buildTestSandboxHref(activeSandbox.value, sandboxSnapshot.value))
const sandboxDirty = computed(() => sandboxSnapshot.value !== input.value)
const sandboxQuickVersions = computed(() => Array.from(new Set([
  activeSandboxFramework.value.defaultVersion,
  'latest',
])))
const sandboxVersionPlaceholder = computed(() => `例如 ${activeSandboxFramework.value.defaultVersion} 或 latest`)
const sandboxPackageLabel = computed(() => {
  if (activeSandbox.value.source === 'workspace')
    return `${activeSandboxFramework.value.packageName} (workspace)`
  return `${activeSandboxFramework.value.packageName}@${activeSandbox.value.version}`
})
const sandboxRuntimeLabel = computed(() => {
  if (activeSandbox.value.source === 'workspace')
    return `${activeSandboxFramework.value.label} local runtime`
  return `${activeSandboxFramework.value.label} runtime ${activeSandboxFramework.value.runtimeVersion}`
})
const sandboxStatusLabel = computed(() => {
  if (sandboxDirty.value)
    return '待同步'
  return '已同步'
})

let annotationDrauu: Drauu | null = null

function syncSandbox() {
  sandboxSnapshot.value = input.value
  sandboxFrameKey.value += 1
}

const syncSandboxDebounced = useDebounceFn(() => {
  syncSandbox()
}, 420)

function chooseSandboxSource(source: SandboxRenderSource) {
  sandboxSource.value = normalizeSandboxSource(activeSandboxFramework.value, source)
}

function chooseSandboxVersion(version: string) {
  sandboxVersion.value = version
}

function openSandboxInNewTab() {
  try {
    window.open(sandboxHref.value, '_blank', 'noopener')
  }
  catch {
    window.location.href = sandboxHref.value
  }
}

function basePageUrl() {
  const url = new URL(window.location.href)
  url.hash = ''
  url.searchParams.delete(LOCAL_SHARE_QUERY_KEY)
  return url.toString()
}

function currentBasePageUrl(viewMode = testPageViewMode.value) {
  return withTestPageViewMode(basePageUrl(), viewMode)
}

function shareStorageKey(shareId: string) {
  return `${LOCAL_SHARE_STORAGE_PREFIX}${shareId}`
}

function currentShareId() {
  const url = new URL(window.location.href)
  return url.searchParams.get(LOCAL_SHARE_QUERY_KEY)
}

function buildLocalShareHref(shareId: string, viewMode: TestPageViewMode = 'lab') {
  const url = new URL(withTestPageViewMode(basePageUrl(), viewMode))
  url.searchParams.set(LOCAL_SHARE_QUERY_KEY, shareId)
  url.hash = ''
  return url.toString()
}

function normalizeAnnotationSnapshot(snapshot: AnnotationSnapshot | null | undefined) {
  if (!snapshot)
    return null

  return {
    drawSvg: typeof snapshot.drawSvg === 'string' ? snapshot.drawSvg : '',
    texts: Array.isArray(snapshot.texts)
      ? snapshot.texts
          .filter(item => item && typeof item.id === 'string' && typeof item.content === 'string')
          .map(item => ({
            id: item.id,
            x: Number(item.x ?? 0),
            y: Number(item.y ?? 0),
            content: item.content,
            color: typeof item.color === 'string' ? item.color : ANNOTATION_COLORS[0],
            fontSize: Number(item.fontSize ?? annotationFontSize.value),
          }))
      : [],
  } satisfies AnnotationSnapshot
}

function parseLocalSharePayload(raw: string): LocalSharePayload {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.content === 'string') {
      const payload = parsed as LocalSharePayload
      return {
        content: payload.content,
        annotations: normalizeAnnotationSnapshot(payload.annotations) ?? undefined,
      }
    }
  }
  catch {
  }

  return { content: raw }
}

function persistLocalShare(markdown: string, annotations?: AnnotationSnapshot | null) {
  const shareId = currentShareId() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  const payload = JSON.stringify({
    content: markdown,
    annotations: normalizeAnnotationSnapshot(annotations) ?? undefined,
  } satisfies LocalSharePayload)
  window.localStorage.setItem(shareStorageKey(shareId), payload)
  return shareId
}

function buildIssueUrl(text: string) {
  const base = 'https://github.com/Simon-He95/markstream-vue/issues/new?template=bug_report.yml'
  const body = `**Reproduction input**:\n\nPlease find the reproduction input below:\n\n\`\`\`markdown\n${text}\n\`\`\``
  return `${base}&body=${encodeURIComponent(body)}`
}

function focusEditorSoon() {
  void nextTick(() => {
    editorTextareaRef.value?.focus()
  })
}

async function resolveShareUsesLocalStorage(markdown: string, viewMode: TestPageViewMode) {
  if (buildTestPageHref('/test', markdown, viewMode).length <= MAX_URL_LEN)
    return false

  return (await buildTestPageHrefAsync('/test', markdown, viewMode)).length > MAX_URL_LEN
}

async function refreshShareModeHints() {
  const requestId = ++shareModeHintRequestId
  const markdown = input.value
  const [labUsesStorage, previewUsesStorage] = await Promise.all([
    resolveShareUsesLocalStorage(markdown, 'lab'),
    resolveShareUsesLocalStorage(markdown, 'preview'),
  ])

  if (requestId !== shareModeHintRequestId || markdown !== input.value)
    return

  labShareUsesLocalStorage.value = labUsesStorage
  previewShareUsesLocalStorage.value = previewUsesStorage
}

const refreshShareModeHintsDebounced = useDebounceFn(() => {
  void refreshShareModeHints()
}, 240)

async function generateShareLink(viewMode: TestPageViewMode = 'lab', options: { silent?: boolean } = {}) {
  const full = await buildTestPageHrefAsync(basePageUrl(), input.value, viewMode)
  issueUrl.value = buildIssueUrl(input.value)
  if (full.length > MAX_URL_LEN) {
    const localHref = buildLocalShareHref(
      persistLocalShare(input.value, annotationHasItems.value ? getAnnotationSnapshot() : null),
      viewMode,
    )
    shareUrl.value = localHref
    if (viewMode === 'lab')
      labShareUsesLocalStorage.value = true
    else
      previewShareUsesLocalStorage.value = true
    if (!options.silent)
      showToast('当前内容太长，已切换为本地分享链接；只能在你当前浏览器打开，分享给别人不会生效。', 'info', 4200)
    return localHref
  }

  shareUrl.value = full
  if (viewMode === 'lab')
    labShareUsesLocalStorage.value = false
  else
    previewShareUsesLocalStorage.value = false
  return full
}

async function copyShareLink(target: string) {
  try {
    await navigator.clipboard.writeText(target)
    return true
  }
  catch (error) {
    console.warn('copy failed', error)
    return false
  }
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 2200) {
  notice.value = message
  noticeType.value = type
  if (duration > 0)
    window.setTimeout(() => (notice.value = ''), duration)
}

async function generateAndCopy() {
  isWorking.value = true
  copiedShareTarget.value = null
  const target = await generateShareLink('lab')

  if (!target) {
    isWorking.value = false
    return
  }

  window.history.replaceState(undefined, '', target)
  const copied = await copyShareLink(target)
  isWorking.value = false

  if (copied) {
    copiedShareTarget.value = 'lab'
    showToast(labShareUsesLocalStorage.value ? '本地实验页链接已复制；仅当前浏览器可打开，分享给别人不会生效。' : '分享链接已复制。', labShareUsesLocalStorage.value ? 'info' : 'success', labShareUsesLocalStorage.value ? 3200 : 1800)
    window.setTimeout(() => (copiedShareTarget.value = null), 1800)
  }
  else {
    showToast('复制失败，请手动复制地址栏链接。', 'error', 3000)
  }
}

async function generateAndCopyPreview() {
  isWorking.value = true
  copiedShareTarget.value = null
  const target = await generateShareLink('preview')

  if (!target) {
    isWorking.value = false
    return
  }

  if (isSharePreviewMode.value)
    window.history.replaceState(undefined, '', target)

  const copied = await copyShareLink(target)
  isWorking.value = false

  if (copied) {
    copiedShareTarget.value = 'preview'
    showToast(previewShareUsesLocalStorage.value ? '本地预览链接已复制；只能在你当前浏览器查看，分享给别人不会生效。' : '预览分享链接已复制。', previewShareUsesLocalStorage.value ? 'info' : 'success', previewShareUsesLocalStorage.value ? 3200 : 1800)
    window.setTimeout(() => (copiedShareTarget.value = null), 1800)
  }
  else {
    showToast('复制失败，请手动复制分享链接。', 'error', 3000)
  }
}

async function copyRawInput() {
  const target = buildIssueUrl(input.value)
  issueUrl.value = target

  try {
    await navigator.clipboard.writeText(target)
    showToast('Issue 链接已复制。', 'success', 2200)
  }
  catch (error) {
    console.warn('copy failed', error)
    showToast('复制失败，请手动打开 Issue。', 'error', 3000)
  }
}

function openIssueInNewTab() {
  if (!issueUrl.value)
    issueUrl.value = buildIssueUrl(input.value)

  try {
    window.open(issueUrl.value, '_blank')
  }
  catch {
    window.location.href = issueUrl.value
  }
}

function syncPreviewFullscreenState() {
  isPreviewFullscreen.value = document.fullscreenElement === previewCardRef.value
}

async function togglePreviewFullscreen() {
  const previewCard = previewCardRef.value
  if (!previewCard)
    return

  if (document.fullscreenElement === previewCard) {
    if (!document.exitFullscreen)
      return

    await document.exitFullscreen()
    return
  }

  if (!previewCard.requestFullscreen)
    return

  await previewCard.requestFullscreen()
}

function cloneTextAnnotations(texts = annotationTextItems.value): TextAnnotation[] {
  return texts.map(text => ({ ...text }))
}

function createAnnotationId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function annotationSelectionKey(target: AnnotationSelectionTarget) {
  return `${target.kind}:${target.id}`
}

function isSameAnnotationTarget(a: AnnotationSelectionTarget | null | undefined, b: AnnotationSelectionTarget | null | undefined) {
  if (!a || !b)
    return false

  return a.kind === b.kind && a.id === b.id
}

function cloneSelectionTargets(targets = annotationSelectedTargets.value) {
  return targets.map(target => ({ ...target }))
}

function areSameAnnotationTargetList(a: AnnotationSelectionTarget[], b: AnnotationSelectionTarget[]) {
  return a.length === b.length && a.every((target, index) => isSameAnnotationTarget(target, b[index]))
}

function isAnnotationTargetSelected(target: AnnotationSelectionTarget) {
  return annotationSelectedTargets.value.some(item => isSameAnnotationTarget(item, target))
}

function setAnnotationSelections(targets: AnnotationSelectionTarget[], primaryTarget?: AnnotationSelectionTarget | null) {
  const nextTargets = cloneSelectionTargets(targets)
  const nextPrimary = primaryTarget
    ? { ...primaryTarget }
    : nextTargets.at(-1) ?? null

  if (!areSameAnnotationTargetList(annotationSelectedTargets.value, nextTargets))
    annotationSelectedTargets.value = nextTargets

  if (!isSameAnnotationTarget(annotationSelection.value, nextPrimary))
    annotationSelection.value = nextPrimary
}

function isMultiSelectionEvent(event: PointerEvent | KeyboardEvent) {
  return event.shiftKey || event.metaKey || event.ctrlKey
}

function getStagePointerPosition(event: PointerEvent) {
  const stage = previewStageRef.value
  if (!stage)
    return null

  const rect = stage.getBoundingClientRect()
  return clampPointToStage(event.clientX - rect.left, event.clientY - rect.top)
}

function getAnnotationDrawNodes() {
  const drawSvg = annotationDrawSvgRef.value
  if (!drawSvg)
    return [] as SVGElement[]

  return Array.from(drawSvg.children).filter((node): node is SVGElement => node instanceof SVGElement)
}

function inferDrawAnnotationKind(node: SVGElement): DrawAnnotationKind {
  const cachedKind = node.dataset.annotationKind as DrawAnnotationKind | undefined
  if (cachedKind)
    return cachedKind

  const tag = node.tagName.toLowerCase()
  if (tag === 'rect')
    return 'rect'
  if (tag === 'ellipse')
    return 'ellipse'
  if (tag === 'line')
    return 'arrow'
  if (tag === 'g' && node.querySelector('line'))
    return 'arrow'
  return 'pen'
}

function isSelectableDrawAnnotationKind(kind: DrawAnnotationKind) {
  return kind !== 'pen'
}

function applyDrawNodeMetadata(node: SVGElement, kind?: DrawAnnotationKind) {
  node.dataset.annotationId ||= createAnnotationId()
  node.dataset.annotationKind = kind ?? inferDrawAnnotationKind(node)
}

function syncAnnotationDrawNodeIds() {
  getAnnotationDrawNodes().forEach((node) => {
    applyDrawNodeMetadata(node)
  })
}

function getAnnotationDrawNodeById(id: string) {
  return getAnnotationDrawNodes().find(node => node.dataset.annotationId === id) ?? null
}

function getAnnotationTextById(id: string) {
  return annotationTextItems.value.find(text => text.id === id) ?? null
}

function getAnnotationTextElementById(id: string) {
  return previewStageRef.value?.querySelector<SVGGraphicsElement>(`.preview-annotation-text-item[data-annotation-id="${id}"]`) ?? null
}

function getSvgElementBox(element: SVGGraphicsElement): AnnotationSelectionBox | null {
  try {
    const box = element.getBBox()
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    }
  }
  catch {
    return null
  }
}

function parseSvgNumber(element: Element, name: string) {
  return Number(element.getAttribute(name) ?? 0)
}

function getArrowLineElement(node: SVGElement) {
  if (node.tagName.toLowerCase() === 'line')
    return node as SVGLineElement

  return node.querySelector('line')
}

function getDrawAnnotationGeometry(target: AnnotationSelectionTarget) {
  if (target.kind !== 'draw' || !target.shape)
    return null

  const node = getAnnotationDrawNodeById(target.id)
  if (!node)
    return null

  if (target.shape === 'rect') {
    return {
      kind: 'rect',
      x: parseSvgNumber(node, 'x'),
      y: parseSvgNumber(node, 'y'),
      width: parseSvgNumber(node, 'width'),
      height: parseSvgNumber(node, 'height'),
    } as const
  }

  if (target.shape === 'ellipse') {
    return {
      kind: 'ellipse',
      cx: parseSvgNumber(node, 'cx'),
      cy: parseSvgNumber(node, 'cy'),
      rx: parseSvgNumber(node, 'rx'),
      ry: parseSvgNumber(node, 'ry'),
    } as const
  }

  if (target.shape === 'arrow') {
    const line = getArrowLineElement(node)
    if (!line)
      return null

    return {
      kind: 'arrow',
      x1: parseSvgNumber(line, 'x1'),
      y1: parseSvgNumber(line, 'y1'),
      x2: parseSvgNumber(line, 'x2'),
      y2: parseSvgNumber(line, 'y2'),
    } as const
  }

  return null
}

function applyDrawAnnotationGeometry(target: AnnotationSelectionTarget, geometry: DrawAnnotationGeometry) {
  if (target.kind !== 'draw')
    return false

  const node = getAnnotationDrawNodeById(target.id)
  if (!node)
    return false

  return applyDrawGeometryToNode(node, geometry)
}

function applyDrawGeometryToNode(node: SVGElement, geometry: DrawAnnotationGeometry) {
  if (geometry.kind === 'rect') {
    node.setAttribute('x', geometry.x.toFixed(2))
    node.setAttribute('y', geometry.y.toFixed(2))
    node.setAttribute('width', geometry.width.toFixed(2))
    node.setAttribute('height', geometry.height.toFixed(2))
    return true
  }

  if (geometry.kind === 'ellipse') {
    node.setAttribute('cx', geometry.cx.toFixed(2))
    node.setAttribute('cy', geometry.cy.toFixed(2))
    node.setAttribute('rx', geometry.rx.toFixed(2))
    node.setAttribute('ry', geometry.ry.toFixed(2))
    return true
  }

  const line = getArrowLineElement(node)
  if (!line)
    return false

  line.setAttribute('x1', geometry.x1.toFixed(2))
  line.setAttribute('y1', geometry.y1.toFixed(2))
  line.setAttribute('x2', geometry.x2.toFixed(2))
  line.setAttribute('y2', geometry.y2.toFixed(2))
  return true
}

function offsetDrawGeometry(geometry: DrawAnnotationGeometry, dx: number, dy: number): DrawAnnotationGeometry {
  if (geometry.kind === 'rect')
    return { ...geometry, x: geometry.x + dx, y: geometry.y + dy }
  if (geometry.kind === 'ellipse')
    return { ...geometry, cx: geometry.cx + dx, cy: geometry.cy + dy }
  return {
    ...geometry,
    x1: geometry.x1 + dx,
    y1: geometry.y1 + dy,
    x2: geometry.x2 + dx,
    y2: geometry.y2 + dy,
  }
}

function getGeometryBox(geometry: DrawAnnotationGeometry) {
  if (geometry.kind === 'rect')
    return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }
  if (geometry.kind === 'ellipse')
    return { x: geometry.cx - geometry.rx, y: geometry.cy - geometry.ry, width: geometry.rx * 2, height: geometry.ry * 2 }
  return boxFromArrowGeometry(geometry)
}

function transformDrawGeometryBySelectionBox(geometry: DrawAnnotationGeometry, originBox: AnnotationSelectionBox, nextBox: AnnotationSelectionBox) {
  const scaleX = nextBox.width / Math.max(originBox.width, 1)
  const scaleY = nextBox.height / Math.max(originBox.height, 1)
  const geometryBox = getGeometryBox(geometry)
  const nextGeometryBox = {
    x: nextBox.x + (geometryBox.x - originBox.x) * scaleX,
    y: nextBox.y + (geometryBox.y - originBox.y) * scaleY,
    width: geometryBox.width * scaleX,
    height: geometryBox.height * scaleY,
  }

  if (geometry.kind === 'rect')
    return { kind: 'rect', ...nextGeometryBox } as const

  if (geometry.kind === 'ellipse') {
    return {
      kind: 'ellipse',
      cx: nextGeometryBox.x + nextGeometryBox.width / 2,
      cy: nextGeometryBox.y + nextGeometryBox.height / 2,
      rx: nextGeometryBox.width / 2,
      ry: nextGeometryBox.height / 2,
    } as const
  }

  return {
    kind: 'arrow',
    x1: nextBox.x + (geometry.x1 - originBox.x) * scaleX,
    y1: nextBox.y + (geometry.y1 - originBox.y) * scaleY,
    x2: nextBox.x + (geometry.x2 - originBox.x) * scaleX,
    y2: nextBox.y + (geometry.y2 - originBox.y) * scaleY,
  } as const
}

function clampPointToStage(x: number, y: number) {
  return {
    x: Math.min(Math.max(0, x), Math.max(0, annotationStageWidth.value)),
    y: Math.min(Math.max(0, y), Math.max(0, annotationStageHeight.value)),
  }
}

function clampSelectionBoxPosition(box: AnnotationSelectionBox) {
  return {
    ...box,
    x: Math.min(Math.max(0, box.x), Math.max(0, annotationStageWidth.value - box.width)),
    y: Math.min(Math.max(0, box.y), Math.max(0, annotationStageHeight.value - box.height)),
  }
}

function getResizedSelectionBox(originBox: AnnotationSelectionBox, handle: ResizeHandle, dx: number, dy: number) {
  const minWidth = 24
  const minHeight = 24
  let left = originBox.x
  let right = originBox.x + originBox.width
  let top = originBox.y
  let bottom = originBox.y + originBox.height

  if (handle.endsWith('w'))
    left = Math.min(Math.max(0, originBox.x + dx), right - minWidth)
  else
    right = Math.max(Math.min(annotationStageWidth.value, right + dx), left + minWidth)

  if (handle.startsWith('n'))
    top = Math.min(Math.max(0, originBox.y + dy), bottom - minHeight)
  else
    bottom = Math.max(Math.min(annotationStageHeight.value, bottom + dy), top + minHeight)

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function boxFromArrowGeometry(geometry: Extract<DrawAnnotationGeometry, { kind: 'arrow' }>): AnnotationSelectionBox {
  return {
    x: Math.min(geometry.x1, geometry.x2),
    y: Math.min(geometry.y1, geometry.y2),
    width: Math.abs(geometry.x2 - geometry.x1),
    height: Math.abs(geometry.y2 - geometry.y1),
  }
}

function mergeSelectionBoxes(boxes: AnnotationSelectionBox[]) {
  if (!boxes.length)
    return null

  const left = Math.min(...boxes.map(box => box.x))
  const top = Math.min(...boxes.map(box => box.y))
  const right = Math.max(...boxes.map(box => box.x + box.width))
  const bottom = Math.max(...boxes.map(box => box.y + box.height))

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function getAnnotationTargetBox(target: AnnotationSelectionTarget) {
  if (target.kind === 'draw') {
    if (target.shape === 'arrow') {
      const geometry = getDrawAnnotationGeometry(target)
      return geometry?.kind === 'arrow' ? boxFromArrowGeometry(geometry) : null
    }

    const node = getAnnotationDrawNodeById(target.id)
    return node ? getSvgElementBox(node as SVGGraphicsElement) : null
  }

  const textElement = getAnnotationTextElementById(target.id)
  return textElement ? getSvgElementBox(textElement) : null
}

function clearAnnotationSelection() {
  annotationSelectedTargets.value = []
  annotationSelection.value = null
  annotationSelectionBox.value = null
  annotationArrowSelectionLine.value = null
  annotationSelectionTransform.value = null
}

function syncAnnotationSelectionBox() {
  const targets = annotationSelectedTargets.value
  if (!targets.length) {
    annotationSelection.value = null
    annotationSelectionBox.value = null
    annotationArrowSelectionLine.value = null
    return
  }

  const validTargets = targets.filter((target) => {
    if (target.kind === 'draw')
      return Boolean(target.shape && isSelectableDrawAnnotationKind(target.shape) && getAnnotationDrawNodeById(target.id))

    return Boolean(getAnnotationTextElementById(target.id))
  })

  if (!validTargets.length) {
    clearAnnotationSelection()
    return
  }

  setAnnotationSelections(validTargets, validTargets.find(target => isSameAnnotationTarget(target, annotationSelection.value)) ?? validTargets.at(-1))
  annotationSelectionBox.value = mergeSelectionBoxes(validTargets.map(target => getAnnotationTargetBox(target)).filter(Boolean) as AnnotationSelectionBox[])

  if (validTargets.length === 1 && validTargets[0].kind === 'draw' && validTargets[0].shape === 'arrow') {
    const geometry = getDrawAnnotationGeometry(validTargets[0])
    annotationArrowSelectionLine.value = geometry?.kind === 'arrow' ? geometry : null
  }
  else {
    annotationArrowSelectionLine.value = null
  }
}

function syncAnnotationSelectionBoxSoon() {
  void nextTick(() => {
    syncAnnotationSelectionBox()
  })
}

function annotationSelectionFrameStyle() {
  const box = annotationSelectionBox.value
  if (!box)
    return undefined

  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  }
}

function annotationSelectionActionsStyle() {
  const box = annotationSelectionBox.value
  if (!box)
    return undefined

  const actionWidth = annotationCanAlign.value ? 344 : 176
  let left = box.x + box.width + 12
  if (left + actionWidth > annotationStageWidth.value - 8)
    left = Math.max(8, box.x + box.width - actionWidth)

  return {
    left: `${left}px`,
    top: `${Math.max(8, Math.min(box.y, annotationStageHeight.value - 88))}px`,
  }
}

function annotationTextEditorStyle() {
  const draft = annotationTextDraft.value
  if (!draft)
    return undefined

  const point = clampTextDraftPosition(draft.x, draft.y)
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
  }
}

function annotationResizeHandleStyle(handle: ResizeHandle) {
  const box = annotationSelectionBox.value
  if (!box)
    return undefined

  return {
    left: handle.endsWith('w') ? '0px' : `${box.width}px`,
    top: handle.startsWith('n') ? '0px' : `${box.height}px`,
  }
}

function annotationArrowHandleStyle(which: 'start' | 'end') {
  const arrow = annotationArrowSelectionLine.value
  if (!arrow)
    return undefined

  return {
    left: `${which === 'start' ? arrow.x1 : arrow.x2}px`,
    top: `${which === 'start' ? arrow.y1 : arrow.y2}px`,
  }
}

function annotationHistorySignature(snapshot: AnnotationSnapshot) {
  return JSON.stringify(snapshot)
}

function getAnnotationSnapshot(): AnnotationSnapshot {
  return {
    drawSvg: annotationDrauu?.dump() ?? '',
    texts: cloneTextAnnotations(),
  }
}

function persistAnnotationCache() {
  if (typeof window === 'undefined')
    return

  const snapshot = normalizeAnnotationSnapshot(getAnnotationSnapshot())
  if (!snapshot)
    return

  if (snapshot.drawSvg.trim() || snapshot.texts.length) {
    window.localStorage.setItem(ANNOTATION_CACHE_STORAGE_KEY, JSON.stringify({
      content: input.value,
      snapshot,
    } satisfies PersistedAnnotationCache))
  }
  else {
    window.localStorage.removeItem(ANNOTATION_CACHE_STORAGE_KEY)
  }

  const shareId = currentShareId()
  if (shareId)
    window.localStorage.setItem(shareStorageKey(shareId), JSON.stringify({ content: input.value, annotations: snapshot } satisfies LocalSharePayload))
}

const persistAnnotationCacheDebounced = useDebounceFn(() => {
  persistAnnotationCache()
}, 140)

function restoreAnnotationCache() {
  if (typeof window === 'undefined')
    return null

  const raw = window.localStorage.getItem(ANNOTATION_CACHE_STORAGE_KEY)
  if (!raw)
    return null

  try {
    const parsed = JSON.parse(raw) as PersistedAnnotationCache
    if (parsed && typeof parsed.content === 'string' && parsed.content === input.value)
      return normalizeAnnotationSnapshot(parsed.snapshot)
  }
  catch {
  }

  return null
}

function pushAnnotationHistory(snapshot = getAnnotationSnapshot()) {
  if (isApplyingAnnotationHistory.value)
    return

  const current = annotationHistory.value[annotationHistoryIndex.value]
  if (current && annotationHistorySignature(current) === annotationHistorySignature(snapshot))
    return

  annotationHistory.value = [
    ...annotationHistory.value.slice(0, annotationHistoryIndex.value + 1),
    snapshot,
  ]
  annotationHistoryIndex.value = annotationHistory.value.length - 1
  persistAnnotationCacheDebounced()
}

function applyAnnotationSnapshot(snapshot: AnnotationSnapshot) {
  if (!annotationDrauu)
    return

  isApplyingAnnotationHistory.value = true
  annotationDrauu.cancel()
  annotationDrauu.load(snapshot.drawSvg)
  syncAnnotationDrawNodeIds()
  annotationTextItems.value = cloneTextAnnotations(snapshot.texts)
  isApplyingAnnotationHistory.value = false
  syncAnnotationSelectionBoxSoon()
}

function buildAnnotationBrush(): Brush {
  const modeMap: Record<Exclude<AnnotationTool, 'text' | 'select'>, DrawingMode> = {
    pen: 'stylus',
    arrow: 'line',
    rect: 'rectangle',
    ellipse: 'ellipse',
  }

  if (annotationTool.value === 'text' || annotationTool.value === 'select') {
    return {
      color: annotationColor.value,
      size: annotationStrokeWidth.value,
      mode: 'stylus',
    }
  }

  return {
    color: annotationColor.value,
    size: annotationStrokeWidth.value,
    mode: modeMap[annotationTool.value],
    fill: 'transparent',
    arrowEnd: annotationTool.value === 'arrow',
  }
}

function collectSelectionTransformData(targets: AnnotationSelectionTarget[], primaryTarget: AnnotationSelectionTarget) {
  const nextTargets = cloneSelectionTargets(targets)
  const textStates = Object.fromEntries(nextTargets
    .filter(item => item.kind === 'text')
    .map((item) => {
      const text = getAnnotationTextById(item.id)
      return [annotationSelectionKey(item), text ? { x: text.x, y: text.y, fontSize: text.fontSize } : null]
    })
    .filter((entry): entry is [string, AnnotationTextTransformState] => Boolean(entry[1])))
  const drawStates = Object.fromEntries(nextTargets
    .filter(item => item.kind === 'draw')
    .map((item) => {
      const geometry = getDrawAnnotationGeometry(item)
      return [annotationSelectionKey(item), geometry ?? null]
    })
    .filter((entry): entry is [string, DrawAnnotationGeometry] => Boolean(entry[1])))

  return {
    targets: nextTargets,
    textStates,
    drawStates,
    textState: textStates[annotationSelectionKey(primaryTarget)],
    drawGeometry: drawStates[annotationSelectionKey(primaryTarget)],
  }
}

function syncAnnotationBrush() {
  if (!annotationDrauu)
    return

  annotationDrauu.brush = buildAnnotationBrush()
}

function syncAnnotationStageSize() {
  const stage = previewStageRef.value
  if (!stage)
    return

  annotationStageWidth.value = Math.max(1, Math.round(stage.clientWidth))
  annotationStageHeight.value = Math.max(1, Math.round(stage.scrollHeight))
}

function mountAnnotationDrauu() {
  if (annotationDrauu || !annotationDrawSvgRef.value)
    return

  annotationDrauu = createDrauu({
    el: annotationDrawSvgRef.value,
    brush: buildAnnotationBrush(),
  })
  annotationDrauu.on('committed', (node) => {
    if (node instanceof SVGElement) {
      const kindMap: Record<Exclude<AnnotationTool, 'select' | 'text'>, DrawAnnotationKind> = {
        pen: 'pen',
        arrow: 'arrow',
        rect: 'rect',
        ellipse: 'ellipse',
      }

      const kind = annotationTool.value === 'text' || annotationTool.value === 'select'
        ? inferDrawAnnotationKind(node)
        : kindMap[annotationTool.value]
      applyDrawNodeMetadata(node, kind)
    }

    pushAnnotationHistory()
  })

  const snapshot = annotationHistory.value[annotationHistoryIndex.value]
  if (snapshot.drawSvg) {
    annotationDrauu.load(snapshot.drawSvg)
    syncAnnotationDrawNodeIds()
  }
}

function clampTextDraftPosition(x: number, y: number) {
  return {
    x: Math.min(Math.max(16, x), Math.max(16, annotationStageWidth.value - ANNOTATION_TEXT_EDITOR_WIDTH - 16)),
    y: Math.min(Math.max(16, y), Math.max(16, annotationStageHeight.value - 112)),
  }
}

function suppressNextTextAnnotationPlacement() {
  annotationIgnoreTextPlacementUntil.value = Date.now() + ANNOTATION_TEXT_PLACEMENT_SUPPRESS_MS
}

function shouldIgnoreTextAnnotationPlacement(event: PointerEvent) {
  if (Date.now() < annotationIgnoreTextPlacementUntil.value)
    return true

  if (!(event.target instanceof Element))
    return false

  return Boolean(event.target.closest('.preview-annotation-text-editor'))
}

function toggleAnnotationMode() {
  annotationEnabled.value = !annotationEnabled.value

  if (!annotationEnabled.value) {
    annotationDrauu?.cancel()
    annotationTextDraft.value = null
    clearAnnotationSelection()
  }
  else {
    void nextTick(() => {
      syncAnnotationStageSize()
      syncAnnotationSelectionBox()
      if (annotationTool.value === 'text')
        annotationTextInputRef.value?.focus()
    })
  }
}

function startTextAnnotation(event: PointerEvent) {
  if (!annotationTextInteractive.value)
    return

  if (shouldIgnoreTextAnnotationPlacement(event))
    return

  event.preventDefault()
  event.stopPropagation()

  if (annotationTextDraft.value?.content.trim())
    commitTextAnnotationDraft()
  else
    annotationTextDraft.value = null

  const stage = previewStageRef.value
  if (!stage)
    return

  const rect = stage.getBoundingClientRect()
  const point = clampPointToStage(event.clientX - rect.left, event.clientY - rect.top)
  annotationTextDraft.value = {
    x: point.x,
    y: point.y,
    content: '',
    color: annotationColor.value,
    fontSize: annotationFontSize.value,
  }

  void nextTick(() => {
    annotationTextInputRef.value?.focus()
  })
}

function cancelTextAnnotationDraft() {
  annotationTextDraft.value = null
}

function commitTextAnnotationDraft() {
  const draft = annotationTextDraft.value
  if (!draft)
    return

  const content = draft.content.trim()
  annotationTextDraft.value = null

  if (!content)
    return

  if (draft.id) {
    annotationTextItems.value = annotationTextItems.value.map(text => text.id === draft.id
      ? {
          ...text,
          x: draft.x,
          y: draft.y,
          content,
          color: draft.color ?? text.color,
          fontSize: draft.fontSize ?? text.fontSize,
        }
      : text)
    const target = { kind: 'text', id: draft.id } satisfies AnnotationSelectionTarget
    setAnnotationSelections([target], target)
    pushAnnotationHistory()
    syncAnnotationSelectionBoxSoon()
    return
  }

  annotationTextItems.value = [
    ...annotationTextItems.value,
    {
      id: createAnnotationId(),
      x: draft.x,
      y: draft.y,
      content,
      color: draft.color ?? annotationColor.value,
      fontSize: draft.fontSize ?? annotationFontSize.value,
    },
  ]
  pushAnnotationHistory()
}

function updateAnnotationSelectionsFromPointer(target: AnnotationSelectionTarget, event: PointerEvent) {
  if (isMultiSelectionEvent(event)) {
    if (isAnnotationTargetSelected(target)) {
      const nextTargets = annotationSelectedTargets.value.filter(item => !isSameAnnotationTarget(item, target))
      setAnnotationSelections(nextTargets)
    }
    else {
      setAnnotationSelections([...annotationSelectedTargets.value, target], target)
    }

    syncAnnotationSelectionBoxSoon()
    return false
  }

  if (!isAnnotationTargetSelected(target))
    setAnnotationSelections([target], target)
  else
    annotationSelection.value = { ...target }

  syncAnnotationSelectionBox()
  return true
}

function buildSelectionTransformState(target: AnnotationSelectionTarget, event: PointerEvent, mode: AnnotationSelectionTransformState['mode'], handle?: ResizeHandle, drawGeometry?: DrawAnnotationGeometry) {
  const originBox = annotationSelectionBox.value
  if (!originBox)
    return null

  const transformData = collectSelectionTransformData(annotationSelectedTargets.value, target)

  return {
    target,
    targets: transformData.targets,
    pointerId: event.pointerId,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    originBox,
    handle,
    drawGeometry: drawGeometry ?? transformData.drawGeometry,
    drawStates: transformData.drawStates,
    textState: transformData.textState,
    textStates: transformData.textStates,
    duplicateOnMove: mode === 'move' && event.altKey,
    moved: false,
  } satisfies AnnotationSelectionTransformState
}

function startTextSelection(annotationText: TextAnnotation, event: PointerEvent) {
  if (!annotationTextLayerInteractive.value || annotationTextDraft.value)
    return

  event.preventDefault()
  event.stopPropagation()

  const target: AnnotationSelectionTarget = {
    kind: 'text',
    id: annotationText.id,
  }
  if (!updateAnnotationSelectionsFromPointer(target, event))
    return

  annotationArrowSelectionLine.value = null
  annotationSelectionTransform.value = buildSelectionTransformState(target, event, 'move')
}

function editTextAnnotation(annotationText: TextAnnotation, event: MouseEvent) {
  if (!annotationTextLayerInteractive.value)
    return

  event.preventDefault()
  event.stopPropagation()
  suppressNextTextAnnotationPlacement()

  const target = { kind: 'text', id: annotationText.id } satisfies AnnotationSelectionTarget
  setAnnotationSelections([target], target)
  syncAnnotationSelectionBoxSoon()
  annotationTextDraft.value = {
    id: annotationText.id,
    x: annotationText.x,
    y: annotationText.y,
    content: annotationText.content,
    color: annotationText.color,
    fontSize: annotationText.fontSize,
  }

  void nextTick(() => {
    annotationTextInputRef.value?.focus()
    annotationTextInputRef.value?.select()
  })
}

function editSelectedTextAnnotation(event: MouseEvent) {
  const selection = annotationSelection.value
  if (annotationSelectedTargets.value.length !== 1 || selection?.kind !== 'text')
    return

  const annotationText = getAnnotationTextById(selection.id)
  if (!annotationText)
    return

  editTextAnnotation(annotationText, event)
}

function findSelectableTextAnnotation(eventTarget: EventTarget | null) {
  if (!(eventTarget instanceof Element))
    return null

  const textItem = eventTarget.closest('.preview-annotation-text-item[data-annotation-id]')
  const id = textItem?.getAttribute('data-annotation-id')
  if (!id)
    return null

  return {
    kind: 'text',
    id,
  } satisfies AnnotationSelectionTarget
}

function isPointInsideBox(point: { x: number, y: number }, box: AnnotationSelectionBox, padding = 0) {
  return point.x >= box.x - padding
    && point.x <= box.x + box.width + padding
    && point.y >= box.y - padding
    && point.y <= box.y + box.height + padding
}

function getPointToSegmentDistance(point: { x: number, y: number }, start: { x: number, y: number }, end: { x: number, y: number }) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (!dx && !dy)
    return Math.hypot(point.x - start.x, point.y - start.y)

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx ** 2 + dy ** 2)))
  const projectionX = start.x + t * dx
  const projectionY = start.y + t * dy
  return Math.hypot(point.x - projectionX, point.y - projectionY)
}

function findSelectableAnnotationAtStagePoint(point: { x: number, y: number }, options: { excludeSelected?: boolean } = {}) {
  const textTargets = [...annotationTextItems.value].reverse().map(text => ({ kind: 'text', id: text.id } satisfies AnnotationSelectionTarget))
  for (const target of textTargets) {
    if (options.excludeSelected && isAnnotationTargetSelected(target))
      continue

    const box = getAnnotationTargetBox(target)
    if (box && isPointInsideBox(point, box, 6))
      return target
  }

  const drawNodes = [...getAnnotationDrawNodes()].reverse()
  const drawTargets: Array<{ kind: 'draw', id: string, shape: 'arrow' | 'rect' | 'ellipse' }> = []

  for (const node of drawNodes) {
    const shape = inferDrawAnnotationKind(node)
    if (!isSelectableDrawAnnotationKind(shape) || !node.dataset.annotationId)
      continue

    drawTargets.push({
      kind: 'draw',
      id: node.dataset.annotationId,
      shape,
    })
  }

  for (const target of drawTargets) {
    if (options.excludeSelected && isAnnotationTargetSelected(target))
      continue

    if (target.shape === 'arrow') {
      const geometry = getDrawAnnotationGeometry(target)
      if (geometry?.kind === 'arrow' && getPointToSegmentDistance(point, { x: geometry.x1, y: geometry.y1 }, { x: geometry.x2, y: geometry.y2 }) <= 10)
        return target
      continue
    }

    const box = getAnnotationTargetBox(target)
    if (box && isPointInsideBox(point, box, 6))
      return target
  }

  return null
}

function findSelectableDrawAnnotation(eventTarget: EventTarget | null) {
  const drawSvg = annotationDrawSvgRef.value
  if (!(eventTarget instanceof Element) || !drawSvg)
    return null

  let current: Element | null = eventTarget
  while (current && current !== drawSvg) {
    if (current instanceof SVGElement && current.dataset.annotationId) {
      const shape = inferDrawAnnotationKind(current)
      if (!isSelectableDrawAnnotationKind(shape))
        return null

      return {
        node: current,
        target: {
          kind: 'draw',
          id: current.dataset.annotationId,
          shape,
        } satisfies AnnotationSelectionTarget,
      }
    }

    current = current.parentElement
  }

  return null
}

function findSelectableAnnotationAtPoint(clientX: number, clientY: number, options: { excludeSelected?: boolean } = {}) {
  const point = getStagePointerPosition(new PointerEvent('pointermove', { clientX, clientY }))
  if (point) {
    const target = findSelectableAnnotationAtStagePoint(point, options)
    if (target)
      return target
  }

  if (typeof document === 'undefined')
    return null

  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (!(element instanceof Element))
      continue

    if (element.closest('.preview-annotation-selection__actions, .preview-annotation-selection__handle'))
      continue

    const target = findSelectableTextAnnotation(element) ?? findSelectableDrawAnnotation(element)?.target ?? null
    if (!target)
      continue

    if (options.excludeSelected && isAnnotationTargetSelected(target))
      continue

    return target
  }

  return null
}

function startDrawSelection(event: PointerEvent) {
  if (!annotationEnabled.value || !showPreviewAnnotations.value || annotationTool.value !== 'select')
    return

  event.preventDefault()
  event.stopPropagation()

  const match = findSelectableDrawAnnotation(event.target)
  if (!match) {
    if (!isMultiSelectionEvent(event))
      clearAnnotationSelection()
    return
  }

  const geometry = getDrawAnnotationGeometry(match.target)
  if (!geometry || !updateAnnotationSelectionsFromPointer(match.target, event))
    return

  annotationArrowSelectionLine.value = annotationSingleArrowSelection.value && geometry.kind === 'arrow' ? geometry : null
  annotationSelectionTransform.value = buildSelectionTransformState(match.target, event, 'move', undefined, geometry)
}

function startSelectedAnnotationMove(event: PointerEvent) {
  if (!annotationSelection.value || annotationTool.value !== 'select')
    return

  const hitTarget = findSelectableAnnotationAtPoint(event.clientX, event.clientY, {
    excludeSelected: isMultiSelectionEvent(event),
  })
  if (hitTarget && (!isAnnotationTargetSelected(hitTarget) || !isSameAnnotationTarget(hitTarget, annotationSelection.value))) {
    event.preventDefault()
    event.stopPropagation()

    const geometry = hitTarget.kind === 'draw'
      ? getDrawAnnotationGeometry(hitTarget)
      : undefined
    if (!updateAnnotationSelectionsFromPointer(hitTarget, event))
      return

    annotationArrowSelectionLine.value = hitTarget.kind === 'draw' && hitTarget.shape === 'arrow' && geometry?.kind === 'arrow'
      ? geometry
      : null
    annotationSelectionTransform.value = buildSelectionTransformState(hitTarget, event, 'move', undefined, geometry ?? undefined)
    return
  }

  if (isMultiSelectionEvent(event)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  event.preventDefault()
  event.stopPropagation()

  const geometry = annotationSelection.value.kind === 'draw'
    ? getDrawAnnotationGeometry(annotationSelection.value)
    : undefined
  annotationSelectionTransform.value = buildSelectionTransformState(annotationSelection.value, event, 'move', undefined, geometry ?? undefined)
}

function startSelectedAnnotationResize(handle: ResizeHandle, event: PointerEvent) {
  const selection = annotationSelection.value
  if (!selection || !annotationSelectionCanResize.value || !annotationSelectionBox.value)
    return

  event.preventDefault()
  event.stopPropagation()

  const geometry = selection.kind === 'draw' ? getDrawAnnotationGeometry(selection) : undefined
  annotationSelectionTransform.value = buildSelectionTransformState(selection, event, 'resize', handle, geometry ?? undefined)
}

function startSelectedArrowHandle(which: 'start' | 'end', event: PointerEvent) {
  const selection = annotationSelection.value
  if (!selection || selection.kind !== 'draw' || selection.shape !== 'arrow')
    return

  const geometry = getDrawAnnotationGeometry(selection)
  if (!geometry || geometry.kind !== 'arrow')
    return

  event.preventDefault()
  event.stopPropagation()

  annotationSelectionTransform.value = buildSelectionTransformState(selection, event, which === 'start' ? 'arrow-start' : 'arrow-end', undefined, geometry)
}

function syncSelectionTransform(state: AnnotationSelectionTransformState, dx: number, dy: number, event: PointerEvent) {
  if ((state.mode === 'arrow-start' || state.mode === 'arrow-end') && state.drawGeometry?.kind === 'arrow') {
    const point = getStagePointerPosition(event)
    if (!point)
      return false

    const nextArrow = state.mode === 'arrow-start'
      ? { ...state.drawGeometry, x1: point.x, y1: point.y }
      : { ...state.drawGeometry, x2: point.x, y2: point.y }

    if (!applyDrawAnnotationGeometry(state.target, nextArrow))
      return false

    annotationArrowSelectionLine.value = nextArrow
    annotationSelectionBox.value = boxFromArrowGeometry(nextArrow)
    return true
  }

  if (state.mode === 'move' && state.duplicateOnMove && !state.moved && (dx !== 0 || dy !== 0)) {
    const duplicated = duplicateAnnotationTargets(state.targets, 0, 0, state.target)
    if (!duplicated)
      return false

    applyAnnotationSnapshot(duplicated.snapshot)
    setAnnotationSelections(duplicated.targets, duplicated.primaryTarget)
    syncAnnotationSelectionBox()

    const primaryTarget = duplicated.primaryTarget ?? duplicated.targets.at(-1)
    const originBox = annotationSelectionBox.value
    if (!primaryTarget || !originBox)
      return false

    const transformData = collectSelectionTransformData(duplicated.targets, primaryTarget)
    state.target = primaryTarget
    state.targets = transformData.targets
    state.originBox = originBox
    state.drawGeometry = transformData.drawGeometry
    state.drawStates = transformData.drawStates
    state.textState = transformData.textState
    state.textStates = transformData.textStates
    state.duplicateOnMove = false
  }

  const nextBox = state.mode === 'move'
    ? clampSelectionBoxPosition({
        ...state.originBox,
        x: state.originBox.x + dx,
        y: state.originBox.y + dy,
      })
    : getResizedSelectionBox(state.originBox, state.handle!, dx, dy)

  const offsetX = nextBox.x - state.originBox.x
  const offsetY = nextBox.y - state.originBox.y
  const nextTextById = new Map<string, Partial<TextAnnotation>>()

  for (const target of state.targets) {
    if (target.kind === 'text') {
      const originText = state.textStates?.[annotationSelectionKey(target)]
      if (!originText)
        continue

      if (state.mode === 'move') {
        nextTextById.set(target.id, {
          x: originText.x + offsetX,
          y: originText.y + offsetY,
          fontSize: originText.fontSize,
        })
      }
      else {
        const scaleX = nextBox.width / Math.max(state.originBox.width, 1)
        const scaleY = nextBox.height / Math.max(state.originBox.height, 1)
        nextTextById.set(target.id, {
          x: nextBox.x + (originText.x - state.originBox.x) * scaleX,
          y: nextBox.y + (originText.y - state.originBox.y) * scaleY,
          fontSize: Math.max(14, Math.round(originText.fontSize * Math.max(scaleX, scaleY))),
        })
      }
      continue
    }

    const originGeometry = state.drawStates?.[annotationSelectionKey(target)]
    if (!originGeometry)
      continue

    const nextGeometry = state.mode === 'move'
      ? offsetDrawGeometry(originGeometry, offsetX, offsetY)
      : transformDrawGeometryBySelectionBox(originGeometry, state.originBox, nextBox)

    if (!applyDrawAnnotationGeometry(target, nextGeometry))
      return false

    if (state.targets.length === 1 && nextGeometry.kind === 'arrow')
      annotationArrowSelectionLine.value = nextGeometry
  }

  if (nextTextById.size) {
    annotationTextItems.value = annotationTextItems.value.map((text) => {
      const nextText = nextTextById.get(text.id)
      return nextText ? { ...text, ...nextText } : text
    })
  }

  annotationSelectionBox.value = nextBox
  if (!(state.targets.length === 1 && state.target.kind === 'draw' && state.target.shape === 'arrow'))
    annotationArrowSelectionLine.value = null

  return true
}

function onAnnotationSelectionPointerMove(event: PointerEvent) {
  const state = annotationSelectionTransform.value
  if (!state || state.pointerId !== event.pointerId)
    return

  const dx = event.clientX - state.startX
  const dy = event.clientY - state.startY
  const changed = syncSelectionTransform(state, dx, dy, event)

  if (!changed)
    return

  if (dx !== 0 || dy !== 0)
    state.moved = true

  event.preventDefault()
}

function finishAnnotationSelectionTransform(pointerId?: number) {
  const state = annotationSelectionTransform.value
  if (!state || (pointerId != null && state.pointerId !== pointerId))
    return

  annotationSelectionTransform.value = null

  if (state.moved)
    pushAnnotationHistory()

  syncAnnotationSelectionBoxSoon()
}

function onAnnotationSelectionPointerUp(event: PointerEvent) {
  finishAnnotationSelectionTransform(event.pointerId)
}

function applyCommittedAnnotationSnapshot(snapshot: AnnotationSnapshot, nextTargets: AnnotationSelectionTarget[] = [], primaryTarget?: AnnotationSelectionTarget | null) {
  applyAnnotationSnapshot(snapshot)
  setAnnotationSelections(nextTargets, primaryTarget ?? nextTargets.at(-1) ?? null)
  pushAnnotationHistory(snapshot)
}

function cloneDrawNode(node: SVGElement) {
  const clone = node.cloneNode(true) as SVGElement
  clone.dataset.annotationId = createAnnotationId()
  const marker = clone.querySelector('marker[id]')
  const line = getArrowLineElement(clone)
  if (marker && line) {
    const markerId = createAnnotationId()
    marker.setAttribute('id', markerId)
    line.setAttribute('marker-end', `url(#${markerId})`)
  }
  return clone
}

function duplicateAnnotationTargets(targets: AnnotationSelectionTarget[], offsetX: number, offsetY: number, primaryTarget?: AnnotationSelectionTarget | null) {
  if (!targets.length || !annotationDrauu)
    return null

  const nextTexts = cloneTextAnnotations()
  const drawSvg = annotationDrawSvgRef.value
  if (!drawSvg)
    return null

  const duplicatedTargets: AnnotationSelectionTarget[] = []
  let duplicatedPrimaryTarget: AnnotationSelectionTarget | null = null

  for (const target of targets) {
    let duplicatedTarget: AnnotationSelectionTarget | null = null

    if (target.kind === 'text') {
      const source = getAnnotationTextById(target.id)
      if (!source)
        continue

      const point = clampPointToStage(source.x + offsetX, source.y + offsetY)
      const duplicate = {
        ...source,
        id: createAnnotationId(),
        x: point.x,
        y: point.y,
      }
      nextTexts.push(duplicate)
      duplicatedTarget = { kind: 'text', id: duplicate.id }
    }
    else {
      const sourceNode = getAnnotationDrawNodeById(target.id)
      const sourceGeometry = getDrawAnnotationGeometry(target)
      if (!sourceNode || !sourceGeometry)
        continue

      const duplicateNode = cloneDrawNode(sourceNode)
      applyDrawNodeMetadata(duplicateNode, target.shape)
      applyDrawGeometryToNode(duplicateNode, offsetDrawGeometry(sourceGeometry, offsetX, offsetY))
      drawSvg.appendChild(duplicateNode)
      duplicatedTarget = {
        kind: 'draw',
        id: duplicateNode.dataset.annotationId!,
        shape: inferDrawAnnotationKind(duplicateNode),
      }
    }

    if (!duplicatedTarget)
      continue

    duplicatedTargets.push(duplicatedTarget)
    if (isSameAnnotationTarget(target, primaryTarget))
      duplicatedPrimaryTarget = duplicatedTarget
  }

  return {
    snapshot: {
      drawSvg: annotationDrauu.dump(),
      texts: nextTexts,
    } satisfies AnnotationSnapshot,
    targets: duplicatedTargets,
    primaryTarget: duplicatedPrimaryTarget ?? duplicatedTargets.at(-1) ?? null,
  }
}

function duplicateSelectedAnnotation() {
  const targets = cloneSelectionTargets()
  const duplicated = duplicateAnnotationTargets(targets, ANNOTATION_DUPLICATE_OFFSET, ANNOTATION_DUPLICATE_OFFSET, annotationSelection.value)
  if (!duplicated)
    return

  applyCommittedAnnotationSnapshot(duplicated.snapshot, duplicated.targets, duplicated.primaryTarget)
}

function alignSelectedAnnotations(mode: AnnotationAlignMode) {
  const targets = cloneSelectionTargets()
  const selectionBox = annotationSelectionBox.value
  if (!annotationDrauu || targets.length < 2 || !selectionBox)
    return

  let nextTexts = cloneTextAnnotations()

  for (const target of targets) {
    const box = getAnnotationTargetBox(target)
    if (!box)
      continue

    const dx = mode === 'left'
      ? selectionBox.x - box.x
      : mode === 'hcenter'
        ? selectionBox.x + selectionBox.width / 2 - (box.x + box.width / 2)
        : mode === 'right'
          ? selectionBox.x + selectionBox.width - (box.x + box.width)
          : 0
    const dy = mode === 'top'
      ? selectionBox.y - box.y
      : mode === 'vcenter'
        ? selectionBox.y + selectionBox.height / 2 - (box.y + box.height / 2)
        : mode === 'bottom'
          ? selectionBox.y + selectionBox.height - (box.y + box.height)
          : 0

    if (dx === 0 && dy === 0)
      continue

    if (target.kind === 'text') {
      nextTexts = nextTexts.map(text => text.id === target.id ? { ...text, x: text.x + dx, y: text.y + dy } : text)
      continue
    }

    const geometry = getDrawAnnotationGeometry(target)
    if (!geometry)
      continue

    if (!applyDrawAnnotationGeometry(target, offsetDrawGeometry(geometry, dx, dy)))
      return
  }

  annotationTextItems.value = nextTexts
  pushAnnotationHistory({
    drawSvg: annotationDrauu.dump(),
    texts: nextTexts,
  })
  setAnnotationSelections(targets, annotationSelection.value)
  syncAnnotationSelectionBoxSoon()
}

function bringSelectedAnnotationToFront() {
  const targets = cloneSelectionTargets()
  if (!targets.length || !annotationDrauu)
    return

  let nextTexts = cloneTextAnnotations()
  const drawSvg = annotationDrawSvgRef.value

  for (const target of targets) {
    if (target.kind === 'text') {
      const text = nextTexts.find(item => item.id === target.id)
      if (!text)
        continue
      nextTexts = [...nextTexts.filter(item => item.id !== target.id), text]
      continue
    }

    const node = getAnnotationDrawNodeById(target.id)
    if (node && drawSvg)
      drawSvg.appendChild(node)
  }

  applyCommittedAnnotationSnapshot({
    drawSvg: annotationDrauu.dump(),
    texts: nextTexts,
  }, targets)
}

function deleteSelectedAnnotation() {
  const targets = cloneSelectionTargets()
  if (!targets.length || !annotationDrauu)
    return

  const targetKeys = new Set(targets.map(annotationSelectionKey))
  const drawSvg = annotationDrawSvgRef.value
  if (!drawSvg)
    return

  getAnnotationDrawNodes().forEach((node) => {
    const target: AnnotationSelectionTarget = {
      kind: 'draw',
      id: node.dataset.annotationId ?? '',
      shape: inferDrawAnnotationKind(node),
    }
    if (target.id && targetKeys.has(annotationSelectionKey(target)))
      node.remove()
  })

  applyCommittedAnnotationSnapshot({
    drawSvg: annotationDrauu.dump(),
    texts: cloneTextAnnotations().filter(text => !targetKeys.has(annotationSelectionKey({ kind: 'text', id: text.id }))),
  })
  clearAnnotationSelection()
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement))
    return false

  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function onAnnotationShortcutKeydown(event: KeyboardEvent) {
  if (!showPreviewAnnotations.value)
    return

  if (isEditableTarget(event.target))
    return

  const key = event.key.toLowerCase()

  if (key === 'a' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    toggleAnnotationMode()
    return
  }

  if (!annotationEnabled.value)
    return

  if (key === 'v' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    annotationTool.value = 'select'
    return
  }

  if ((key === 'delete' || key === 'backspace') && annotationSelectedTargets.value.length) {
    event.preventDefault()
    deleteSelectedAnnotation()
    return
  }

  if (key === 'escape' && annotationSelectedTargets.value.length) {
    event.preventDefault()
    clearAnnotationSelection()
    return
  }

  if (!(event.metaKey || event.ctrlKey))
    return

  if (key === 'z' && event.shiftKey) {
    event.preventDefault()
    redoAnnotation()
    return
  }

  if (key === 'y') {
    event.preventDefault()
    redoAnnotation()
    return
  }

  if (key === 'z') {
    event.preventDefault()
    undoAnnotation()
  }
}

function undoAnnotation() {
  if (!annotationCanUndo.value)
    return

  annotationTextDraft.value = null
  annotationSelectionTransform.value = null
  annotationHistoryIndex.value -= 1
  applyAnnotationSnapshot(annotationHistory.value[annotationHistoryIndex.value])
}

function redoAnnotation() {
  if (!annotationCanRedo.value)
    return

  annotationTextDraft.value = null
  annotationSelectionTransform.value = null
  annotationHistoryIndex.value += 1
  applyAnnotationSnapshot(annotationHistory.value[annotationHistoryIndex.value])
}

function clearAnnotations() {
  if (!annotationHasItems.value) {
    annotationTextDraft.value = null
    return
  }

  annotationTextDraft.value = null
  clearAnnotationSelection()
  annotationDrauu?.clear()
  annotationTextItems.value = []
  pushAnnotationHistory()
}

function resetAnnotationsForInputChange() {
  annotationTextDraft.value = null
  clearAnnotationSelection()
  annotationDrauu?.cancel()
  annotationDrauu?.clear()
  annotationTextItems.value = []
  annotationHistory.value = [{ drawSvg: '', texts: [] }]
  annotationHistoryIndex.value = 0
  persistAnnotationCacheDebounced()
}

function annotationTextLines(content: string) {
  return content.split('\n')
}

function handleEditorPaste(event: ClipboardEvent) {
  const textarea = event.currentTarget
  if (!(textarea instanceof HTMLTextAreaElement))
    return

  const pasted = event.clipboardData?.getData('text/plain')
  if (!pasted)
    return

  const next = resolveMarkdownTextareaPaste(textarea, pasted)
  if (!next)
    return

  event.preventDefault()
  textarea.value = next.nextValue
  textarea.selectionStart = next.selectionStart
  textarea.selectionEnd = next.selectionEnd
  input.value = next.nextValue
}

function exportPreviewAsPdf() {
  if (annotationTextDraft.value?.content.trim())
    commitTextAnnotationDraft()
  else
    annotationTextDraft.value = null

  showToast('已打开浏览器打印导出，请在系统对话框里选择“保存为 PDF”。', 'info', 2800)
  window.print()
}

async function restoreFromUrl() {
  const decoded = await decodeMarkdownHashAsync(window.location.hash || '')
  if (!decoded)
    return false

  input.value = decoded
  return true
}

function restoreFromLocalShare() {
  const shareId = currentShareId()
  if (!shareId)
    return false

  const shared = window.localStorage.getItem(shareStorageKey(shareId))
  if (shared == null)
    return false

  const payload = parseLocalSharePayload(shared)
  input.value = payload.content
  initialAnnotationSnapshot = normalizeAnnotationSnapshot(payload.annotations)
  return true
}

function restoreViewModeFromUrl() {
  testPageViewMode.value = resolveTestPageViewMode(window.location.search)
}

async function exitSharedPreview() {
  testPageViewMode.value = 'lab'
  const full = await generateShareLink('lab', { silent: true })
  shareUrl.value = full
  window.history.replaceState(undefined, '', full)
}

async function returnToEditableTestPage() {
  if (isSharePreviewMode.value) {
    await exitSharedPreview()
    focusEditorSoon()
    return
  }

  const previewCard = previewCardRef.value
  if (document.fullscreenElement === previewCard && document.exitFullscreen) {
    await document.exitFullscreen()
    focusEditorSoon()
  }
}

function applySample(sampleId: SampleId) {
  const sample = sampleCards.find(item => item.id === sampleId)
  if (!sample)
    return

  stopStreamRender()
  selectedSampleId.value = sample.id
  input.value = sample.content
  showToast(`已切换到“${sample.title}”样例。`, 'info', 1200)
}

function startStreamRender() {
  if (isStreaming.value) {
    stopStreamRender()
    return
  }

  startStreaming()
}

function stopStreamRender() {
  stopStreaming()
}

function resetEditor() {
  applySample(selectedSampleId.value)
}

function clearEditor() {
  resetStreamState()
  input.value = ''
}

function toggleAppearance() {
  isDark.value = !isDark.value
}

function openStreamSettingsDialog() {
  if (!streamSettingsDialogRef.value || streamSettingsDialogRef.value.open)
    return
  streamSettingsDialogRef.value.showModal?.()
}

function closeStreamSettingsDialog() {
  if (!streamSettingsDialogRef.value?.open)
    return
  streamSettingsDialogRef.value.close()
}

function frameworkHref(id: FrameworkId) {
  const framework = frameworkCards.find(item => item.id === id)
  if (!framework)
    return '/test'
  return resolveFrameworkTestHref(
    framework,
    CURRENT_FRAMEWORK,
    input.value,
    typeof window !== 'undefined'
      ? { hostname: window.location.hostname, protocol: window.location.protocol }
      : undefined,
    testPageViewMode.value,
  )
}

async function initializeTestPage() {
  restoreViewModeFromUrl()
  const restored = restoreFromLocalShare() || await restoreFromUrl()
  if (!restored) {
    const requestedSample = new URLSearchParams(window.location.search).get('sample')
    const sample = sampleCards.find(item => item.id === requestedSample)
      ?? sampleCards.find(item => item.id === selectedSampleId.value)
      ?? sampleCards[0]
    selectedSampleId.value = sample.id
    input.value = sample.content
  }
  initialAnnotationSnapshot ||= restoreAnnotationCache()
  preserveAnnotationsOnNextInputChange = Boolean(initialAnnotationSnapshot)
  if (preserveAnnotationsOnNextInputChange) {
    void nextTick(() => {
      preserveAnnotationsOnNextInputChange = false
    })
  }
  shareUrl.value = currentBasePageUrl()
  sandboxSnapshot.value = input.value
  syncPreviewFullscreenState()
  syncAnnotationStageSize()
  mountAnnotationDrauu()
  if (initialAnnotationSnapshot) {
    annotationHistory.value = [initialAnnotationSnapshot]
    annotationHistoryIndex.value = 0
    applyAnnotationSnapshot(initialAnnotationSnapshot)
    initialAnnotationSnapshot = null
  }
  document.addEventListener('fullscreenchange', syncPreviewFullscreenState)
  window.addEventListener('pointermove', onAnnotationSelectionPointerMove, { passive: false })
  window.addEventListener('pointerup', onAnnotationSelectionPointerUp, { passive: false })
  window.addEventListener('pointercancel', onAnnotationSelectionPointerUp, { passive: false })
  window.addEventListener('keydown', onAnnotationShortcutKeydown)
  void refreshShareModeHints()
}

onMounted(() => {
  const benchmarkWindow = window as Window & { __markstreamBenchmarkUnmount?: () => void }
  if (isBenchmarkMode) {
    benchmarkWindow.__markstreamBenchmarkUnmount = () => {
      benchmarkRenderPreview.value = false
    }
  }
  void initializeTestPage()
})

onBeforeUnmount(() => {
  const benchmarkWindow = window as Window & { __markstreamBenchmarkUnmount?: () => void }
  delete benchmarkWindow.__markstreamBenchmarkUnmount
  document.removeEventListener('fullscreenchange', syncPreviewFullscreenState)
  window.removeEventListener('pointermove', onAnnotationSelectionPointerMove)
  window.removeEventListener('pointerup', onAnnotationSelectionPointerUp)
  window.removeEventListener('pointercancel', onAnnotationSelectionPointerUp)
  window.removeEventListener('keydown', onAnnotationShortcutKeydown)
  annotationDrauu?.unmount()
  annotationDrauu = null
})

useResizeObserver(previewStageRef, () => {
  syncAnnotationStageSize()
  syncAnnotationSelectionBoxSoon()
})

watch(normalizedChunkSizeRange, (range) => {
  if (streamChunkSizeMin.value !== range.min)
    streamChunkSizeMin.value = range.min
  if (streamChunkSizeMax.value !== range.max)
    streamChunkSizeMax.value = range.max
}, { immediate: true })

watch(normalizedChunkDelayRange, (range) => {
  if (streamChunkDelayMin.value !== range.min)
    streamChunkDelayMin.value = range.min
  if (streamChunkDelayMax.value !== range.max)
    streamChunkDelayMax.value = range.max
}, { immediate: true })

watch(streamBurstiness, (value) => {
  const next = Math.round(clampStreamControl(value, 0, 100, 35))
  if (next !== value)
    streamBurstiness.value = next
}, { immediate: true })

watch(input, (value, previousValue) => {
  if (value !== previousValue) {
    if (preserveAnnotationsOnNextInputChange)
      preserveAnnotationsOnNextInputChange = false
    else
      resetAnnotationsForInputChange()
  }

  copiedShareTarget.value = null
  if (!isStreaming.value && typeof window !== 'undefined')
    shareUrl.value = currentBasePageUrl()
  refreshShareModeHintsDebounced()
  if (sandboxAutoSync.value)
    syncSandboxDebounced()
  persistAnnotationCacheDebounced()
  void nextTick(() => {
    syncAnnotationStageSize()
    syncAnnotationSelectionBox()
  })
})

watch(sandboxAutoSync, (enabled) => {
  if (enabled)
    syncSandbox()
})

watch(() => sandboxFrameworkId.value, () => {
  const framework = testSandboxFrameworks.find(item => item.id === sandboxFrameworkId.value) ?? testSandboxFrameworks[0]
  sandboxSource.value = normalizeSandboxSource(framework, sandboxSource.value)
  sandboxVersion.value = framework.defaultVersion
  syncSandboxDebounced()
})

watch(() => sandboxSource.value, (source) => {
  const normalized = normalizeSandboxSource(activeSandboxFramework.value, source)
  if (normalized !== source) {
    sandboxSource.value = normalized
    return
  }
  syncSandboxDebounced()
})

watch(() => sandboxVersion.value, () => {
  syncSandboxDebounced()
})

watch(annotationTool, (tool, previousTool) => {
  if (tool !== previousTool && tool !== 'text')
    annotationTextDraft.value = null
  if (tool !== 'select')
    clearAnnotationSelection()
  syncAnnotationBrush()
  if (tool === 'select')
    syncAnnotationSelectionBoxSoon()
}, { immediate: true })

watch([annotationColor, annotationStrokeWidth], () => {
  syncAnnotationBrush()
}, { immediate: true })

watch(showPreviewAnnotations, (visible) => {
  if (!visible) {
    annotationEnabled.value = false
    annotationTextDraft.value = null
    clearAnnotationSelection()
    annotationDrauu?.cancel()
    return
  }

  void nextTick(() => {
    syncAnnotationStageSize()
    mountAnnotationDrauu()
    applyAnnotationSnapshot(annotationHistory.value[annotationHistoryIndex.value])
  })
})

watch(annotationSelectedTargets, (targets) => {
  if (!targets.length) {
    annotationSelection.value = null
    annotationSelectionBox.value = null
    annotationArrowSelectionLine.value = null
    return
  }

  syncAnnotationSelectionBoxSoon()
})

watch(annotationTextItems, () => {
  if (annotationSelectedTargets.value.some(target => target.kind === 'text'))
    syncAnnotationSelectionBoxSoon()
}, { deep: true })

watch(isDark, (value) => {
  if (typeof document !== 'undefined')
    document.documentElement.classList.toggle('dark', value)
}, { immediate: true })

watch(() => renderMode.value, (mode) => {
  if (mode === 'pre')
    setCustomComponents({ code_block: PreCodeNode, think: ThinkingNode, thinking: ThinkingNode })
  else if (mode === 'markdown')
    setCustomComponents({ code_block: MarkdownCodeBlockNode, think: ThinkingNode, thinking: ThinkingNode })
  else
    setCustomComponents({ code_block: CodeBlockNode, think: ThinkingNode, thinking: ThinkingNode })
}, { immediate: true })

watch(mathEnabled, (enabled) => {
  if (enabled)
    enableKatex()
  else
    disableKatex()
}, { immediate: true })

watch(mermaidEnabled, (enabled) => {
  if (enabled)
    enableMermaid()
  else
    disableMermaid()
}, { immediate: true })
</script>

<template>
  <div class="test-lab" :class="{ 'test-lab--dark': isDark, 'dark': isDark, 'test-lab--share-preview': isSharePreviewMode }">
    <div v-if="!isSharePreviewMode" class="test-lab__glow test-lab__glow--1" />
    <div v-if="!isSharePreviewMode" class="test-lab__glow test-lab__glow--2" />
    <div v-if="!isSharePreviewMode" class="test-lab__glow test-lab__glow--3" />

    <div class="test-lab__shell" :class="{ 'test-lab__shell--share-preview': isSharePreviewMode }">
      <section v-if="!isSharePreviewMode" class="hero-panel">
        <div class="hero-panel__copy">
          <span class="eyebrow">
            <span class="eyebrow__dot" />
            Cross-framework Rendering Studio
          </span>
          <h1>Markstream <span class="hero-panel__accent">Diagnostic</span> Studio</h1>
          <p>
            直接粘贴 markdown，立即查看真实渲染；排障时用同一份输入并排比对
            Vue 3、Vue 2、React 与 Angular 的差异表现。
          </p>
        </div>

        <div class="hero-panel__actions">
          <div class="hero-panel__action-row">
            <button type="button" class="action-button action-button--primary" :disabled="isWorking" @click="generateAndCopy">
              {{ copiedShareTarget === 'lab' ? (labShareUsesLocalStorage ? '已复制本地实验页链接' : '已复制实验页链接') : (isWorking ? '生成中...' : labShareButtonLabel) }}
            </button>
            <button type="button" class="action-button" @click="copyRawInput">
              复制 Issue 链接
            </button>
            <button type="button" class="action-button" @click="openIssueInNewTab">
              打开 Issue
            </button>
          </div>

          <div class="hero-panel__status-row">
            <span class="mini-pill">{{ renderModeLabel }}</span>
            <span class="mini-pill" :class="{ 'mini-pill--active': isStreaming }">
              {{ isStreaming ? 'Streaming' : 'Ready' }}
            </span>
          </div>

          <div v-if="labShareUsesLocalStorage || previewShareUsesLocalStorage" class="info-banner info-banner--warning">
            当前内容太长，分享链接已切换为本地存储模式；只能在你当前浏览器自己打开，发给别人看不到，跨浏览器复现请使用 Issue 链接。
          </div>
          <div v-if="notice" class="info-banner" :class="`info-banner--${noticeType}`">
            {{ notice }}
          </div>
        </div>

        <div class="hero-panel__metrics">
          <div class="metric-card">
            <span>当前框架</span>
            <strong>Vue 3</strong>
          </div>
          <div class="metric-card">
            <span>字符数</span>
            <strong>{{ charCount }}</strong>
          </div>
          <div class="metric-card">
            <span>行数</span>
            <strong>{{ lineCount }}</strong>
          </div>
          <div class="metric-card">
            <span>预览进度</span>
            <strong>{{ streamProgress }}%</strong>
          </div>
        </div>

        <div class="framework-switcher">
          <a
            v-for="framework in frameworkCards"
            :key="framework.id"
            class="framework-chip"
            :class="{ 'framework-chip--current': framework.id === CURRENT_FRAMEWORK }"
            :href="frameworkHref(framework.id)"
          >
            <span class="framework-chip__label">{{ framework.label }}</span>
            <span class="framework-chip__note">{{ framework.note }}</span>
          </a>
        </div>
      </section>

      <div class="lab-layout" :class="{ 'lab-layout--share-preview': isSharePreviewMode }">
        <aside v-if="!isSharePreviewMode" class="lab-sidebar">
          <section class="panel-card panel-card--samples">
            <div class="panel-card__head">
              <div>
                <h2>样例</h2>
                <p>快速切换不同的回归场景。</p>
              </div>
              <span class="mini-pill">{{ activeSample.title }}</span>
            </div>

            <div class="sample-list">
              <button
                v-for="sample in sampleCards"
                :key="sample.id"
                type="button"
                class="sample-card"
                :class="{ 'sample-card--active': sample.id === selectedSampleId }"
                @click="applySample(sample.id)"
              >
                <strong>{{ sample.title }}</strong>
                <span>{{ sample.summary }}</span>
              </button>
            </div>
          </section>

          <section class="panel-card panel-card--stream">
            <div class="panel-card__head">
              <div>
                <h2>流式控制</h2>
                <p>先用这里的紧凑摘要和常用操作控制流式预览，细节参数放进更多设置里。</p>
              </div>
              <button type="button" class="ghost-button" @click="openStreamSettingsDialog">
                更多设置
              </button>
            </div>

            <div class="stream-summary">
              <div class="stream-summary__row">
                <span class="mini-pill mini-pill--active">{{ streamPresetLabel }}</span>
                <span class="mini-pill">{{ streamModeLabel }}</span>
                <span class="mini-pill">{{ streamSliceMode === 'boundary-aware' ? 'Boundary Aware' : 'Pure Random' }}</span>
                <span class="mini-pill">{{ renderModeLabel }}</span>
              </div>

              <div class="stream-summary__row stream-summary__row--dense">
                <span class="stream-summary__item">Chunk {{ streamChunkRangeLabel }}</span>
                <span class="stream-summary__item">Delay {{ streamDelayRangeLabel }}</span>
                <span class="stream-summary__item">Burst {{ streamBurstiness }}%</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': codeBlockStream }">代码块流式</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': viewportPriority }">viewportPriority</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': batchRendering }">batchRendering</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': typewriter }">typewriter</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': mathEnabled }">KaTeX</span>
                <span class="stream-summary__item" :class="{ 'stream-summary__item--active': mermaidEnabled }">Mermaid</span>
                <span v-if="debugParse" class="stream-summary__item stream-summary__item--active">解析树 debug</span>
                <span v-if="streamDebug" class="stream-summary__item stream-summary__item--active">chunk debug</span>
              </div>
            </div>

            <div class="control-actions control-actions--stream-bar">
              <button type="button" class="action-button action-button--primary" @click="startStreamRender">
                {{ isStreaming ? '停止流式渲染' : '开始流式渲染' }}
              </button>
              <button type="button" class="action-button" :disabled="!isStreaming" @click="toggleStreamingPause">
                {{ isPaused ? '继续流式渲染' : '暂停流式渲染' }}
              </button>
              <button type="button" class="action-button" @click="resetEditor">
                重置样例
              </button>
              <button type="button" class="action-button" @click="clearEditor">
                清空输入
              </button>
              <button type="button" class="action-button" @click="openStreamSettingsDialog">
                调整参数
              </button>
            </div>

            <div class="progress-block">
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: `${streamProgress}%` }" />
              </div>
              <div class="progress-meta">
                <span>{{ previewContent.length }} / {{ input.length || 0 }}</span>
                <span>{{ isStreaming ? `${streamModeLabel} · 最近一次 ${lastChunkSize} 字 / ${lastDelayMs}ms` : 'Static preview' }}</span>
              </div>
            </div>
          </section>

          <section v-if="!isBenchmarkMode" class="panel-card panel-card--sandbox">
            <div class="panel-card__head">
              <div>
                <h2>版本沙箱</h2>
                <p>左侧收紧成配置面板，右侧保留更大的 iframe 对照区域。</p>
              </div>
              <span class="mini-pill">{{ sandboxStatusLabel }}</span>
            </div>

            <div class="sandbox-summary">
              <span class="mini-pill mini-pill--active">{{ activeSandboxFramework.label }}</span>
              <span class="mini-pill">{{ activeSandbox.source === 'workspace' ? 'workspace' : 'npm' }}</span>
              <span class="mini-pill">{{ activeSandbox.source === 'workspace' ? 'local' : activeSandbox.version }}</span>
            </div>

            <div class="control-stack control-stack--sandbox">
              <LabSelect
                v-model="sandboxFrameworkId"
                label="目标框架"
                :options="sandboxFrameworkOptions"
              />
              <label class="text-control">
                <span>包版本</span>
                <input
                  v-model="sandboxVersion"
                  type="text"
                  :placeholder="sandboxVersionPlaceholder"
                >
              </label>

              <div class="segmented-control">
                <button
                  type="button"
                  class="segmented-control__button"
                  :class="{ 'segmented-control__button--active': activeSandbox.source === 'workspace' }"
                  :disabled="!activeSandboxFramework.supportsWorkspace"
                  @click="chooseSandboxSource('workspace')"
                >
                  workspace
                </button>
                <button
                  type="button"
                  class="segmented-control__button"
                  :class="{ 'segmented-control__button--active': activeSandbox.source === 'npm' }"
                  @click="chooseSandboxSource('npm')"
                >
                  npm
                </button>
              </div>

              <div class="preset-list">
                <button
                  v-for="version in sandboxQuickVersions"
                  :key="version"
                  type="button"
                  class="preset-chip"
                  :class="{ 'preset-chip--active': sandboxVersion === version }"
                  @click="chooseSandboxVersion(version)"
                >
                  {{ version }}
                </button>
              </div>

              <label class="toggle-item">
                <span>输入变化自动同步到 iframe</span>
                <input v-model="sandboxAutoSync" type="checkbox">
              </label>
            </div>

            <div class="control-actions control-actions--stacked">
              <button type="button" class="action-button action-button--primary" @click="syncSandbox">
                刷新沙箱
              </button>
              <button type="button" class="action-button" @click="openSandboxInNewTab">
                独立打开
              </button>
            </div>

            <div class="meta-list">
              <div class="meta-list__row">
                <span>渲染目标</span>
                <strong>{{ sandboxPackageLabel }}</strong>
              </div>
              <div class="meta-list__row">
                <span>运行时</span>
                <strong>{{ sandboxRuntimeLabel }}</strong>
              </div>
            </div>

            <div v-if="!activeSandboxFramework.supportsWorkspace" class="info-banner info-banner--info">
              {{ activeSandboxFramework.label }} 在这个沙箱里先走 npm 包模式；本地 workspace 对照仍可用上方 framework 切页。
            </div>
            <div v-if="sandboxDirty" class="info-banner info-banner--warning">
              右侧 iframe 还没同步最新输入，点“刷新沙箱”即可用当前 markdown 重载。
            </div>
          </section>
        </aside>

        <section class="workspace-grid" :class="{ 'workspace-grid--share-preview': isSharePreviewMode }">
          <article v-if="!isSharePreviewMode" class="workspace-card workspace-card--pane workspace-card--editor">
            <header class="workspace-card__head">
              <div>
                <h2>Markdown 输入</h2>
                <p>把 markdown 粘进来，右侧立即看到真实渲染结果。</p>
              </div>
              <span class="mini-pill">Live editor</span>
            </header>

            <div class="editor-shell">
              <div class="editor-shell__toolbar">
                <div class="editor-shell__title-group">
                  <span class="editor-shell__traffic" />
                  <span class="editor-shell__traffic" />
                  <span class="editor-shell__traffic" />
                  <strong class="editor-shell__filename">repro.md</strong>
                </div>
                <div class="editor-shell__meta">
                  <span class="editor-shell__meta-item">{{ lineCount }} lines</span>
                  <span class="editor-shell__meta-item">{{ charCount }} chars</span>
                </div>
              </div>

              <textarea
                v-model="input"
                class="editor-textarea"
                spellcheck="false"
                placeholder="在这里粘贴你的复现 markdown..."
                @paste="handleEditorPaste"
              />
            </div>

            <footer class="workspace-card__foot">
              <span>可直接粘贴 issue 复现内容</span>
              <span>{{ lineCount }} lines · {{ charCount }} chars</span>
            </footer>
          </article>

          <article
            ref="previewCardRef"
            class="workspace-card workspace-card--pane workspace-card--preview"
            :class="{ 'workspace-card--share-preview': isSharePreviewMode, 'workspace-card--preview-dark': isDark, 'dark': isDark }"
            :data-color-scheme="isDark ? 'dark' : 'light'"
            :data-testid="isSharePreviewMode ? 'shared-preview-shell' : undefined"
          >
            <div
              v-if="showImmersivePreviewControls"
              class="preview-immersive-shell"
              data-testid="immersive-preview-hover-zone"
            >
              <div class="preview-immersive-toolbar" data-testid="immersive-preview-toolbar">
                <button
                  type="button"
                  class="ghost-button preview-immersive-toolbar__button"
                  data-testid="immersive-preview-back-button"
                  @click="returnToEditableTestPage"
                >
                  {{ immersiveBackLabel }}
                </button>
                <a
                  class="ghost-button icon-button preview-immersive-toolbar__icon"
                  :href="GITHUB_REPO_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="immersive-preview-star-link"
                  aria-label="Star on GitHub"
                  title="Star on GitHub"
                >
                  <Icon icon="carbon:star" class="icon-button__icon" />
                </a>
                <button
                  type="button"
                  class="ghost-button icon-button preview-immersive-toolbar__icon"
                  data-testid="immersive-preview-theme-button"
                  :aria-label="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  :title="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  @click="toggleAppearance"
                >
                  <Icon
                    :icon="isDark ? 'carbon:moon' : 'carbon:sun'"
                    class="icon-button__icon"
                  />
                </button>
                <button
                  type="button"
                  class="ghost-button preview-immersive-toolbar__button"
                  :aria-pressed="annotationEnabled"
                  @click="toggleAnnotationMode"
                >
                  {{ annotationEnabled ? '退出标注' : '开始标注' }}
                </button>
                <button
                  type="button"
                  class="ghost-button preview-immersive-toolbar__button"
                  @click="exportPreviewAsPdf"
                >
                  导出 PDF
                </button>
                <div v-if="showAnnotationToolbar" class="preview-annotation-toolbar">
                  <span class="preview-annotation-toolbar__hint">
                    {{ ANNOTATION_SHORTCUT_HINT }}
                  </span>
                  <div class="preview-annotation-toolbar__group">
                    <button
                      v-for="toolOption in ANNOTATION_TOOL_OPTIONS"
                      :key="toolOption.id"
                      type="button"
                      class="preview-annotation-chip"
                      :class="{ 'preview-annotation-chip--active': annotationTool === toolOption.id }"
                      @click="annotationTool = toolOption.id"
                    >
                      {{ toolOption.label }}
                    </button>
                  </div>
                  <div class="preview-annotation-toolbar__group">
                    <button
                      v-for="strokeOption in ANNOTATION_STROKES"
                      :key="strokeOption.value"
                      type="button"
                      class="preview-annotation-chip"
                      :class="{ 'preview-annotation-chip--active': annotationStrokeWidth === strokeOption.value }"
                      @click="annotationStrokeWidth = strokeOption.value"
                    >
                      {{ strokeOption.label }}
                    </button>
                  </div>
                  <div class="preview-annotation-toolbar__group preview-annotation-toolbar__group--colors">
                    <button
                      v-for="colorOption in ANNOTATION_COLORS"
                      :key="colorOption"
                      type="button"
                      class="preview-annotation-swatch"
                      :class="{ 'preview-annotation-swatch--active': annotationColor === colorOption }"
                      :style="{ '--annotation-swatch': colorOption }"
                      :aria-label="`切换标注颜色 ${colorOption}`"
                      @click="annotationColor = colorOption"
                    />
                  </div>
                  <div class="preview-annotation-toolbar__group">
                    <button
                      type="button"
                      class="preview-annotation-chip"
                      :disabled="!annotationCanUndo"
                      @click="undoAnnotation"
                    >
                      上一步
                    </button>
                    <button
                      type="button"
                      class="preview-annotation-chip"
                      :disabled="!annotationCanRedo"
                      @click="redoAnnotation"
                    >
                      重做
                    </button>
                    <button
                      type="button"
                      class="preview-annotation-chip"
                      :disabled="!annotationHasItems && !annotationTextDraft"
                      @click="clearAnnotations"
                    >
                      清屏
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <header v-if="!isSharePreviewMode" class="workspace-card__head">
              <div>
                <h2>实时预览</h2>
                <p>
                  {{ `当前模式：${renderModeLabel}${isPreviewFullscreen ? ' · 按 Esc 退出全屏' : ''}` }}
                </p>
              </div>
              <div class="workspace-card__head-actions">
                <button
                  type="button"
                  class="ghost-button icon-button"
                  data-testid="theme-toggle-button"
                  :aria-label="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  :title="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  @click="toggleAppearance"
                >
                  <Icon
                    :icon="isDark ? 'carbon:moon' : 'carbon:sun'"
                    class="icon-button__icon"
                  />
                </button>
                <button
                  type="button"
                  class="ghost-button"
                  data-testid="preview-share-button"
                  :disabled="isWorking"
                  @click="generateAndCopyPreview"
                >
                  {{ copiedShareTarget === 'preview' ? (previewShareUsesLocalStorage ? '已复制本地预览链接' : '已复制预览链接') : (isWorking ? '生成中...' : previewShareButtonLabel) }}
                </button>
                <button
                  type="button"
                  class="ghost-button"
                  data-testid="preview-fullscreen-button"
                  :aria-pressed="isPreviewFullscreen"
                  @click="togglePreviewFullscreen"
                >
                  {{ isPreviewFullscreen ? '退出全屏' : '全屏预览' }}
                </button>
                <span class="mini-pill" :class="{ 'mini-pill--active': isStreaming }">
                  {{ isStreaming ? 'Streaming' : 'Ready' }}
                </span>
              </div>
            </header>

            <div class="preview-surface">
              <div v-if="!isBenchmarkMode" class="preview-surface__grid" />
              <div class="preview-stage-frame">
                <div ref="previewStageRef" class="preview-stage">
                  <MarkdownRender
                    v-if="benchmarkRenderPreview"
                    :content="previewContent"
                    :custom-html-tags="testPageCustomHtmlTags"
                    :is-dark="isDark"
                    :mermaid-props="previewMermaidProps"
                    :d2-props="previewD2Props"
                    :infographic-props="previewInfographicProps"
                    :viewport-priority="previewViewportPriority"
                    :batch-rendering="previewBatchRendering"
                    :typewriter="typewriter"
                    :code-block-stream="codeBlockStream"
                    :max-live-nodes="previewMaxLiveNodes"
                    :live-node-buffer="previewLiveNodeBuffer"
                    :initial-render-batch-size="previewInitialRenderBatchSize"
                    :render-batch-size="previewRenderBatchSize"
                    :render-batch-delay="previewRenderBatchDelay"
                    code-block-dark-theme="vitesse-dark"
                    code-block-light-theme="vitesse-light"
                    :code-block-monaco-options="testPageMonacoOptions"
                    :parse-options="previewParseOptions"
                    :debug-performance="isBenchmarkMode"
                  />

                  <div
                    v-if="!isBenchmarkMode"
                    class="preview-annotation-layer"
                    :class="{ 'preview-annotation-layer--visible': annotationOverlayVisible }"
                  >
                    <svg
                      ref="annotationDrawSvgRef"
                      class="preview-annotation-layer__svg preview-annotation-layer__svg--draw"
                      :class="{
                        'preview-annotation-layer__svg--interactive': annotationDrawInteractive,
                        'preview-annotation-layer__svg--selectable': annotationDrawSelectable,
                      }"
                      @pointerdown.capture="startDrawSelection"
                    />
                    <div
                      v-if="annotationTextInteractive"
                      class="preview-annotation-layer__text-hitarea"
                      @pointerdown="startTextAnnotation"
                    />
                    <svg
                      class="preview-annotation-layer__svg preview-annotation-layer__svg--text"
                      :viewBox="`0 0 ${annotationStageWidth || 1} ${annotationStageHeight || 1}`"
                      :width="annotationStageWidth || 1"
                      :height="annotationStageHeight || 1"
                    >
                      <g
                        v-for="annotationText in annotationTextItems"
                        :key="annotationText.id"
                        class="preview-annotation-text-item"
                        :data-annotation-id="annotationText.id"
                        :class="{
                          'preview-annotation-text-item--interactive': annotationTextLayerInteractive,
                          'preview-annotation-text-item--dragging': annotationSelectionTransform?.targets.some(target => target.kind === 'text' && target.id === annotationText.id),
                        }"
                        @pointerdown="startTextSelection(annotationText, $event)"
                        @dblclick="editTextAnnotation(annotationText, $event)"
                      >
                        <text
                          :x="annotationText.x"
                          :y="annotationText.y"
                          :fill="annotationText.color"
                          :font-size="annotationText.fontSize"
                          font-weight="700"
                          :stroke="annotationTextOutline"
                          stroke-linejoin="round"
                          paint-order="stroke"
                          stroke-width="8"
                        >
                          <tspan
                            v-for="(line, index) in annotationTextLines(annotationText.content)"
                            :key="`${annotationText.id}-${index}`"
                            :x="annotationText.x"
                            :dy="index === 0 ? 0 : annotationText.fontSize * 1.35"
                          >
                            {{ line }}
                          </tspan>
                        </text>
                      </g>
                    </svg>

                    <div
                      v-if="annotationSelectionVisible"
                      class="preview-annotation-selection"
                    >
                      <div
                        v-if="annotationSelectionBox && !annotationSingleArrowSelection"
                        class="preview-annotation-selection__frame"
                        :style="annotationSelectionFrameStyle()"
                        @pointerdown="startSelectedAnnotationMove"
                        @dblclick.stop="editSelectedTextAnnotation($event)"
                      >
                        <template v-if="annotationSelectionCanResize">
                          <button
                            v-for="handle in ANNOTATION_RESIZE_HANDLES"
                            :key="handle"
                            type="button"
                            class="preview-annotation-selection__handle"
                            :class="`preview-annotation-selection__handle--${handle}`"
                            :style="annotationResizeHandleStyle(handle)"
                            @pointerdown="startSelectedAnnotationResize(handle, $event)"
                          />
                        </template>
                      </div>

                      <template v-else-if="annotationArrowSelectionLine">
                        <div
                          class="preview-annotation-selection__arrow"
                          :style="annotationArrowSelectionStyle"
                        />
                        <button
                          type="button"
                          class="preview-annotation-selection__handle preview-annotation-selection__handle--arrow"
                          :style="annotationArrowHandleStyle('start')"
                          @pointerdown="startSelectedArrowHandle('start', $event)"
                        />
                        <button
                          type="button"
                          class="preview-annotation-selection__handle preview-annotation-selection__handle--arrow"
                          :style="annotationArrowHandleStyle('end')"
                          @pointerdown="startSelectedArrowHandle('end', $event)"
                        />
                      </template>

                      <div
                        v-if="annotationSelectionActionsVisible"
                        class="preview-annotation-selection__actions"
                        :style="annotationSelectionActionsStyle()"
                        @pointerdown.stop
                      >
                        <div v-if="annotationCanAlign" class="preview-annotation-selection__action-group">
                          <button
                            v-for="alignOption in ANNOTATION_ALIGN_OPTIONS"
                            :key="alignOption.id"
                            type="button"
                            class="preview-annotation-selection__action"
                            :title="alignOption.label"
                            @click.stop="alignSelectedAnnotations(alignOption.id)"
                          >
                            {{ alignOption.shortLabel }}
                          </button>
                        </div>
                        <div class="preview-annotation-selection__action-group">
                          <button
                            type="button"
                            class="preview-annotation-selection__action"
                            @click.stop="bringSelectedAnnotationToFront"
                          >
                            置顶
                          </button>
                          <button
                            type="button"
                            class="preview-annotation-selection__action"
                            @click.stop="duplicateSelectedAnnotation"
                          >
                            复制
                          </button>
                          <button
                            type="button"
                            class="preview-annotation-selection__action preview-annotation-selection__action--danger"
                            @click.stop="deleteSelectedAnnotation"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>

                    <div
                      v-if="annotationTextDraft"
                      class="preview-annotation-text-editor"
                      :style="annotationTextEditorStyle()"
                      @pointerdown.stop.prevent="suppressNextTextAnnotationPlacement()"
                      @pointerup.stop.prevent
                      @click.stop
                    >
                      <textarea
                        ref="annotationTextInputRef"
                        v-model="annotationTextDraft.content"
                        class="preview-annotation-text-editor__input"
                        :placeholder="annotationTextDraft.id ? '编辑标注文字' : '输入标注文字'"
                        @keydown.esc.prevent="cancelTextAnnotationDraft"
                        @keydown.meta.enter.prevent="commitTextAnnotationDraft"
                        @keydown.ctrl.enter.prevent="commitTextAnnotationDraft"
                      />
                      <div class="preview-annotation-text-editor__actions">
                        <button
                          type="button"
                          class="preview-annotation-chip"
                          @pointerdown.stop.prevent="suppressNextTextAnnotationPlacement()"
                          @pointerup.stop.prevent
                          @click.stop.prevent="suppressNextTextAnnotationPlacement(); cancelTextAnnotationDraft()"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          class="preview-annotation-chip preview-annotation-chip--active"
                          @pointerdown.stop.prevent="suppressNextTextAnnotationPlacement()"
                          @pointerup.stop.prevent
                          @click.stop.prevent="suppressNextTextAnnotationPlacement(); commitTextAnnotationDraft()"
                        >
                          {{ annotationTextDraft.id ? '保存文字' : '添加文字' }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer v-if="!isSharePreviewMode" class="workspace-card__foot">
              <span>{{ previewContent.length }} chars rendered</span>
              <span>{{ isStreaming ? (isPaused ? '流式已暂停' : '正在逐步追加中') : '已显示完整输入' }}</span>
            </footer>
          </article>

          <article v-if="!isSharePreviewMode && streamDebug && streamChunks.length" class="workspace-card workspace-card--full workspace-card--debug">
            <header class="workspace-card__head">
              <div>
                <h2>Chunk Debug</h2>
                <p>逐块查看 delay、slice 内容和累计节奏。</p>
              </div>
              <span class="mini-pill">{{ streamChunks.length }} chunks</span>
            </header>

            <div class="chunk-log">
              <div v-for="chunk in streamChunks" :key="chunk.index" class="chunk-log__row">
                <strong>#{{ chunk.index }}</strong>
                <span>{{ chunk.delay }}ms</span>
                <code>{{ JSON.stringify(chunk.content) }}</code>
              </div>
            </div>
          </article>

          <article v-if="!isBenchmarkMode && !isSharePreviewMode" class="workspace-card workspace-card--full workspace-card--sandbox-preview">
            <header class="workspace-card__head">
              <div>
                <h2>版本沙箱预览</h2>
                <p>独立 iframe，真正按 framework 与版本重新挂载渲染器。</p>
              </div>
              <span class="mini-pill" :class="{ 'mini-pill--active': !sandboxDirty }">
                {{ sandboxStatusLabel }}
              </span>
            </header>

            <div class="sandbox-frame-shell">
              <iframe
                :key="sandboxFrameKey"
                class="sandbox-frame"
                :src="sandboxHref"
                title="Markstream version sandbox"
                loading="lazy"
              />
            </div>

            <footer class="workspace-card__foot">
              <span>{{ sandboxPackageLabel }}</span>
              <span>{{ sandboxDirty ? '等待手动同步' : '已加载当前输入快照' }}</span>
            </footer>
          </article>
        </section>
      </div>

      <dialog
        v-if="!isSharePreviewMode"
        ref="streamSettingsDialogRef"
        class="settings-dialog"
      >
        <div class="settings-dialog__panel">
          <header class="settings-dialog__head">
            <div>
              <h2>流式详细设置</h2>
              <p>这里调整 transport、窗口、开关项和代码块渲染策略。</p>
            </div>
            <button type="button" class="ghost-button" @click="closeStreamSettingsDialog">
              关闭
            </button>
          </header>

          <div class="control-stack control-stack--stream">
            <LabSelect
              v-model="streamTransportMode"
              label="Transport"
              :options="STREAM_TRANSPORT_OPTIONS"
            />

            <LabSelect
              v-model="streamSliceMode"
              label="Slice Mode"
              :options="STREAM_SLICE_OPTIONS"
            />

            <LabSelect
              v-model="selectedStreamPresetId"
              label="流式画像 preset"
              :options="streamPresetOptions"
            />

            <p class="control-note">
              {{ streamPresetDescription }}
            </p>

            <label class="range-control">
              <span>chunkSizeMin</span>
              <strong>{{ normalizedChunkSizeRange.min }}</strong>
              <input v-model.number="streamChunkSizeMin" type="range" min="1" max="80" step="1">
            </label>

            <label class="range-control">
              <span>chunkSizeMax</span>
              <strong>{{ normalizedChunkSizeRange.max }}</strong>
              <input v-model.number="streamChunkSizeMax" type="range" min="1" max="80" step="1">
            </label>

            <label class="range-control">
              <span>chunkDelayMin</span>
              <strong>{{ normalizedChunkDelayRange.min }}ms</strong>
              <input v-model.number="streamChunkDelayMin" type="range" min="8" max="600" step="4">
            </label>

            <label class="range-control">
              <span>chunkDelayMax</span>
              <strong>{{ normalizedChunkDelayRange.max }}ms</strong>
              <input v-model.number="streamChunkDelayMax" type="range" min="8" max="600" step="4">
            </label>

            <label class="range-control">
              <span>突发/停顿强度</span>
              <strong>{{ streamBurstiness }}%</strong>
              <input v-model.number="streamBurstiness" type="range" min="0" max="100" step="1">
            </label>

            <p class="control-note">
              当前窗口：{{ streamChunkRangeLabel }}，{{ streamDelayRangeLabel }}。当 min=max 时就是固定节奏。
            </p>

            <p class="control-note">
              `Pure Random` 会直接按随机长度做原始 `slice`；`Boundary Aware` 会尽量贴近单词或标点边界。
            </p>

            <p class="control-note">
              `ReadableStream` 更接近真实 reader 消费链路；`Scheduler` 保留我们本地定时调度模型。burstiness 只会影响非纯随机调度。
            </p>

            <div class="toggle-grid">
              <label class="toggle-item">
                <span>代码块流式渲染</span>
                <input v-model="codeBlockStream" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>viewportPriority</span>
                <input v-model="viewportPriority" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>batchRendering</span>
                <input v-model="batchRendering" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>typewriter</span>
                <input v-model="typewriter" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>KaTeX</span>
                <input v-model="mathEnabled" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>Mermaid</span>
                <input v-model="mermaidEnabled" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>解析树 debug</span>
                <input v-model="debugParse" type="checkbox">
              </label>
              <label class="toggle-item">
                <span>chunk debug</span>
                <input v-model="streamDebug" type="checkbox">
              </label>
            </div>

            <LabSelect
              v-model="renderMode"
              label="代码块模式"
              :options="RENDER_MODE_OPTIONS"
            />
          </div>
        </div>
      </dialog>
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   Test Lab — Redesigned UI
   ═══════════════════════════════════════════════════════════ */

.test-lab {
  --lab-bg: #f5f7f6;
  --lab-surface: rgba(255, 255, 255, 0.78);
  --lab-surface-strong: rgba(255, 255, 255, 0.92);
  --lab-border: rgba(15, 23, 42, 0.07);
  --lab-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 24px 64px rgba(15, 23, 42, 0.08);
  --lab-text: #0f172a;
  --lab-muted: #64748b;
  --lab-accent: #0f766e;
  --lab-accent-soft: rgba(15, 118, 110, 0.12);
  --lab-accent-gradient: linear-gradient(135deg, #0f766e, #0891b2);
  --lab-radius: 20px;
  --lab-radius-sm: 12px;
  --workspace-pane-height: clamp(540px, 72vh, 880px);
  font-family: 'Avenir Next', 'SF Pro Display', 'Segoe UI', sans-serif;
  position: relative;
  min-height: 100vh;
  padding: 24px 20px 48px;
  background:
    radial-gradient(circle at 6% 8%, rgba(15, 118, 110, 0.12), transparent 42%),
    radial-gradient(circle at 92% 84%, rgba(245, 158, 11, 0.1), transparent 46%),
    var(--lab-bg);
  color: var(--lab-text);
  color-scheme: light;
  overflow: hidden;
}

.test-lab--dark {
  --lab-bg: #0b1120;
  --lab-surface: rgba(15, 23, 42, 0.7);
  --lab-surface-strong: rgba(15, 23, 42, 0.88);
  --lab-border: rgba(148, 163, 184, 0.1);
  --lab-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 24px 64px rgba(0, 0, 0, 0.3);
  --lab-text: #e2e8f0;
  --lab-muted: #94a3b8;
  --lab-accent: #22d3ee;
  --lab-accent-soft: rgba(34, 211, 238, 0.14);
  --lab-accent-gradient: linear-gradient(135deg, #0ea5e9, #14b8a6);
  color-scheme: dark;
  background: var(--lab-bg);
}

.test-lab::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.5;
  background-image: linear-gradient(rgba(15, 23, 42, 0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.022) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: radial-gradient(circle at 52% 34%, rgba(0, 0, 0, 0.95), transparent 82%);
}

.test-lab--dark::before {
  opacity: 0.2;
  background-image: linear-gradient(rgba(148, 163, 184, 0.065) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.065) 1px, transparent 1px);
}

.test-lab--share-preview {
  padding: 0;
}

/* ─── Background Glows ─── */
.test-lab__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  pointer-events: none;
}

.test-lab__glow--1 {
  top: -80px;
  left: -60px;
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #0f766e, #14b8a6);
  opacity: 0.12;
}

.test-lab__glow--2 {
  right: -40px;
  bottom: 20%;
  width: 350px;
  height: 350px;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  opacity: 0.1;
}

.test-lab__glow--3 {
  top: 50%;
  left: 40%;
  width: 300px;
  height: 300px;
  background: linear-gradient(135deg, #06b6d4, #0ea5e9);
  opacity: 0.06;
}

.test-lab--dark .test-lab__glow--1 { opacity: 0.08; }
.test-lab--dark .test-lab__glow--2 { opacity: 0.06; }
.test-lab--dark .test-lab__glow--3 { opacity: 0.04; }

/* ─── Shell ─── */
.test-lab__shell {
  position: relative;
  z-index: 1;
  max-width: 1480px;
  margin: 0 auto;
  display: grid;
  gap: 20px;
}

.test-lab__shell--share-preview {
  max-width: none;
  min-height: 100vh;
  gap: 0;
}

/* ─── Shared Card Chrome ─── */
.hero-panel,
.panel-card,
.workspace-card {
  background: var(--lab-surface);
  border: 1px solid var(--lab-border);
  border-radius: var(--lab-radius);
  box-shadow: var(--lab-shadow);
  backdrop-filter: blur(16px) saturate(1.4);
}

/* ─── Hero Panel ─── */
.hero-panel {
  position: relative;
  overflow: hidden;
  padding: 24px;
  display: grid;
  gap: 16px;
  animation: panel-rise 0.42s ease both;
}

@keyframes panel-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--lab-accent-gradient);
  border-radius: var(--lab-radius) var(--lab-radius) 0 0;
}

.hero-panel::after {
  content: '';
  position: absolute;
  inset: auto -10% -50% auto;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(15, 118, 110, 0.12), transparent 65%);
  pointer-events: none;
}

.hero-panel__copy,
.hero-panel__actions {
  display: grid;
  gap: 10px;
  align-content: start;
}

.hero-panel__action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.hero-panel__action-row .action-button:first-child {
  grid-column: 1 / -1;
}

.hero-panel__action-row .action-button,
.hero-panel__actions .info-banner {
  padding-block: 10px;
}

.hero-panel__status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hero-panel__accent {
  background: var(--lab-accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ─── Eyebrow ─── */
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--lab-accent-soft);
  border: 1px solid rgba(15, 118, 110, 0.2);
  color: var(--lab-accent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.eyebrow__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lab-accent);
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.test-lab--dark .eyebrow {
  background: rgba(14, 165, 233, 0.14);
  border-color: rgba(34, 211, 238, 0.24);
  color: #67e8f9;
}

.hero-panel h1 {
  margin: 0;
  font-size: clamp(1.6rem, 2.8vw, 2.4rem);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.hero-panel p {
  margin: 0;
  max-width: 720px;
  color: var(--lab-muted);
  font-size: 0.88rem;
  line-height: 1.6;
}

/* ─── Metrics ─── */
.hero-panel__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.metric-card {
  padding: 12px 14px;
  border-radius: var(--lab-radius-sm);
  background: var(--lab-surface-strong);
  border: 1px solid var(--lab-border);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.metric-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 28px rgba(15, 118, 110, 0.1);
}

.metric-card span {
  display: block;
  color: var(--lab-muted);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}

.metric-card strong {
  font-size: 1.1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ─── Framework Switcher ─── */
.framework-switcher {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.framework-chip {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px;
  border-radius: var(--lab-radius-sm);
  border: 1px solid var(--lab-border);
  background: var(--lab-surface-strong);
  color: inherit;
  text-decoration: none;
  transition: all 0.2s ease;
}

.framework-chip:hover {
  transform: translateY(-2px);
  border-color: rgba(15, 118, 110, 0.3);
  box-shadow: 0 12px 32px rgba(15, 118, 110, 0.12);
}

.framework-chip--current {
  border-color: rgba(15, 118, 110, 0.35);
  background: var(--lab-accent-soft);
}

.framework-chip--current::before {
  content: '';
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--lab-accent);
  margin-bottom: 4px;
}

.test-lab--dark .metric-card,
.test-lab--dark .framework-chip,
.test-lab--dark .sample-card,
.test-lab--dark .range-control,
.test-lab--dark .select-control,
.test-lab--dark .toggle-item,
.test-lab--dark .text-control,
.test-lab--dark .segmented-control__button,
.test-lab--dark .preset-chip {
  background: rgba(15, 23, 42, 0.65);
  border-color: rgba(148, 163, 184, 0.1);
}

.test-lab--dark .framework-chip--current,
.test-lab--dark .sample-card--active,
.test-lab--dark .segmented-control__button--active,
.test-lab--dark .preset-chip--active {
  background: rgba(34, 211, 238, 0.16);
  border-color: rgba(34, 211, 238, 0.3);
  color: #67e8f9;
}

.framework-chip__label {
  font-weight: 700;
  font-size: 0.95rem;
}

.framework-chip__note {
  color: var(--lab-muted);
  font-size: 0.8rem;
}

/* ─── Layout ─── */
.lab-layout {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas:
    'workspace'
    'sidebar';
  gap: 20px;
  align-items: start;
}

.lab-layout--share-preview {
  grid-template-areas: 'workspace';
  gap: 0;
}

.lab-sidebar,
.workspace-grid {
  display: grid;
  gap: 16px;
}

.lab-sidebar {
  grid-area: sidebar;
}

.workspace-grid {
  grid-area: workspace;
}

/* ─── Panel Cards ─── */
.panel-card {
  padding: 20px;
}

.panel-card__head,
.workspace-card__head,
.workspace-card__foot,
.progress-meta,
.meta-list__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-card__head {
  flex-wrap: wrap;
}

.panel-card__head h2,
.workspace-card__head h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.panel-card__head p,
.workspace-card__head p,
.workspace-card__foot,
.progress-meta,
.meta-list__row,
.sample-card span {
  margin: 0;
  color: var(--lab-muted);
  font-size: 0.86rem;
  line-height: 1.5;
}

/* ─── Mini Pill ─── */
.mini-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  padding: 5px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid var(--lab-border);
  color: var(--lab-muted);
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
  transition: all 0.18s ease;
}

.mini-pill--active {
  background: var(--lab-accent-soft);
  border-color: rgba(15, 118, 110, 0.24);
  color: var(--lab-accent);
}

.test-lab--dark .mini-pill {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(148, 163, 184, 0.1);
  color: #cbd5e1;
}

.test-lab--dark .mini-pill--active {
  background: rgba(34, 211, 238, 0.16);
  border-color: rgba(34, 211, 238, 0.26);
  color: #67e8f9;
}

/* ─── Sample Cards ─── */
.sample-list,
.control-stack,
.toggle-grid,
.meta-list {
  display: grid;
  gap: 10px;
}

.sample-card {
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--lab-radius-sm);
  border: 1px solid var(--lab-border);
  background: var(--lab-surface-strong);
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sample-card:hover {
  transform: translateY(-1px);
  border-color: rgba(15, 118, 110, 0.25);
  box-shadow: 0 10px 26px rgba(15, 118, 110, 0.12);
}

.sample-card strong {
  display: block;
  margin-bottom: 4px;
  font-size: 0.92rem;
  font-weight: 700;
}

.sample-card--active {
  border-color: rgba(15, 118, 110, 0.32);
  background: var(--lab-accent-soft);
  box-shadow: 0 0 0 1px rgba(15, 118, 110, 0.1);
}

/* ─── Action & Ghost Buttons ─── */
.control-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.control-actions--stream-bar {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.control-actions--stacked {
  margin-top: 12px;
}

.action-button,
.ghost-button {
  border: 0;
  border-radius: var(--lab-radius-sm);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  font-size: 0.84rem;
  transition: all 0.18s ease;
}

.action-button {
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid var(--lab-border);
  color: var(--lab-text);
}

.action-button:hover,
.ghost-button:hover {
  transform: translateY(-1px);
}

.action-button--primary {
  background: var(--lab-accent-gradient);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 8px 24px rgba(15, 118, 110, 0.28);
}

.action-button--primary:hover {
  box-shadow: 0 12px 32px rgba(15, 118, 110, 0.34);
}

.action-button:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
}

.ghost-button {
  padding: 7px 12px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px solid var(--lab-border);
  color: var(--lab-muted);
}

.test-lab--dark .action-button:not(.action-button--primary),
.test-lab--dark .ghost-button {
  background: rgba(30, 41, 59, 0.6);
  border-color: rgba(148, 163, 184, 0.1);
  color: #cbd5e1;
}

/* ─── Progress ─── */
.progress-block {
  margin-top: 14px;
}

.progress-track {
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
}

.test-lab--dark .progress-track {
  background: rgba(51, 65, 85, 0.5);
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--lab-accent-gradient);
  transition: width 0.3s ease;
}

.progress-meta {
  margin-top: 8px;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  font-size: 0.78rem;
}

/* ─── Form Controls ─── */
.range-control,
.select-control,
.toggle-item {
  display: grid;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--lab-radius-sm);
  background: var(--lab-surface-strong);
  border: 1px solid var(--lab-border);
}

.range-control span {
  color: var(--lab-muted);
  font-size: 0.84rem;
}

.toggle-item {
  grid-template-columns: 1fr auto;
  align-items: center;
}

.range-control input[type='range'] {
  width: 100%;
}

.control-note {
  margin: 0;
  padding: 0 4px;
  color: var(--lab-muted);
  font-size: 0.8rem;
  line-height: 1.6;
}

/* ─── Stream Summary ─── */
.stream-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  border-radius: var(--lab-radius-sm);
  padding: 12px 14px;
  background: var(--lab-surface-strong);
  border: 1px solid var(--lab-border);
}

.stream-summary__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.stream-summary__row--dense {
  flex: 1 1 440px;
}

.stream-summary__item {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px solid var(--lab-border);
  color: var(--lab-muted);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}

.stream-summary__item--active {
  background: var(--lab-accent-soft);
  border-color: rgba(15, 118, 110, 0.24);
  color: var(--lab-accent);
}

/* ─── Text Controls ─── */
.text-control {
  display: grid;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--lab-radius-sm);
  background: var(--lab-surface-strong);
  border: 1px solid var(--lab-border);
}

.text-control span {
  color: var(--lab-muted);
  font-size: 0.84rem;
}

.text-control input {
  border: 1px solid var(--lab-border);
  border-radius: 8px;
  padding: 9px 12px;
  background: var(--lab-surface-strong);
  color: var(--lab-text);
  font: inherit;
  font-size: 0.86rem;
}

.text-control input:focus {
  outline: none;
  border-color: var(--lab-accent);
  box-shadow: 0 0 0 3px var(--lab-accent-soft);
}

.test-lab--dark .text-control input {
  background: rgba(15, 23, 42, 0.6);
  border-color: rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
}

/* ─── Segmented & Preset ─── */
.segmented-control {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.segmented-control__button,
.preset-chip {
  border: 1px solid var(--lab-border);
  background: var(--lab-surface-strong);
  color: var(--lab-text);
  border-radius: var(--lab-radius-sm);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  font-size: 0.84rem;
  transition: all 0.18s ease;
}

.segmented-control__button {
  padding: 9px 12px;
}

.preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-chip {
  padding: 7px 12px;
}

.segmented-control__button:hover,
.preset-chip:hover {
  transform: translateY(-1px);
  border-color: rgba(15, 118, 110, 0.24);
}

.segmented-control__button--active,
.preset-chip--active {
  border-color: rgba(15, 118, 110, 0.3);
  background: var(--lab-accent-soft);
  color: var(--lab-accent);
}

.segmented-control__button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.toggle-item input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: var(--lab-accent);
}

/* ─── Meta List ─── */
.meta-list__row {
  gap: 16px;
}

.meta-list__row strong {
  display: inline-block;
  max-width: 60%;
  font-size: 0.82rem;
  color: var(--lab-text);
  line-break: anywhere;
  text-align: right;
}

/* ─── Info Banners ─── */
.info-banner {
  padding: 10px 14px;
  border-radius: var(--lab-radius-sm);
  font-size: 0.84rem;
  line-height: 1.5;
  border: 1px solid transparent;
}

.info-banner--success {
  background: rgba(22, 163, 74, 0.08);
  border-color: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.info-banner--error {
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.info-banner--info {
  background: rgba(15, 118, 110, 0.1);
  border-color: rgba(15, 118, 110, 0.16);
  color: var(--lab-accent);
}

.info-banner--warning {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.test-lab--dark .info-banner--success { color: #4ade80; }
.test-lab--dark .info-banner--error { color: #f87171; }
.test-lab--dark .info-banner--info { color: #a5b4fc; }
.test-lab--dark .info-banner--info { color: #67e8f9; }
.test-lab--dark .info-banner--warning { color: #fbbf24; }

/* ─── Sandbox ─── */
.sandbox-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.panel-card--sandbox {
  display: grid;
  gap: 12px;
}

.panel-card--sandbox .panel-card__head {
  align-items: center;
}

.panel-card--sandbox .control-stack {
  gap: 10px;
}

.panel-card--sandbox .select-control,
.panel-card--sandbox .text-control,
.panel-card--sandbox .toggle-item {
  padding: 10px 12px;
}

.panel-card--sandbox .segmented-control__button,
.panel-card--sandbox .preset-chip {
  border-radius: 10px;
}

.panel-card--sandbox .control-actions {
  margin-top: 0;
}

.panel-card--sandbox .meta-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.panel-card--sandbox .meta-list__row {
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--lab-surface-strong);
  border: 1px solid var(--lab-border);
}

.panel-card--sandbox .info-banner {
  padding: 8px 12px;
  font-size: 0.82rem;
}

/* ─── Workspace Area ─── */
.workspace-card__head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 10px;
}

.icon-button__icon {
  width: 17px;
  height: 17px;
}

.workspace-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workspace-grid--share-preview {
  grid-template-columns: 1fr;
  gap: 0;
}

.workspace-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 760px;
}

.workspace-card--full {
  grid-column: 1 / -1;
  min-height: 720px;
}

.workspace-card--pane {
  height: var(--workspace-pane-height);
  min-height: var(--workspace-pane-height);
  max-height: var(--workspace-pane-height);
  overflow: hidden;
}

.workspace-card--preview {
  position: relative;
}

.workspace-card--sandbox-preview {
  min-height: 640px;
}

.workspace-card--sandbox-preview .workspace-card__head,
.workspace-card--sandbox-preview .workspace-card__foot {
  padding: 14px 18px;
}

.workspace-card--share-preview {
  grid-template-rows: minmax(0, 1fr);
  min-height: 100vh;
  height: 100vh;
  max-height: none;
  border-radius: 0;
  border: 0;
  box-shadow: none;
  overflow: hidden;
  color-scheme: light;
}

.workspace-card--share-preview.workspace-card--preview-dark {
  color-scheme: dark;
}

/* ─── Immersive Preview Shell ─── */
.preview-immersive-shell {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 8;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  min-height: calc(96px + env(safe-area-inset-bottom, 0px));
  padding: 0 16px calc(12px + env(safe-area-inset-bottom, 0px));
}

.preview-immersive-toolbar {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 20px;
  border: 1px solid var(--lab-border);
  background: var(--lab-surface);
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(20px) saturate(1.4);
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition: all 0.2s ease;
}

.preview-immersive-toolbar__button {
  padding-inline: 14px;
}

.preview-immersive-toolbar__icon {
  text-decoration: none;
}

/* ─── Annotation UI ─── */
.preview-annotation-toolbar {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.preview-annotation-toolbar__hint {
  padding: 0 10px;
  color: var(--lab-muted);
  font-size: 0.78rem;
  line-height: 1.2;
  white-space: nowrap;
}

.preview-annotation-toolbar__group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.preview-annotation-toolbar__group--colors {
  gap: 4px;
}

.preview-annotation-chip,
.preview-annotation-swatch {
  border: 1px solid var(--lab-border);
  background: var(--lab-surface-strong);
  color: var(--lab-text);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  font-size: 0.8rem;
  transition: all 0.18s ease;
}

.preview-annotation-chip {
  min-height: 34px;
  padding: 0 10px;
}

.preview-annotation-chip:hover,
.preview-annotation-swatch:hover {
  transform: translateY(-1px);
}

.preview-annotation-chip--active {
  border-color: rgba(15, 118, 110, 0.3);
  background: var(--lab-accent-soft);
  color: var(--lab-accent);
}

.preview-annotation-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.preview-annotation-swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  background: var(--annotation-swatch);
}

.preview-annotation-swatch--active {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 0 4px var(--annotation-swatch);
}

.workspace-card--share-preview .preview-immersive-shell:hover .preview-immersive-toolbar,
.workspace-card--share-preview .preview-immersive-shell:focus-within .preview-immersive-toolbar,
.workspace-card--preview:fullscreen .preview-immersive-shell:hover .preview-immersive-toolbar,
.workspace-card--preview:fullscreen .preview-immersive-shell:focus-within .preview-immersive-toolbar,
.workspace-card--share-preview:focus-within .preview-immersive-toolbar,
.workspace-card--preview:fullscreen:focus-within .preview-immersive-toolbar {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

/* ─── Workspace Card Heads ─── */
.workspace-card__head,
.workspace-card__foot {
  padding: 16px 20px;
  border-bottom: 1px solid var(--lab-border);
}

.workspace-card__foot {
  border-top: 1px solid var(--lab-border);
  border-bottom: 0;
}

.editor-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  height: 100%;
  padding: 14px;
  gap: 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent 22%);
}

.editor-shell__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--lab-border);
  background: var(--lab-surface-strong);
}

.editor-shell__title-group,
.editor-shell__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.editor-shell__traffic {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  box-shadow: 12px 0 0 #22c55e, 24px 0 0 #0ea5e9;
}

.editor-shell__title-group .editor-shell__traffic + .editor-shell__traffic,
.editor-shell__title-group .editor-shell__traffic + .editor-shell__traffic + .editor-shell__traffic {
  display: none;
}

.editor-shell__filename {
  margin-left: 28px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--lab-text);
}

.editor-shell__meta-item {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid var(--lab-border);
  color: var(--lab-muted);
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ─── Editor ─── */
.editor-textarea {
  width: 100%;
  min-height: 0;
  height: 100%;
  padding: 20px;
  border: 1px solid var(--lab-border);
  border-radius: 18px;
  resize: none;
  background: linear-gradient(180deg, var(--lab-surface-strong), rgba(255, 255, 255, 0.82));
  color: var(--lab-text);
  font: 500 0.9rem/1.7 "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.34);
}

.editor-textarea:focus {
  outline: none;
}

.editor-textarea::placeholder {
  color: var(--lab-muted);
  opacity: 0.6;
}

/* ─── Preview Surface ─── */
.preview-surface {
  position: relative;
  min-height: 560px;
  padding: 20px;
  overflow: auto;
  box-sizing: border-box;
  background: var(--lab-surface-strong);
}

.preview-surface__grid {
  position: absolute;
  inset: 20px;
  border-radius: 20px;
  pointer-events: none;
  background-image: linear-gradient(rgba(15, 23, 42, 0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.028) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.12));
}

.preview-stage-frame {
  position: relative;
  min-height: 100%;
  padding: clamp(18px, 2vw, 26px);
  border-radius: 20px;
  border: 1px solid var(--lab-border);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.72));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.preview-stage {
  position: relative;
  min-height: 100%;
}

/* ─── Annotation Layer ─── */
.preview-annotation-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.preview-annotation-layer--visible {
  opacity: 1;
}

.preview-annotation-layer__svg,
.preview-annotation-layer__text-hitarea {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.preview-annotation-layer__svg {
  overflow: visible;
}

.preview-annotation-layer__svg--draw,
.preview-annotation-layer__text-hitarea {
  pointer-events: none;
}

.preview-annotation-layer__svg--interactive,
.preview-annotation-layer__svg--selectable,
.preview-annotation-layer__text-hitarea {
  pointer-events: auto;
  touch-action: none;
}

.preview-annotation-layer__text-hitarea {
  cursor: text;
}

.preview-annotation-layer__svg--interactive {
  cursor: crosshair;
}

.preview-annotation-layer__svg--selectable {
  cursor: default;
}

.preview-annotation-layer__svg--text {
  pointer-events: none;
}

.preview-annotation-text-item {
  pointer-events: none;
}

.preview-annotation-text-item--interactive {
  pointer-events: all;
  cursor: grab;
}

.preview-annotation-text-item--dragging {
  cursor: grabbing;
}

/* ─── Annotation Selection ─── */
.preview-annotation-selection {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
}

.preview-annotation-selection__frame {
  position: absolute;
  border: 2px dashed rgba(99, 102, 241, 0.6);
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.06);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7);
  pointer-events: auto;
  cursor: move;
}

.preview-annotation-selection__arrow {
  position: absolute;
  height: 2px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.8);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7);
  transform-origin: 0 50%;
}

.preview-annotation-selection__handle {
  position: absolute;
  width: 12px;
  height: 12px;
  padding: 0;
  appearance: none;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  background: var(--lab-accent);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
  transform: translate(-50%, -50%);
  pointer-events: auto;
}

.preview-annotation-selection__handle--nw,
.preview-annotation-selection__handle--se {
  cursor: nwse-resize;
}

.preview-annotation-selection__handle--ne,
.preview-annotation-selection__handle--sw {
  cursor: nesw-resize;
}

.preview-annotation-selection__handle--arrow {
  cursor: move;
}

.preview-annotation-selection__actions {
  position: absolute;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  max-width: min(344px, calc(100vw - 24px));
  padding: 6px;
  border: 1px solid var(--lab-border);
  border-radius: 14px;
  background: var(--lab-surface);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(16px);
  pointer-events: auto;
}

.preview-annotation-selection__action-group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.preview-annotation-selection__action {
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.04);
  color: var(--lab-text);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  transition: all 0.18s ease;
}

.preview-annotation-selection__action:hover {
  transform: translateY(-1px);
  background: var(--lab-accent-soft);
  color: var(--lab-accent);
}

.preview-annotation-selection__action--danger:hover {
  background: rgba(220, 38, 38, 0.08);
  color: #dc2626;
}

/* ─── Annotation Text Editor ─── */
.preview-annotation-text-editor {
  position: absolute;
  z-index: 7;
  pointer-events: auto;
  width: 220px;
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--lab-border);
  background: var(--lab-surface);
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(16px);
}

.preview-annotation-text-editor__input {
  width: 100%;
  min-height: 80px;
  border: 0;
  resize: none;
  background: transparent;
  color: var(--lab-text);
  font: 600 0.88rem/1.5 "IBM Plex Sans", "Helvetica Neue", sans-serif;
}

.preview-annotation-text-editor__input:focus {
  outline: none;
}

.preview-annotation-text-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

/* ─── Pane sizes ─── */
.workspace-card--pane .editor-textarea,
.workspace-card--pane .preview-surface {
  min-height: 0;
  height: 100%;
}

.workspace-card--share-preview .workspace-card__head,
.workspace-card--share-preview .workspace-card__foot {
  padding-left: min(4vw, 32px);
  padding-right: min(4vw, 32px);
}

.workspace-card--share-preview .preview-surface {
  min-height: 100vh;
  height: 100%;
  padding: 32px min(5vw, 48px) max(156px, calc(128px + env(safe-area-inset-bottom, 0px)));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/* ─── Settings Dialog ─── */
.settings-dialog {
  width: min(980px, calc(100vw - 32px));
  max-width: 100%;
  max-height: calc(100vh - 32px);
  margin: auto;
  padding: 0;
  border: 0;
  background: transparent;
  overflow: visible;
}

.settings-dialog::backdrop {
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
}

.settings-dialog__panel {
  display: grid;
  gap: 16px;
  padding: 22px;
  border-radius: var(--lab-radius);
  background: var(--lab-surface);
  border: 1px solid var(--lab-border);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.15);
  backdrop-filter: blur(16px);
}

.settings-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.settings-dialog__head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.settings-dialog__head p {
  margin: 6px 0 0;
  color: var(--lab-muted);
  font-size: 0.88rem;
  line-height: 1.5;
}

/* ─── Dark Mode Overrides ─── */
.test-lab--dark .editor-textarea {
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.78), rgba(15, 23, 42, 0.7));
  border-color: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.test-lab--dark .editor-shell__toolbar,
.test-lab--dark .preview-stage-frame,
.workspace-card--preview-dark .preview-stage-frame {
  background: rgba(15, 23, 42, 0.72);
  border-color: rgba(148, 163, 184, 0.1);
}

.test-lab--dark .editor-shell__meta-item {
  background: rgba(30, 41, 59, 0.72);
  border-color: rgba(148, 163, 184, 0.1);
  color: #cbd5e1;
}

.test-lab--dark .preview-surface__grid,
.workspace-card--preview-dark .preview-surface__grid {
  background-image: linear-gradient(rgba(148, 163, 184, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.055) 1px, transparent 1px);
}

.test-lab--dark .preview-immersive-toolbar {
  border-color: rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.85);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
}

.test-lab--dark .preview-annotation-chip,
.test-lab--dark .preview-annotation-text-editor {
  border-color: rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.85);
  color: #e2e8f0;
}

.test-lab--dark .preview-annotation-toolbar__hint {
  color: rgba(226, 232, 240, 0.6);
}

.test-lab--dark .preview-annotation-chip--active {
  background: rgba(34, 211, 238, 0.16);
  border-color: rgba(34, 211, 238, 0.25);
  color: #67e8f9;
}

.test-lab--dark .preview-annotation-selection__frame {
  border-color: rgba(34, 211, 238, 0.72);
  background: rgba(34, 211, 238, 0.12);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.8);
}

.test-lab--dark .preview-annotation-selection__arrow {
  background: rgba(34, 211, 238, 0.88);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.8);
}

.test-lab--dark .preview-annotation-selection__handle {
  border-color: rgba(15, 23, 42, 0.9);
  background: #22d3ee;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}

.test-lab--dark .preview-annotation-selection__actions {
  border-color: rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.88);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}

.test-lab--dark .preview-annotation-selection__action {
  background: rgba(148, 163, 184, 0.08);
  color: #e2e8f0;
}

.test-lab--dark .preview-annotation-selection__action:hover {
  background: rgba(34, 211, 238, 0.16);
  color: #67e8f9;
}

.test-lab--dark .preview-annotation-selection__action--danger:hover {
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
}

.test-lab--dark .preview-annotation-text-editor__input {
  color: #e2e8f0;
}

.test-lab--dark .preview-surface,
.workspace-card--preview-dark .preview-surface {
  background: rgba(2, 6, 23, 0.8);
}

.test-lab--dark .stream-summary {
  background: rgba(15, 23, 42, 0.6);
  border-color: rgba(148, 163, 184, 0.1);
}

.test-lab--dark .stream-summary__item {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(148, 163, 184, 0.1);
}

.test-lab--dark .stream-summary__item--active {
  background: rgba(34, 211, 238, 0.16);
  border-color: rgba(34, 211, 238, 0.26);
  color: #67e8f9;
}

.test-lab--dark .panel-card--sandbox .meta-list__row {
  background: rgba(15, 23, 42, 0.65);
  border-color: rgba(148, 163, 184, 0.1);
}

/* ─── Fullscreen ─── */
.workspace-card--preview:fullscreen {
  width: 100%;
  height: 100%;
  max-width: none;
  min-height: 100vh;
  box-sizing: border-box;
  border-radius: 0;
  border: 0;
  box-shadow: none;
  overflow: hidden;
  background: #fff;
  color: #10203a;
  color-scheme: light;
}

.workspace-card--preview:fullscreen::backdrop {
  background: rgba(15, 23, 42, 0.7);
}

.workspace-card--preview:fullscreen .workspace-card__head,
.workspace-card--preview:fullscreen .workspace-card__foot {
  display: none;
}

.workspace-card--preview:fullscreen .preview-surface {
  min-height: 100vh;
  height: 100%;
  padding: 40px min(6vw, 72px) max(164px, calc(132px + env(safe-area-inset-bottom, 0px)));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
  background: #fff;
}

.test-lab--dark .workspace-card--preview:fullscreen,
.workspace-card--preview.workspace-card--preview-dark:fullscreen {
  background: #020617;
  color: #e2e8f0;
  color-scheme: dark;
}

.test-lab--dark .workspace-card--preview:fullscreen .preview-surface,
.workspace-card--preview.workspace-card--preview-dark:fullscreen .preview-surface {
  background: #020617;
}

/* ─── Sandbox Frame ─── */
.sandbox-frame-shell {
  min-height: 620px;
  background: var(--lab-surface-strong);
}

.test-lab--dark .sandbox-frame-shell {
  background: rgba(2, 6, 23, 0.8);
}

.sandbox-frame {
  display: block;
  width: 100%;
  min-height: 620px;
  border: 0;
  background: transparent;
}

/* ─── Markdown Renderer ─── */
.preview-surface :deep(.markdown-renderer) {
  min-height: 100%;
}

.workspace-card--share-preview .preview-surface :deep(.markdown-renderer),
.workspace-card--preview:fullscreen .preview-surface :deep(.markdown-renderer) {
  width: min(100%, 820px);
  margin: 0 auto;
  content-visibility: visible;
  contain-intrinsic-size: none;
}

.workspace-card--share-preview .preview-surface :deep(img),
.workspace-card--share-preview .preview-surface :deep(svg),
.workspace-card--share-preview .preview-surface :deep(canvas),
.workspace-card--share-preview .preview-surface :deep(video),
.workspace-card--preview:fullscreen .preview-surface :deep(img),
.workspace-card--preview:fullscreen .preview-surface :deep(svg),
.workspace-card--preview:fullscreen .preview-surface :deep(canvas),
.workspace-card--preview:fullscreen .preview-surface :deep(video) {
  max-width: 100%;
}

/* ─── Print ─── */
@media print {
  .test-lab {
    padding: 0;
    background: #fff !important;
  }

  .test-lab__glow,
  .hero-panel,
  .lab-sidebar,
  .workspace-card--editor,
  .workspace-card--sandbox-preview,
  .workspace-card--debug,
  .workspace-card__head,
  .workspace-card__foot,
  .preview-immersive-shell,
  .preview-annotation-text-editor {
    display: none !important;
  }

  .lab-layout,
  .workspace-grid {
    display: block;
  }

  .workspace-card--preview,
  .workspace-card--share-preview,
  .workspace-card--preview:fullscreen {
    min-height: auto;
    height: auto;
    max-height: none;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: #fff !important;
  }

  .preview-surface,
  .workspace-card--share-preview .preview-surface,
  .workspace-card--preview:fullscreen .preview-surface {
    min-height: auto;
    height: auto;
    overflow: visible !important;
    padding: 0 !important;
    background: #fff !important;
  }
}

/* ─── Desktop Layout (>1181px) ─── */
@media (min-width: 1181px) {
  .lab-layout:not(.lab-layout--share-preview) {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-template-areas: none;
  }

  .lab-layout:not(.lab-layout--share-preview) .lab-sidebar,
  .lab-layout:not(.lab-layout--share-preview) .workspace-grid {
    display: contents;
  }

  .panel-card--samples {
    order: 1;
    grid-column: 1 / -1;
  }

  .panel-card--stream {
    order: 2;
    grid-column: 1 / -1;
  }

  .workspace-card--editor {
    order: 3;
    grid-column: 1 / 7;
  }

  .workspace-card--preview:not(.workspace-card--share-preview) {
    order: 4;
    grid-column: 7 / -1;
  }

  .panel-card--sandbox {
    order: 5;
    grid-column: 1 / 5;
  }

  .workspace-card--sandbox-preview {
    order: 6;
    grid-column: 5 / -1;
  }

  .workspace-card--debug {
    order: 7;
    grid-column: 1 / -1;
  }

  .hero-panel {
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.95fr);
    align-items: start;
  }

  .hero-panel__copy {
    grid-column: 1;
  }

  .hero-panel__actions {
    grid-column: 2;
  }

  .hero-panel__metrics,
  .framework-switcher {
    grid-column: 1 / -1;
  }

  .panel-card--samples .sample-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .stream-summary {
    align-items: center;
  }

  .stream-summary__row--dense {
    flex: 1 1 auto;
  }

  .control-actions--stream-bar {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .control-stack--stream {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }

  .control-stack--stream .control-note,
  .control-stack--stream .toggle-grid {
    grid-column: 1 / -1;
  }

  .control-stack--stream .toggle-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .control-stack--sandbox {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  .control-stack--sandbox .segmented-control,
  .control-stack--sandbox .preset-list,
  .control-stack--sandbox .toggle-item {
    grid-column: 1 / -1;
  }

  .panel-card--sandbox .meta-list {
    grid-template-columns: 1fr;
  }
}

/* ─── Tablet (<=1180px) ─── */
@media (max-width: 1180px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .hero-panel__action-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .control-actions--stream-bar,
  .panel-card--samples .sample-list,
  .control-stack--stream,
  .control-stack--sandbox {
    grid-template-columns: 1fr;
  }

  .stream-summary__row--dense {
    flex-basis: 100%;
  }

  .control-stack--stream .toggle-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel-card--sandbox .meta-list {
    grid-template-columns: 1fr;
  }
}

/* ─── Mobile (<=820px) ─── */
@media (max-width: 820px) {
  .test-lab {
    --workspace-pane-height: clamp(420px, 68vh, 680px);
    padding: 16px 12px 28px;
  }

  .test-lab--share-preview {
    padding: 0;
  }

  .hero-panel,
  .panel-card,
  .workspace-card {
    border-radius: 16px;
  }

  .hero-panel {
    padding: 20px 16px;
  }

  .settings-dialog {
    width: calc(100vw - 20px);
    max-height: calc(100vh - 20px);
  }

  .settings-dialog__panel {
    padding: 16px;
    border-radius: 16px;
  }

  .hero-panel__metrics,
  .framework-switcher,
  .control-actions,
  .hero-panel__action-row {
    grid-template-columns: 1fr;
  }

  .settings-dialog__head {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace-card {
    min-height: 640px;
  }

  .editor-shell {
    padding: 12px;
  }

  .editor-shell__toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .workspace-card--full,
  .sandbox-frame,
  .sandbox-frame-shell {
    min-height: 540px;
  }

  .editor-textarea,
  .preview-surface {
    min-height: 420px;
  }

  .workspace-card--share-preview {
    min-height: 100vh;
    height: 100vh;
  }

  .preview-immersive-shell {
    min-height: calc(110px + env(safe-area-inset-bottom, 0px));
    padding: 0 12px calc(10px + env(safe-area-inset-bottom, 0px));
  }

  .preview-immersive-toolbar {
    gap: 6px;
    padding: 8px 10px;
  }

  .preview-annotation-toolbar {
    justify-content: flex-start;
  }

  .workspace-card--share-preview .preview-surface {
    padding: 20px 16px max(176px, calc(152px + env(safe-area-inset-bottom, 0px)));
  }

  .workspace-card--preview:fullscreen .preview-surface {
    padding: 20px 16px max(184px, calc(158px + env(safe-area-inset-bottom, 0px)));
  }

  .preview-immersive-toolbar__button {
    padding-inline: 12px;
  }

  .preview-annotation-text-editor {
    width: min(220px, calc(100vw - 48px));
  }

  .workspace-card__head-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .meta-list__row {
    flex-direction: column;
    align-items: flex-start;
  }

  .meta-list__row strong {
    max-width: 100%;
    text-align: left;
  }
}

@media (hover: none) {
  .preview-immersive-toolbar {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
}
</style>
