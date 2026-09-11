import { NodeRenderer, useSmoothMarkdownStream } from 'markstream-solid'
import { createMemo } from 'solid-js'

const SAMPLE = 'The controller enqueues this sentence, then you can pause, resume, finish, flush, or reset.'

export function ControllerDemo(props: { isDark: boolean }) {
  const stream = useSmoothMarkdownStream({
    startDelayMs: 20,
    minCharsPerSecond: 30,
    maxCharsPerSecond: 60,
  })
  const snapshot = createMemo(() => ({
    source: stream.source(),
    visible: stream.visible(),
    pendingChars: stream.pendingChars(),
    caughtUp: stream.caughtUp(),
    final: stream.final(),
  }))

  return (
    <div data-demo="controller" class="space-y-3">
      <p class="text-sm text-gray-600 dark:text-gray-300">
        External
        {' '}
        <code>useSmoothMarkdownStream</code>
        . Renderer duplicate smoothing is off.
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="testlab-btn testlab-btn--primary px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg" data-controller-enqueue onClick={() => stream.enqueue(SAMPLE)}>
          enqueue
        </button>
        <button type="button" class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-sm rounded-lg" data-controller-pause onClick={() => stream.pause()}>pause</button>
        <button type="button" class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-sm rounded-lg" data-controller-resume onClick={() => stream.resume()}>resume</button>
        <button type="button" class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-sm rounded-lg" data-controller-finish onClick={() => stream.finish()}>finish</button>
        <button type="button" class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-sm rounded-lg" data-controller-flush onClick={() => stream.flush()}>flush</button>
        <button type="button" class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-sm rounded-lg" data-controller-reset onClick={() => stream.reset()}>reset</button>
      </div>
      <pre class="text-xs bg-slate-950 text-slate-100 rounded-lg p-3 overflow-x-auto" data-controller-snapshot>
        {`source()=${JSON.stringify(snapshot().source)}
visible()=${JSON.stringify(snapshot().visible)}
pendingChars()=${snapshot().pendingChars}
caughtUp()=${snapshot().caughtUp}
final()=${snapshot().final}`}
      </pre>
      <NodeRenderer
        content={stream.visible()}
        final={stream.final()}
        isDark={props.isDark}
        smoothStreaming={false}
        typewriter={false}
        fade={false}
      />
    </div>
  )
}
