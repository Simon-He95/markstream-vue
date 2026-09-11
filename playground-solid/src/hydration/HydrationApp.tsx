import { NodeRenderer } from 'markstream-solid'
import { createSignal } from 'solid-js'

export const HYDRATION_FIXTURE_MARKDOWN = '# Server rendered Solid\n\nHydration keeps this heading.'
export const HYDRATION_APPEND = '\n\nClient append after hydrate.'

export function HydrationApp() {
  const [content, setContent] = createSignal(HYDRATION_FIXTURE_MARKDOWN)
  const [isDark, setIsDark] = createSignal(false)

  return (
    <div class="markstream-solid" data-hydration-root data-theme={isDark() ? 'dark' : 'light'}>
      <div data-hydration-toolbar>
        <button type="button" data-hydration-append onClick={() => setContent(value => `${value}${HYDRATION_APPEND}`)}>
          Append
        </button>
        <button type="button" data-hydration-theme onClick={() => setIsDark(value => !value)}>
          Theme
        </button>
      </div>
      <NodeRenderer content={content()} final isDark={isDark()} />
    </div>
  )
}
