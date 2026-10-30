import type { JSX } from 'solid-js'
import type { NodeComponentProps } from '../customComponents'
import { createEffect, createMemo, createSignal, onCleanup, onMount, sharedConfig, Show, untrack } from 'solid-js'
import { Dynamic, isServer } from 'solid-js/web'
import { useSafeI18n } from '../i18n/useSafeI18n'
import { getKatex } from '../optional/katex'
import { normalizeKaTeXRenderInput } from '../utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../workers/katexWorkerClient'
import { useNodeLifecycle } from './lifecycle'
import { useHeavyNodeVisibility } from './viewport'

export function MathNode(props: NodeComponentProps & { block: boolean }): JSX.Element {
  const { t } = useSafeI18n()
  let root!: HTMLElement
  const source = createMemo(() => normalizeKaTeXRenderInput(String(props.node.content ?? '')))
  const loading = createMemo(() => props.node.loading === true)
  const display = createMemo(() => props.block || props.node.markup === '$$')
  const initialFallback = isServer || !!sharedConfig.context
  const [html, setHtml] = createSignal('')
  const [fallback, setFallback] = createSignal(initialFallback ? String(props.node.raw ?? '') : '')
  const [pending, setPending] = createSignal(!initialFallback)
  const [lockedHeight, setLockedHeight] = createSignal<number>()
  const visible = useHeavyNodeVisibility(props, () => root)
  useNodeLifecycle(props, () => visible() && pending(), () => root)
  onMount(() => {
    createEffect(() => {
      const content = source()
      const isLoading = loading()
      const displayMode = display()
      if (!visible())
        return
      if (!content) {
        setHtml('')
        setFallback(String(props.node.raw ?? ''))
        setPending(false)
        return
      }
      const controller = new AbortController()
      let disposed = false
      if (props.block && untrack(html))
        setLockedHeight(root.getBoundingClientRect().height)
      setPending(true)
      const run = async () => {
        try {
          let rendered: string
          try {
            rendered = await renderKaTeXWithBackpressure(content, displayMode, {
              timeout: props.block ? 3000 : 1500,
              waitTimeout: props.block ? 2000 : 1500,
              maxRetries: 8,
              signal: controller.signal,
            })
          }
          catch (error: any) {
            if (disposed || controller.signal.aborted)
              return
            const initFailure = error?.code === 'WORKER_INIT_ERROR' || error?.fallbackToRenderer
            const unavailable = error?.code === WORKER_BUSY_CODE || error?.code === 'WORKER_TIMEOUT'
            if (!initFailure && !(unavailable && !isLoading))
              throw error
            const katex = await getKatex()
            if (disposed)
              return
            if (!katex)
              throw error
            rendered = katex.renderToString(content, { displayMode, throwOnError: isLoading })
            setKaTeXCache(content, displayMode, rendered)
          }
          if (disposed)
            return
          setHtml(rendered)
          setFallback('')
          if (!isLoading)
            setLockedHeight(undefined)
        }
        catch {
          if (!disposed && (!isLoading || !html())) {
            if (!isLoading)
              setHtml('')
            setFallback(isLoading ? '' : String(props.node.raw ?? ''))
          }
        }
        finally {
          if (!disposed)
            setPending(false)
        }
      }
      const timer = isLoading ? setTimeout(() => void run(), 32) : undefined
      if (!isLoading)
        void run()
      onCleanup(() => {
        disposed = true
        clearTimeout(timer)
        controller.abort()
      })
    })
  })
  const content = () => (
    <Dynamic component={props.block ? 'div' : 'span'} ref={(element: HTMLElement) => root = element} class={props.block ? 'math-block' : 'math-inline-wrapper'} data-markstream-math={props.block ? 'block' : 'inline'} data-markstream-mode={html() ? 'katex' : fallback() ? 'fallback' : 'loading'} data-markstream-pending={pending() ? 'true' : undefined} style={{ 'min-height': lockedHeight() ? `${lockedHeight()}px` : undefined }}>
      <Show when={html()} fallback={<Show when={fallback()} fallback={<Show when={loading() || pending()}><span class={props.block ? 'math-loading-overlay' : 'math-inline__loading'} role="status" aria-label={t('common.loading')}><span class={props.block ? 'math-loading-spinner' : 'math-inline__spinner'} /></span></Show>}><Dynamic component={props.block ? 'pre' : 'span'} class={props.block ? 'math-block__fallback' : 'math-inline math-inline--fallback'}>{fallback()}</Dynamic></Show>}>
        <Dynamic component={props.block ? 'div' : 'span'} class={props.block ? 'math-block__content' : 'math-inline'} innerHTML={html()} />
      </Show>
    </Dynamic>
  )
  return <Show when={props.context} fallback={<div class="markstream-solid" style={{ display: 'contents' }}>{content()}</div>}>{content()}</Show>
}
