import { readonly, shallowRef } from 'vue'
import { getKatex } from '../components/MathInlineNode/katex'

const katexReadyState = shallowRef(false)
let initPromise: Promise<void> | null = null

export function useKatexReady() {
  if (!initPromise) {
    initPromise = getKatex()
      .then((k) => {
        katexReadyState.value = !!k
      })
      .catch(() => {
        katexReadyState.value = false
      })
  }
  return readonly(katexReadyState)
}
