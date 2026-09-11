import { createMemo } from 'solid-js'
import { RESOURCE_COVERAGE, resourceCounts } from '../shared/resourceTracker'

export interface ObservationInput {
  demoId: string
  sourceLength: number
  transportedLength: number
  rendererInputLength: number
  pendingTransportChars: number
  transportComplete: boolean
  transportPaused: boolean
  stopRevealedFullSource: boolean
  isStreaming: boolean
  lastChunkSize: number
  lastDelayMs: number
  codeBlockCount: number
  codeBlockIdentity: string
  displayNote: string
}

export function ObservationPanel(props: ObservationInput) {
  const resources = createMemo(() => resourceCounts())
  const transportState = () => {
    if (props.transportPaused)
      return 'paused'
    if (props.stopRevealedFullSource)
      return 'stopped-full-source'
    if (props.transportComplete)
      return 'complete'
    if (props.isStreaming)
      return 'streaming'
    return 'idle'
  }

  return (
    <details class="observation-panel mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60 p-3 text-xs text-gray-600 dark:text-gray-300" data-observation-panel>
      <summary class="cursor-pointer font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Observation
      </summary>
      <p class="mt-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400" data-obs-display-note>
        {props.displayNote}
      </p>
      <dl class="mt-3 grid grid-cols-2 gap-2">
        <dt>demo</dt>
        <dd data-obs-demo>{props.demoId}</dd>
        <dt>source length</dt>
        <dd data-obs-source-length>{props.sourceLength}</dd>
        <dt>transported length</dt>
        <dd data-obs-transported-length>{props.transportedLength}</dd>
        <dt>renderer input length</dt>
        <dd data-obs-renderer-input-length>{props.rendererInputLength}</dd>
        <dt>pending transport chars</dt>
        <dd data-obs-pending>{props.pendingTransportChars}</dd>
        <dt>transport state</dt>
        <dd data-obs-transport-state>{transportState()}</dd>
        <dt>transport complete</dt>
        <dd data-obs-transport-complete>{String(props.transportComplete)}</dd>
        <dt>paused</dt>
        <dd data-obs-paused>{String(props.transportPaused)}</dd>
        <dt>stop revealed full source</dt>
        <dd data-obs-stop-reveal>{String(props.stopRevealedFullSource)}</dd>
        <dt>streaming</dt>
        <dd data-obs-streaming>{props.isStreaming ? (props.transportPaused ? 'paused' : 'yes') : 'no'}</dd>
        <dt>last chunk</dt>
        <dd>
          {props.lastChunkSize}
          {' '}
          /
          {' '}
          {props.lastDelayMs}
          ms
        </dd>
        <dt>code-block DOM shells</dt>
        <dd data-obs-code-count>{props.codeBlockCount}</dd>
        <dt>code-block DOM identity</dt>
        <dd data-obs-code-identity>{props.codeBlockIdentity}</dd>
        <dt>app timeouts (tracked)</dt>
        <dd data-obs-timeouts>{resources().timeouts}</dd>
        <dt>app rAF (tracked)</dt>
        <dd data-obs-rafs>{resources().rafs}</dd>
        <dt>app observers (tracked)</dt>
        <dd data-obs-observers>{resources().observers}</dd>
        <dt>subscriptions</dt>
        <dd data-obs-subscriptions data-obs-coverage={RESOURCE_COVERAGE.subscriptions}>uncovered</dd>
        <dt>workers / editor runtimes</dt>
        <dd data-obs-runtimes data-obs-coverage={RESOURCE_COVERAGE.codeBlockRuntimes}>uncovered</dd>
      </dl>
    </details>
  )
}
