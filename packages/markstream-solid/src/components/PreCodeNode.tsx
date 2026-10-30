import type { JSX } from 'solid-js'
import type { NodeComponentProps } from '../customComponents'
import type { CodeBlockOptions, PreCodeNodeProps } from '../types/component-props'
import type { DiffLineMetric } from './preCodeDiffMetrics'
import { buildDiffPreviewPanes, createDiffMatchCache } from 'markstream-core'
import { createEffect, createMemo, createSignal, Index, onCleanup, onMount, Show } from 'solid-js'
import { isDiffCodeBlock } from './codeBlockHeader'
import { measurePreCodeDiffLines } from './preCodeDiffMetrics'
import { resolvePreCodeVisualOptions } from './preCodeVisual'
import { resolveCodeBlockLanguage } from './shared/node-helpers'

export function PreCodeNode(props: PreCodeNodeProps & Omit<NodeComponentProps, 'node'> & {
  codeBlockOptions?: CodeBlockOptions
  class?: string
  style?: JSX.CSSProperties
}): JSX.Element {
  const loading = createMemo(() => props.loading === true || props.node.loading === true)
  const code = createMemo(() => loading() ? props.node.code : props.node.code.replace(/\r\n$|\n$|\r$/, ''))
  const visual = createMemo(() => resolvePreCodeVisualOptions(props.codeBlockOptions ?? props.context?.codeBlockOptions))
  const diff = createMemo(() => isDiffCodeBlock(props.node))
  const cache = createDiffMatchCache()
  const panes = createMemo(() => diff() ? buildDiffPreviewPanes({ ...props.node, loading: loading(), inline: props.diffInline, hideUnchangedRegions: props.diffHideUnchangedRegions, matchCache: cache }) : [])
  const numbers = createMemo(() => Array.from({ length: code().split(/\r\n|\r|\n/).length }, (_, index) => index + 1).join('\n'))
  let root!: HTMLPreElement
  const [metrics, setMetrics] = createSignal<DiffLineMetric[]>([])
  const wrap = createMemo(() => ['pre-wrap', 'break-spaces'].includes(String(props.style?.['white-space'] ?? (visual().overflow === 'wrap' ? 'pre-wrap' : 'pre'))))
  const logicalLines = createMemo(() => {
    const lines = code().split(/(?<=\n)|(?<=\r)(?!\n)/)
    if (code().endsWith('\n'))
      lines.push('')
    return lines
  })
  onMount(() => {
    createEffect(() => {
      panes()
      if (!diff() || props.diffInline || !wrap())
        return
      let frame: number | undefined
      const measure = () => {
        frame = undefined
        setMetrics(previous => measurePreCodeDiffLines(root, previous))
      }
      const schedule = () => {
        if (frame == null)
          frame = requestAnimationFrame(measure)
      }
      const observer = new ResizeObserver(schedule)
      observer.observe(root)
      schedule()
      onCleanup(() => {
        observer.disconnect()
        if (frame != null)
          cancelAnimationFrame(frame)
      })
    })
  })
  const Content = () => (
    <pre ref={root} class={`pre-code markstream-pre language-${resolveCodeBlockLanguage(props.node as any)} ${props.class ?? ''}`} classList={{ 'markstream-pre--line-numbers': !!props.showLineNumbers, 'markstream-pre--diff-preview': diff(), 'markstream-pre--diff-inline': !!props.diffInline }} data-markstream-pre="1" data-markstream-code-loading={loading() ? '1' : undefined} aria-busy={loading()} style={{ 'font-family': visual().fontFamily, 'font-size': `${visual().fontSize}px`, 'line-height': `${visual().lineHeight}px`, 'tab-size': visual().tabSize, 'white-space': visual().overflow === 'scroll' ? 'pre' : 'pre-wrap', 'padding': `${visual().padding}px`, 'max-height': `${visual().maxHeight}px`, '--markstream-pre-line-number-width': `${Math.max(2, String(code().split(/\r\n|\r|\n/).length).length)}ch`, 'min-height': props.reservedHeightPx ? `${props.reservedHeightPx}px` : undefined, ...props.style }}>
      <Show
        when={diff()}
        fallback={(
          <>
            <Show
              when={props.showLineNumbers && wrap()}
              fallback={(
                <>
                  <Show when={props.showLineNumbers}><span class="markstream-pre__line-numbers" aria-hidden="true">{numbers()}</span></Show>
                  <code class={`markstream-pre__code language-${resolveCodeBlockLanguage(props.node as any)}`} translate="no">{code()}</code>
                </>
              )}
            >
              <code class={`markstream-pre__code markstream-pre__code--wrapped language-${resolveCodeBlockLanguage(props.node as any)}`} translate="no"><Index each={logicalLines()}>{(line, index) => <span class="markstream-pre__logical-line" data-line-number={index + 1}>{line()}</span>}</Index></code>
            </Show>
          </>
        )}
      >
        <code class="markstream-pre__diff-code" translate="no">
          <Index each={panes()}>
            {pane => (
              <span class={`markstream-pre__diff-pane ${pane().className}`}>
                <span class="markstream-pre__diff-pane-content">
                  <Index each={pane().lines}>
                    {(line, index) => (
                      <span class={`markstream-pre__diff-line markstream-pre__diff-line--${line().kind}`} style={metrics()[index] && wrap() ? { '--markstream-pre-diff-synced-row-height': `${metrics()[index].rowHeight}px`, '--markstream-pre-diff-content-height': `${pane().key === 'original' ? metrics()[index].originalHeight : metrics()[index].modifiedHeight}px` } : undefined}>
                        <span class="markstream-pre__diff-number" aria-hidden="true">{line().number}</span>
                        <span class="markstream-pre__diff-content">{line().code || '\u200B'}</span>
                      </span>
                    )}
                  </Index>
                </span>
              </span>
            )}
          </Index>
        </code>
      </Show>
    </pre>
  )
  return <Show when={props.context !== undefined} fallback={<div class="markstream-solid" style={{ display: 'contents' }}><Content /></div>}><Content /></Show>
}
