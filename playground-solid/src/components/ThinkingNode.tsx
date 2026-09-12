import type { JSX } from 'solid-js'
import { NodeRenderer } from 'markstream-solid'
import { PLAYGROUND_CUSTOM_HTML_TAGS } from '../shared/markstreamPlayground'

interface ThinkingNodeData {
  type: 'thinking'
  content: string
  loading?: boolean
  attrs?: Array<{ name: string, value: string | boolean }>
}

export interface ThinkingNodeProps {
  node?: ThinkingNodeData
  children?: JSX.Element
  ctx?: {
    customId?: string
    isDark?: boolean
    typewriter?: boolean
    customComponents?: Record<string, unknown>
    codeBlockThemes?: {
      themes?: string | string[]
      darkTheme?: string
      lightTheme?: string
      minWidth?: string | number
      maxWidth?: string | number
    }
    codeBlockProps?: Record<string, unknown>
    codeBlockStream?: boolean
    renderCodeBlocksAsPre?: boolean
  }
  customId?: string
  isDark?: boolean
  typewriter?: boolean
}

function getResolvedNode(props: ThinkingNodeProps): ThinkingNodeData {
  if (props.node)
    return props.node

  return {
    type: 'thinking',
    content: '',
    loading: false,
  }
}

export function ThinkingNode(props: ThinkingNodeProps) {
  const node = () => getResolvedNode(props)
  const dotsClass = () => node().loading ? 'thinking-dots visible' : 'thinking-dots hidden'
  const inheritedCustomId = () => props.customId ?? props.ctx?.customId
  const inheritedIsDark = () => props.isDark ?? props.ctx?.isDark
  const inheritedTypewriter = () => props.typewriter ?? props.ctx?.typewriter ?? true
  const hasStructuredNode = () => Boolean(props.node)

  return (
    <div class="thinking-node p-4 my-4 bg-blue-50 dark:bg-blue-900/40 rounded-md border-l-4 border-blue-400 flex items-start gap-3">
      <div class="flex-shrink-0 mt-1">
        <div class="w-9 h-9 rounded-full bg-blue-200 dark:bg-blue-700 flex items-center justify-center text-blue-700 dark:text-blue-100">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3C7.03 3 3 6.58 3 11c0 1.86.66 3.57 1.77 4.98L4 21l5.2-1.9C10.06 19.35 11 19.5 12 19.5c4.97 0 9-3.58 9-8.5S16.97 3 12 3z"
              stroke="currentColor"
              stroke-width="0.8"
              fill="currentColor"
              opacity="0.9"
            />
          </svg>
        </div>
      </div>
      <div class="flex-1">
        <div class="flex items-baseline gap-3">
          <strong class="text-sm">Thinking</strong>
          <span class="text-xs text-slate-500 dark:text-slate-300">(assistant)</span>
          <span class="ml-2" aria-hidden="true">
            <span class={dotsClass()} aria-hidden="true">
              <span class="dot dot-1" />
              <span class="dot dot-2" />
              <span class="dot dot-3" />
            </span>
          </span>
        </div>
        <div class="mt-1 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
          {node().loading && <span class="sr-only" aria-live="polite">Thinking…</span>}
          <div class="content-area">
            {hasStructuredNode()
              ? (
                  <NodeRenderer
                    content={String(node().content ?? '')}
                    customId={inheritedCustomId()}
                    customComponents={props.ctx?.customComponents as any}
                    customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
                    isDark={inheritedIsDark()}
                    themes={props.ctx?.codeBlockThemes?.themes as any}
                    codeBlockDarkTheme={props.ctx?.codeBlockThemes?.darkTheme as any}
                    codeBlockLightTheme={props.ctx?.codeBlockThemes?.lightTheme as any}
                    codeBlockMinWidth={props.ctx?.codeBlockThemes?.minWidth}
                    codeBlockMaxWidth={props.ctx?.codeBlockThemes?.maxWidth}
                    codeBlockProps={props.ctx?.codeBlockProps as any}
                    codeBlockStream={props.ctx?.codeBlockStream}
                    renderCodeBlocksAsPre={props.ctx?.renderCodeBlocksAsPre}
                    typewriter={inheritedTypewriter()}
                    smoothStreaming="auto"
                    batchRendering={false}
                    maxLiveNodes={0}
                  />
                )
              : props.children}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ThinkingNode
