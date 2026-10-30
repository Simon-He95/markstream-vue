import type { NodeComponentProps } from 'markstream-solid'
import { createMemo, createSignal, Show } from 'solid-js'
import { sanitizeImageSrc } from 'stream-markdown-parser'
import { useSafeI18n } from '../../packages/markstream-solid/src/i18n/useSafeI18n'
import '../../playground-shared/pinned-image.css'

export function PinnedImageNode(props: NodeComponentProps) {
  const { t } = useSafeI18n()
  const [loadedSrc, setLoadedSrc] = createSignal('')
  const [failedSrc, setFailedSrc] = createSignal('')
  const src = createMemo(() => sanitizeImageSrc(String(props.node.src ?? '')))
  const loaded = createMemo(() => !!src() && loadedSrc() === src())
  const failed = createMemo(() => !props.node.loading && (!src() || failedSrc() === src()))
  return (
    <span class="pinned-image-node" data-pinned-image-state={failed() ? 'error' : loaded() ? 'loaded' : 'loading'}>
      <Show when={src() && !failed()}>
        <img src={src()} alt={String(props.node.alt ?? props.node.title ?? '')} title={String(props.node.title ?? props.node.alt ?? '')} decoding="async" class="pinned-image-node__img" classList={{ 'is-loaded': loaded() }} onLoad={() => setLoadedSrc(src())} onError={() => setFailedSrc(src())} />
      </Show>
      <Show when={!failed() && !loaded()}><span class="pinned-image-node__placeholder"><span class="pinned-image-node__shimmer" aria-hidden="true" /></span></Show>
      <Show when={failed()}>
        <span class="pinned-image-node__error">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 2h20v10h-2V4H4v9.586l5-5L14.414 14 13 15.414l-4-4-5 5V20h8v2H2z" /></svg>
          {t('image.loadError')}
        </span>
      </Show>
    </span>
  )
}
