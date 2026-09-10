import type { SolidRenderableNode } from '../node-helpers'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import { getString } from '../node-helpers'
import { normalizeKaTeXRenderInput } from '../normalizeKaTeXRenderInput'
import { getKatex } from '../optional-katex'
import { hasKaTeXWorker, renderKaTeXWithBackpressure } from '../workers/katexWorkerClient'

export interface MathNodeProps {
  node: SolidRenderableNode
  useWorker?: boolean
  workerTimeoutMs?: number
}

function MathRender(props: MathNodeProps & { display: boolean }) {
  const [host, setHost] = createSignal<HTMLElement>()
  const [loading, setLoading] = createSignal(true)
  let version = 0
  let activeRequest: AbortController | undefined
  createEffect(() => {
    const target = host()
    const source = normalizeKaTeXRenderInput(getString((props.node as any).content || (props.node as any).markup || (props.node as any).raw))
    const raw = getString((props.node as any).raw || source)
    const nodeLoading = Boolean((props.node as any).loading)
    if (!target)
      return
    const token = ++version
    activeRequest?.abort()
    const request = new AbortController()
    activeRequest = request
    if (!source) {
      target.textContent = ''
      setLoading(false)
      return
    }

    setLoading(true)
    void (async () => {
      try {
        let html = ''
        if (props.useWorker !== false && hasKaTeXWorker()) {
          try {
            html = await renderKaTeXWithBackpressure(source, props.display, {
              signal: request.signal,
              timeout: props.workerTimeoutMs,
            })
          }
          catch (error: any) {
            if (error?.name === 'AbortError')
              return
          }
        }
        if (!html) {
          const katex = await getKatex()
          if (token !== version || request.signal.aborted)
            return
          html = katex?.renderToString(source, { throwOnError: nodeLoading, displayMode: props.display }) || ''
        }
        if (token !== version || request.signal.aborted)
          return
        if (html)
          target.innerHTML = html
        else if (!nodeLoading)
          target.textContent = raw || source
      }
      catch {
        if (token === version && !request.signal.aborted && !nodeLoading)
          target.textContent = raw || source
      }
      finally {
        if (token === version && !request.signal.aborted)
          setLoading(false)
      }
    })()
  })
  onCleanup(() => {
    version += 1
    activeRequest?.abort()
  })
  return props.display
    ? <div class="math-block markstream-nested-math-block" data-markstream-katex-managed="1"><div ref={setHost as any} class={`markstream-nested-math-block__render${loading() ? ' math-rendering' : ''}`} /></div>
    : (
        <span class="math-inline-wrapper markstream-nested-math" data-display="inline" data-markstream-katex-managed="1">
          <span ref={setHost as any} class={`math-inline${loading() ? ' math-inline--hidden' : ''}`} />
          {loading() && <span class="math-inline__loading" role="status">Loading</span>}
        </span>
      )
}

export const MathInlineNode = (props: MathNodeProps) => <MathRender {...props} display={String((props.node as any).markup || '') === '$$'} />
export const MathBlockNode = (props: MathNodeProps) => <MathRender {...props} display />
