import { createMemo } from 'solid-js'
import { resourceCounts } from '../shared/resourceTracker'

export interface ObservationInput {
  demoId: string
  sourceLength: number
  visibleLength: number
  pendingChars: number
  caughtUp: boolean
  final: boolean
  isStreaming: boolean
  isPaused: boolean
  lastChunkSize: number
  lastDelayMs: number
  codeBlockCount: number
  codeBlockIdentity: string
}

export function ObservationPanel(props: ObservationInput) {
  const resources = createMemo(() => resourceCounts())

  return (
    <details class="observation-panel mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60 p-3 text-xs text-gray-600 dark:text-gray-300" data-observation-panel>
      <summary class="cursor-pointer font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Observation
      </summary>
      <dl class="mt-3 grid grid-cols-2 gap-2">
        <dt>demo</dt>
        <dd data-obs-demo>{props.demoId}</dd>
        <dt>source length</dt>
        <dd data-obs-source-length>{props.sourceLength}</dd>
        <dt>visible length</dt>
        <dd data-obs-visible-length>{props.visibleLength}</dd>
        <dt>pendingChars</dt>
        <dd data-obs-pending>{props.pendingChars}</dd>
        <dt>caughtUp</dt>
        <dd data-obs-caught-up>{String(props.caughtUp)}</dd>
        <dt>final</dt>
        <dd data-obs-final>{String(props.final)}</dd>
        <dt>streaming</dt>
        <dd data-obs-streaming>{props.isStreaming ? (props.isPaused ? 'paused' : 'yes') : 'no'}</dd>
        <dt>last chunk</dt>
        <dd>
          {props.lastChunkSize}
          {' '}
          /
          {' '}
          {props.lastDelayMs}
          ms
        </dd>
        <dt>code blocks</dt>
        <dd data-obs-code-count>{props.codeBlockCount}</dd>
        <dt>code identity</dt>
        <dd data-obs-code-identity>{props.codeBlockIdentity}</dd>
        <dt>timeouts</dt>
        <dd data-obs-timeouts>{resources().timeouts}</dd>
        <dt>rAF</dt>
        <dd data-obs-rafs>{resources().rafs}</dd>
        <dt>observers</dt>
        <dd data-obs-observers>{resources().observers}</dd>
        <dt>subscriptions</dt>
        <dd data-obs-subscriptions>{resources().subscriptions}</dd>
      </dl>
    </details>
  )
}
