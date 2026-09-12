import type { SolidRenderableNode } from '../node-helpers'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import { getString } from '../node-helpers'
import { normalizeKaTeXRenderInput } from '../normalizeKaTeXRenderInput'
import { getKatex } from '../optional-katex'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../workers/katexWorkerClient'

export interface MathNodeProps {
  node: SolidRenderableNode
  useWorker?: boolean
  workerTimeoutMs?: number
}

async function resolveKatexMarkup(
  content: string,
  displayMode: boolean,
  currentLoading: boolean,
  useWorker: boolean,
  workerTimeoutMs?: number,
) {
  if (useWorker) {
    try {
      return await renderKaTeXWithBackpressure(content, displayMode, {
        timeout: workerTimeoutMs ?? (displayMode ? 3000 : 1500),
        waitTimeout: displayMode ? 2000 : 0,
        maxRetries: displayMode ? 1 : 0,
      })
    }
    catch (error: any) {
      const code = error?.code || error?.name
      const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || error?.fallbackToRenderer
      const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
      if (!isWorkerInitFailure && !isBusyOrTimeout)
        return null
    }
  }

  const katex = await getKatex()
  if (!katex)
    return null

  try {
    const html = katex.renderToString(content, {
      throwOnError: currentLoading,
      displayMode,
    })
    setKaTeXCache(content, displayMode, html)
    return html
  }
  catch {
    return null
  }
}

function MathRender(props: MathNodeProps & { display: boolean }) {
  const [host, setHost] = createSignal<HTMLElement>()
  const [loading, setLoading] = createSignal(true)
  let destroyed = false
  let renderVersion = 0
  let hasRenderedOnce = false

  createEffect(() => {
    const target = host()
    const source = getString((props.node as any).content || (props.node as any).markup || (props.node as any).raw)
    const raw = getString((props.node as any).raw || source)
    const nodeLoading = Boolean((props.node as any).loading)
    const displayMode = props.display
    if (!target)
      return
    void (async () => {
      const content = normalizeKaTeXRenderInput(source)
      const version = ++renderVersion
      if (!content) {
        target.textContent = ''
        setLoading(false)
        return
      }
      if (!hasRenderedOnce)
        setLoading(true)
      const html = await resolveKatexMarkup(content, displayMode, nodeLoading, props.useWorker !== false, props.workerTimeoutMs)
      if (destroyed || version !== renderVersion)
        return
      if (html) {
        target.innerHTML = html
        hasRenderedOnce = true
        setLoading(false)
      }
      else if (!nodeLoading) {
        target.textContent = raw || content
        setLoading(false)
      }
    })()
  })

  onCleanup(() => {
    destroyed = true
    renderVersion += 1
  })

  return props.display
    ? (
        <div class="math-block markstream-nested-math-block" data-markstream-katex-managed="1">
          <div ref={setHost as any} class={`markstream-nested-math-block__render${loading() ? ' math-rendering' : ''}`} />
        </div>
      )
    : (
        <span class="math-inline-wrapper markstream-nested-math" data-display="inline" data-markstream-katex-managed="1">
          <span ref={setHost as any} class={`math-inline${loading() ? ' math-inline--hidden' : ''}`} />
          {loading() && (
            <span class="math-inline__loading" role="status" aria-live="polite">
              <span class="math-inline__spinner" aria-hidden="true" />
              <span class="sr-only">Loading</span>
            </span>
          )}
        </span>
      )
}

export const MathInlineNode = (props: MathNodeProps) => <MathRender {...props} display={String((props.node as any).markup || '') === '$$'} />
export const MathBlockNode = (props: MathNodeProps) => <MathRender {...props} display />
