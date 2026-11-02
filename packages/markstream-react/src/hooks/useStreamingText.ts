import { createStreamingTextDom, createStreamingTextScope } from 'markstream-core'
import { useContext, useLayoutEffect, useRef } from 'react'
import { TextFinalContext } from '../context/textFinal'

export function useStreamingText(content: string, fade: boolean, final: boolean | undefined, persisted: string | undefined, active = true) {
  const scope = useContext(TextFinalContext)
  const localScope = useRef(createStreamingTextScope(work => work())).current
  const host = useRef<HTMLElement | null>(null)
  const initial = useRef(content).current
  const binding = useRef<ReturnType<typeof createStreamingTextDom> | null>(null)
  useLayoutEffect(() => {
    if (!active || !host.current)
      return
    binding.current ??= createStreamingTextDom(host.current, initial, scope ?? localScope)
    binding.current.resume()
    return () => binding.current?.dispose()
  }, [active, scope, localScope, initial])
  useLayoutEffect(() => {
    if (!scope)
      localScope.setFinal(final === true)
    if (active)
      binding.current?.update(content, fade, persisted)
  }, [content, fade, final, persisted, active, scope, localScope])
  return { host, initial }
}
