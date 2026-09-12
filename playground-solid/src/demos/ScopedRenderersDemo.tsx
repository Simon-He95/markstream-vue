import { NodeRenderer } from 'markstream-solid'
import { createSignal, Show } from 'solid-js'
import { ThinkingNode } from '../components/ThinkingNode'
import { SCOPED_SAMPLE } from '../shared/demoSamples'
import { PLAYGROUND_CUSTOM_HTML_TAGS } from '../shared/markstreamPlayground'

const LEFT_ID = 'playground-solid-left'
const RIGHT_ID = 'playground-solid-right'

function LeftThinking(props: any) {
  return (
    <div data-scoped-left>
      <ThinkingNode {...props} />
    </div>
  )
}

function RightMarker(props: any) {
  return (
    <aside data-scoped-right class="p-3 my-3 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-900/30">
      Right scope only:
      {' '}
      {String(props.node?.content ?? '')}
    </aside>
  )
}

export function ScopedRenderersDemo(props: { isDark: boolean, content?: string }) {
  const [showRight, setShowRight] = createSignal(true)

  return (
    <div data-demo="scoped" class="grid gap-4 lg:grid-cols-2">
      <section data-scoped-pane="left">
        <h3 class="text-sm font-semibold mb-2">Left · ThinkingNode</h3>
        <NodeRenderer
          content={props.content ?? SCOPED_SAMPLE}
          isDark={props.isDark}
          customId={LEFT_ID}
          customComponents={{ thinking: LeftThinking }}
          customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
          typewriter={false}
        />
      </section>
      <section data-scoped-pane="right">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold">Right · different mapping</h3>
          <button
            type="button"
            class="px-3 py-1 text-xs rounded-lg bg-slate-200 dark:bg-slate-700"
            data-toggle-right-scope
            onClick={() => setShowRight(value => !value)}
          >
            {showRight() ? 'Unmount right' : 'Mount right'}
          </button>
        </div>
        <Show when={showRight()}>
          <NodeRenderer
            content={props.content ?? SCOPED_SAMPLE}
            isDark={!props.isDark}
            customId={RIGHT_ID}
            customComponents={{ thinking: RightMarker }}
            customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
            typewriter={false}
          />
        </Show>
      </section>
    </div>
  )
}
